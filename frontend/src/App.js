import React, {useEffect, useRef, useState} from "react";
import "./App.css";

// for the Map
import "leaflet/dist/leaflet.css";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
    useMap
} from "react-leaflet";
import L from "leaflet";

const API_REQUEST_TIMEOUT_MS = 20000;

async function fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("Request timed out after 20 seconds.");
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

// Recenter the map when route points fall outside the current view.
function RouteBoundsUpdater({points}) {
    const map = useMap();

    useEffect(() => {
        const positions = points
            .map((wp) => [Number(wp.lat), Number(wp.lon)])
            .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));

        if (positions.length === 0) return;

        if (positions.length === 1) {
            if (!map.getBounds().contains(positions[0])) {
                map.setView(positions[0], Math.max(map.getZoom(), 6));
            }
            return;
        }
        const routeBounds = L.latLngBounds(positions);
        if (!map.getBounds().contains(routeBounds)) {
            map.fitBounds(routeBounds, {
                padding: [40, 40],
                maxZoom: 8
            });
        }
    }, [map, points]);

    return null;
}

function App() {
    function scrollToRouteMap() {
        routeMapTitleRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    // Download the current weather context as a JSON file.
    function saveWeatherContextJson() {
        const json = JSON.stringify(buildWeatherContext(), null, 2);
        const blob = new Blob([json], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "weather-context.json";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // Open the hidden JSON file input from the visible upload button.
    function openWeatherContextUpload() {
        jsonUploadInputRef.current?.click();
    }

    // Validate uploaded route points before they are used by the table or map.
    function getUploadedRouteError(route) {
        for (let i = 0; i < route.length; i++) {
            const waypoint = route[i];

            if (!waypoint || typeof waypoint !== "object") {
                return `Waypoint ${i + 1} must be an object.`;
            }

            const lat = Number(waypoint.lat);
            const lon = Number(waypoint.lon);

            if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
                return `Waypoint ${i + 1} must include a valid latitude between -90 and 90.`;
            }

            if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
                return `Waypoint ${i + 1} must include a valid longitude between -180 and 180.`;
            }

            if (!waypoint.eta) {
                return `Waypoint ${i + 1} must include an ETA.`;
            }
        }

        return "";
    }

    // Convert optional imported weather values to numbers, preserving blanks as null.
    function parseOptionalNumber(value) {
        if (value === "" || value === null || value === undefined) return null;

        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    // Read an uploaded weather-context JSON file and restore app state from it.
    async function uploadWeatherContextJson(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const weatherContext = JSON.parse(await file.text());

            if (!Array.isArray(weatherContext.route)) {
                setError("Uploaded JSON must include a route array.");
                return;
            }

            const routeError = getUploadedRouteError(weatherContext.route);
            if (routeError) {
                setError(routeError);
                return;
            }

            const importedRoute = weatherContext.route.map((wp) => ({
                eta: wp.eta,
                lat: Number(wp.lat),
                lon: Number(wp.lon),
                temperature_f: parseOptionalNumber(wp.temperature_f),
                wind_speed_mph: parseOptionalNumber(wp.wind_speed_mph),
                wind_direction_deg: parseOptionalNumber(wp.wind_direction_deg),
                humidity_pct: parseOptionalNumber(wp.humidity_pct),
                precipitation_in: parseOptionalNumber(wp.precipitation_in)
            }));
            const importedWaypoints = importedRoute.map((wp) => ({
                lat: wp.lat,
                lon: wp.lon,
                eta: wp.eta
            }));
            const importedForecastText = weatherContext.summary ?? "";

            setVehicleName(weatherContext.vehicleName ?? "");
            setRouteName(weatherContext.routeName ?? "");
            setWaypointsText(JSON.stringify(importedWaypoints, null, 2));
            setWeatherData(importedRoute);
            setForecastText(importedForecastText);
            setWeatherSituationText(importedForecastText);
            setValidationFindings(weatherContext.validation ?? []);
            setError("");
        } catch (err) {
            setError(`Could not upload JSON: ${err.message}`);
        } finally {
            event.target.value = "";
        }
    }

    // Build the weather context object used for JSON export and AI input.
    function buildWeatherContext() {
        return {
            vehicleName,
            routeName,
            summary: forecastText,
            validation: validationFindings,
            peakValues: {
                temperature_f: {min: minTemp, max: maxTemp
                },
                wind_speed_mph: {min: minWind, max: maxWind
                },
                wind_direction_deg: {min: minWindDirection, max: maxWindDirection
                },
                humidity_pct: {min: minHumidity, max: maxHumidity
                },
                precipitation_in: {min: minPrecip, max: maxPrecip
                }
            },
            travelDetails,
            route: weatherData.map((wp, index) => ({
                waypoint: index + 1,
                eta: wp.eta,
                lat: wp.lat,
                lon: wp.lon,
                temperature_f: wp.temperature_f,
                wind_speed_mph: wp.wind_speed_mph,
                wind_direction_deg: wp.wind_direction_deg,
                humidity_pct: wp.humidity_pct,
                precipitation_in: wp.precipitation_in
            }))
        };
    }

    // Refresh only the Weather Situation using the current editable table values.
    async function regenerateWeatherSituation() {
        if (weatherData.length === 0) {
            setError("Run a forecast before regenerating the Weather Situation.");
            return;
        }

        setError("");
        setLoading(true);
        try {
            const response = await fetchWithTimeout("http://localhost:8000/api/v1/summary", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    route: weatherData,
                    vehicle_name: vehicleName,
                    route_name: routeName
                })
            });
            const data = await response.json();
            if (!response.ok) {
                setError(formatForecastError(data));
                return;
            }
            setValidationFindings(data.validation ?? []);
            if (data.summary) {
                setForecastText(data.summary);
                setWeatherSituationText(data.summary);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function regenerateWeatherSituationAndScroll() {
        scrollToRouteMap();
        await regenerateWeatherSituation();
    }


// Placeholder weather report
const placeHolderText = `Example of the "Weather Situation"
THE <VEHICLE NAME> WILL CONTINUE TO TRANSIT BEHIND A COLD FRONT THAT HAS BECOME STATIONARY IN THE <LOCATION>. THE VESSELS WILL EXPERIENCE STEADY NORTHEAST WINDS OF 15-25 KNOTS WITH GUSTS TO 35 KNOTS FOR THE FIRST HALF OF THIS FORECAST.
THE WINDS ARE FORECAST TO DECREASE SLIGHTLY BY THE END OF THE PERIOD. NORTHEAST SEAS OF 10-15 FEET ARE FORECAST TO SLOWLY DECREASE WITH THE FALLING WIND SPEEDS AS THE VESSEL GETS CLOSER TO THE <LOCATION>.
MOSTLY CLOUDY AND COOL CONDITIONS ARE FORECAST BEHIND THE COLD FRONT. WARMING AIR AND SEA TEMPERATURES ARE EXPECTED AS THE VESSEL TRANSITS SOUTHWARD.
AREAS OF SCATTERED LIGHT RAIN AND PARTLY TO MOSTLY CLOUDY SKIES ARE FORECAST THROUGH THE PERIOD.`;

// prefilled waypoints for faster testing
    const sampleWaypoints = `[
  { "lat": 36.85, "lon": -76.30, "eta": "2026-07-09T12:00:00Z" },
  { "lat": 36.20, "lon": -76.55, "eta": "2026-07-09T18:00:00Z" },
  { "lat": 35.65, "lon": -76.90, "eta": "2026-07-10T00:00:00Z" },
  { "lat": 35.10, "lon": -77.20, "eta": "2026-07-10T06:00:00Z" },
  { "lat": 34.55, "lon": -77.45, "eta": "2026-07-10T12:00:00Z" }
]`;
    const [waypointsText, setWaypointsText] = useState(sampleWaypoints);
    const [weatherData, setWeatherData] = useState([]);
    const [forecastText, setForecastText] = useState(placeHolderText);
    const [weatherSituationText, setWeatherSituationText] = useState(placeHolderText);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [validationFindings, setValidationFindings] = useState([]);
    const [vehicleName, setVehicleName] = useState("Borealis");
    const [routeName, setRouteName] = useState("Kessel Run");
    const jsonUploadInputRef = useRef(null);
    const routeMapTitleRef = useRef(null);
    const weatherSituationTextAreaRef = useRef(null);

    const {min: minTemp, max: maxTemp} = getMinMax("temperature_f");
    const {min: minWind, max: maxWind} = getMinMax("wind_speed_mph");
    const {min: minWindDirection, max: maxWindDirection} = getMinMax("wind_direction_deg");
    const {min: minHumidity, max: maxHumidity} = getMinMax("humidity_pct");
    const {min: minPrecip, max: maxPrecip} = getMinMax("precipitation_in");

    const travelDetails = getTravelDetails();

    // Find the min and max values for one weather field across the route.
    function getMinMax(field) {
        const values = weatherData
            .map(wp => wp[field])
            .filter(value => value !== null && value !== undefined && !Number.isNaN(value));
        if (values.length === 0) {
            return {
                min: "N/A",
                max: "N/A"
            };
        }

        return {
            min: Math.min(...values),
            max: Math.max(...values)
        };
    }

    // Update one editable weather table cell while keeping numeric fields numeric.
    function updateWeatherCell(index, field, value) {
        const number = Number(value);
        const numericValue =
            value === "" || Number.isNaN(number)
                ? null
                : number;
        setWeatherData(prev =>
            prev.map((wp, i) =>
                i === index
                    ? {
                        ...wp,
                        [field]: numericValue
                    }
                    : wp
            )
        );
    }

    // Convert unknown error values to text
    function errorValueToText(value) {
        if (value === null || value === undefined) return "";
        if (typeof value !== "object") return String(value);

        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    // Remove backend validation prefixes that are not useful to the user.
    function cleanErrorMessage(message) {
        return errorValueToText(message).replace(/^Value error,\s*/i, "");
    }

    // Convert API error responses into display-ready message text.
    function formatForecastError(data) {
        if (Array.isArray(data?.detail)) {
            return data.detail
                .map((errorItem) => cleanErrorMessage(errorItem.msg ?? errorItem.message ?? errorItem))
                .join("\n");
        }

        if (data?.detail) {
            return cleanErrorMessage(data.detail);
        }

        if (data?.msg || data?.message || data?.error) {
            return cleanErrorMessage(data.msg ?? data.message ?? data.error);
        }

        if (data && typeof data === "object") {
            return cleanErrorMessage(data);
        }

        return "Forecast request failed.";
    }

    // Submit waypoints to the forecast API and load returned route weather data.
    async function runForecast() {
        setError("");
        setLoading(true);
        try {
            const waypoints = JSON.parse(waypointsText);
            const response = await fetchWithTimeout("http://localhost:8000/api/v1/forecast", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    waypoints: waypoints,
                    vehicle_name: vehicleName,
                    route_name: routeName
                })
            });
            const data = await response.json();
            if (!response.ok) {
                setError(formatForecastError(data));
                setWeatherData([]);
                setValidationFindings([]);
                return;
            }
            setWeatherData(data.route);
            setValidationFindings(data.validation ?? []);
            if (data.summary) {
                setForecastText(data.summary);
                setWeatherSituationText(data.summary);
            }
        } catch (err) {
            setError(err.message);
            setWeatherData([]);
            setValidationFindings([]);
        } finally {
            setLoading(false);
        }
    }

    // Formats min/max to prevent "7-7"
    const formatRange = (min, max) => {
        if (min === "N/A" || max === "N/A") return "N/A";
        return min === max ? `${min}` : `${min} - ${max}`;
    };

    // Convert a wind bearing in degrees into an arrow/cardinal readout.
    function getWindDirectionDisplay(value) {
        if (value === null || value === undefined || value === "") {
            return {
                isAvailable: false,
                label: "N/A",
                degrees: "N/A",
                rotation: 0
            };
        }

        const number = Number(value);
        if (!Number.isFinite(number) || number < 0 || number > 360) {
            return {
                isAvailable: false,
                label: "N/A",
                degrees: "N/A",
                rotation: 0
            };
        }

        const normalized = ((number % 360) + 360) % 360;
        const labels = [
            "N",
            "NNE",
            "NE",
            "ENE",
            "E",
            "ESE",
            "SE",
            "SSE",
            "S",
            "SSW",
            "SW",
            "WSW",
            "W",
            "WNW",
            "NW",
            "NNW"
        ];
        const label = labels[Math.round(normalized / 22.5) % labels.length];

        return {
            isAvailable: true,
            label,
            degrees: `${Math.round(normalized)}°`,
            rotation: normalized
        };
    }

    function formatWindDirection(value) {
        const direction = getWindDirectionDisplay(value);
        if (!direction.isAvailable) return "N/A";

        return `${direction.label} (${direction.degrees})`;
    }

    function shouldShowWindDirectionReadoutAsNA(value) {
        return value === null || value === undefined || value === "" || isZeroWindValue(value);
    }

    function isMissingWindSpeed(value) {
        return value === null || value === undefined || value === "";
    }

    function isZeroWindValue(value) {
        if (value === null || value === undefined || value === "") {
            return false;
        }

        const number = Number(value);
        return Number.isFinite(number) && number === 0;
    }

    function isAbsentWindSpeedForMap(value) {
        if (isMissingWindSpeed(value)) {
            return true;
        }

        const number = Number(value);
        return !Number.isFinite(number) || number === 0;
    }

    function isAbsentWindDirectionForMap(value) {
        if (isZeroWindValue(value)) {
            return true;
        }

        return !getWindDirectionDisplay(value).isAvailable;
    }

    function shouldHideWindMapMarker(windSpeed, windDirection) {
        return (
            isAbsentWindSpeedForMap(windSpeed) &&
            isAbsentWindDirectionForMap(windDirection)
        );
    }

    function shouldUseWindMapDot(windSpeed, windDirection) {
        return (
            !isAbsentWindSpeedForMap(windSpeed) &&
            isAbsentWindDirectionForMap(windDirection)
        );
    }

    function getWindBarbKnots(value) {
        if (isAbsentWindSpeedForMap(value)) {
            return 0;
        }

        const speedMph = Number(value);
        if (!Number.isFinite(speedMph) || speedMph <= 0) {
            return 0;
        }

        const roundedKnots = Math.round((speedMph * 0.868976) / 5) * 5;
        return Math.max(5, roundedKnots);
    }

    function getWindBarbSegments(value) {
        const knots = getWindBarbKnots(value);
        let remaining = knots;

        const pennants = Math.floor(remaining / 50);
        remaining %= 50;

        const fullBarbs = Math.floor(remaining / 10);
        remaining %= 10;

        const halfBarbs = Math.floor(remaining / 5);

        return {
            knots,
            pennants,
            fullBarbs,
            halfBarbs,
            mode: knots > 0 ? "feathered" : "staff-only"
        };
    }

    function getWaypointWindMarkerState(windSpeed, windDirection) {
        if (shouldHideWindMapMarker(windSpeed, windDirection)) {
            return "circle-only";
        }

        if (shouldUseWindMapDot(windSpeed, windDirection)) {
            return "dot";
        }

        return "barb";
    }

    function getWaypointWindMarkerLayout(markerState, segments) {
        const width = 56;
        const circleRadius = 19;
        const circlePaddingBottom = 4;
        const circleCenterX = width / 2;
        const circleCenterYBaseOffset = circleRadius + circlePaddingBottom;

        if (markerState === "circle-only") {
            const height = circleRadius * 2 + circlePaddingBottom * 2;
            return {
                width,
                height,
                circleRadius,
                circleCenterX,
                circleCenterY: height - circleCenterYBaseOffset
            };
        }

        if (markerState === "dot") {
            const dotRadius = 6;
            const dotGap = 8;
            const height =
                circleRadius * 2 +
                circlePaddingBottom * 2 +
                dotRadius * 2 +
                dotGap;

            return {
                width,
                height,
                circleRadius,
                circleCenterX,
                circleCenterY: height - circleCenterYBaseOffset,
                dotRadius,
                dotCenterY:
                    height -
                    circleCenterYBaseOffset -
                    circleRadius -
                    dotGap
            };
        }

        const topPadding = 6;
        const baseStaffLength = 26;
        const staffLength =
            baseStaffLength + Math.round(Math.sqrt(segments.knots) * 3.5);
        const height =
            circleRadius * 2 +
            circlePaddingBottom * 2 +
            staffLength +
            topPadding;
        const circleCenterY = height - circleCenterYBaseOffset;
        const staffBaseY = circleCenterY - circleRadius + 1;
        const staffTopY = staffBaseY - staffLength;

        return {
            width,
            height,
            circleRadius,
            circleCenterX,
            circleCenterY,
            staffX: circleCenterX,
            staffBaseY,
            staffTopY,
            staffLength,
            outerX: width - 10
        };
    }

    function renderWaypointWindMarkerSvg(markerState, layout, segments) {
        const markup = [];

        markup.push(
            `<circle class="wind-map-waypoint-circle-shape" cx="${layout.circleCenterX}" cy="${layout.circleCenterY}" r="${layout.circleRadius}" />`
        );

        if (markerState === "dot") {
            markup.push(
                `<circle class="wind-map-waypoint-direction-dot" cx="${layout.circleCenterX}" cy="${layout.dotCenterY}" r="${layout.dotRadius}" />`
            );
        }

        if (markerState === "barb") {
            markup.push(
                `<line class="wind-map-waypoint-barb-staff" x1="${layout.staffX}" y1="${layout.staffBaseY}" x2="${layout.staffX}" y2="${layout.staffTopY}" />`
            );

            let currentY = layout.staffTopY + 2;

            for (let index = 0; index < segments.pennants; index++) {
                markup.push(
                    `<polygon class="wind-map-waypoint-barb-pennant" points="${layout.staffX},${currentY} ${layout.outerX},${currentY + 4} ${layout.staffX},${currentY + 8}" />`
                );
                currentY += 8;
            }

            for (let index = 0; index < segments.fullBarbs; index++) {
                markup.push(
                    `<line class="wind-map-waypoint-barb-feather" x1="${layout.staffX}" y1="${currentY}" x2="${layout.outerX}" y2="${currentY + 5}" />`
                );
                currentY += 6;
            }

            if (segments.halfBarbs > 0) {
                markup.push(
                    `<line class="wind-map-waypoint-barb-feather" x1="${layout.staffX}" y1="${currentY}" x2="${layout.staffX + 11}" y2="${currentY + 4}" />`
                );
            }
        }

        return `
            <svg class="wind-map-waypoint-symbol-svg" viewBox="0 0 ${layout.width} ${layout.height}" aria-hidden="true">
                ${markup.join("")}
            </svg>
        `;
    }

    // Convert degrees to radians for distance calculations.
    function toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    // Calculate the mileage between two lat/lon coordinates.
    function getDistanceMiles(lat1, lon1, lat2, lon2) {
        const earthRadiusMiles = 3958.8;

        const dLat = toRadians(lat2 - lat1);
        const dLon = toRadians(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRadians(lat1)) *
            Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) ** 2;

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadiusMiles * c;
    }

    // Calculate total route duration and distance from the current route points.
    function getTravelDetails() {
        if (weatherData.length < 2) {
            return {
                travelTime: "N/A",
                travelDistance: "N/A"
            };
        }
        const start = new Date(weatherData[0].eta);
        const end = new Date(weatherData[weatherData.length - 1].eta);
        const hours = Math.abs(end - start) / (1000 * 60 * 60);
        let totalMiles = 0;
        for (let i = 1; i < weatherData.length; i++) {
            totalMiles += getDistanceMiles(
                weatherData[i - 1].lat,
                weatherData[i - 1].lon,
                weatherData[i].lat,
                weatherData[i].lon
            );
        }
        return {
            travelTime: `${hours.toFixed(1)} hrs`,
            travelDistance: `${totalMiles.toFixed(1)} mi`
        };
    }
    function createWaypointWindMarkerIcon(
        waypointNumber,
        windDirection,
        windSpeed,
        windDirectionValue
    ) {
        const markerState = getWaypointWindMarkerState(windSpeed, windDirectionValue);
        const segments = markerState === "barb" ? getWindBarbSegments(windSpeed) : null;
        const layout = getWaypointWindMarkerLayout(markerState, segments);

        let title = `Waypoint ${waypointNumber}`;
        if (markerState === "barb") {
            title = isAbsentWindSpeedForMap(windSpeed)
                ? `Waypoint ${waypointNumber}: wind direction ${windDirection.label}, speed unavailable`
                : `Waypoint ${waypointNumber}: wind ${windSpeed} mph from ${windDirection.label}`;
        } else if (markerState === "dot") {
            title = `Waypoint ${waypointNumber}: wind direction unavailable`;
        } else if (markerState === "circle-only") {
            title = `Waypoint ${waypointNumber}: wind unavailable`;
        }

        return L.divIcon({
            className: "waypoint-wind-map-icon",
            html: `
            <div
                class="wind-map-waypoint-marker"
                data-marker-state="${markerState}"
                data-waypoint-number="${waypointNumber}"
                ${
                    markerState === "barb"
                        ? `
                data-barb-mode="${segments.mode}"
                data-barb-knots="${segments.knots}"
                data-barb-pennants="${segments.pennants}"
                data-barb-full-barbs="${segments.fullBarbs}"
                data-barb-half-barbs="${segments.halfBarbs}"
                data-barb-rotation="${windDirection.rotation}"
                data-barb-staff-length="${layout.staffLength}"
                `
                        : ""
                }
                title="${title}"
                style="width:${layout.width}px;height:${layout.height}px;"
            >
                <div
                    class="wind-map-waypoint-symbol-layer ${markerState === "barb" ? "with-rotation" : ""}"
                    style="${
                        markerState === "barb"
                            ? `transform: rotate(${windDirection.rotation}deg); transform-origin: ${layout.circleCenterX}px ${layout.circleCenterY}px;`
                            : ""
                    }"
                >
                    ${renderWaypointWindMarkerSvg(markerState, layout, segments)}
                </div>
                <span
                    class="wind-map-waypoint-number"
                    style="left:${layout.circleCenterX}px; top:${layout.circleCenterY}px;"
                >
                    ${waypointNumber}
                </span>
            </div>
        `,
            iconSize: [layout.width, layout.height],
            iconAnchor: [layout.circleCenterX, layout.circleCenterY],
            popupAnchor: [0, -layout.circleRadius]
        });
    }

    function renderWeatherSituationActions({
        regenerateOnClick = regenerateWeatherSituation,
        actionClassName = "",
        marginTop = "12px"
    } = {}) {
        return (
            <div
                className={`weather-situation-actions ${actionClassName}`.trim()}
                style={{marginTop}}
            >
                <button
                    className="weather-situation-action-button"
                    onClick={regenerateOnClick}
                >
                    Regenerate<br />
                    Weather Situation
                </button>

                <button
                    className="weather-situation-action-button"
                    onClick={saveWeatherContextJson}
                >
                    Download<br />
                    JSON
                </button>
            </div>
        );
    }

    function renderWaypointsWeatherTable() {
        if (weatherData.length === 0) return null;

        return (
            <div className="card waypoint-weather-table-card">
                <div className="waypoint-weather-table-content">
                    <table className="waypoint-weather-table" border="1" cellPadding="8">
                        <thead>
                        <tr>
                            <th>Waypoint #</th>
                            <th>ETA</th>
                            <th>Lat</th>
                            <th>Lon</th>
                            <th>🌡 Temp °F</th>
                            <th>💨 Wind MPH</th>
                            <th>↗ Wind Dir °</th>
                            <th>💧 Humidity %</th>
                            <th>🌧 Precipitation</th>
                        </tr>
                        </thead>
                        <tbody>
                        {weatherData.map((wp, index) => {
                            const windDirection = getWindDirectionDisplay(wp.wind_direction_deg);
                            const showWindDirectionReadoutAsNA = shouldShowWindDirectionReadoutAsNA(
                                wp.wind_direction_deg
                            );
                            const showWindDirectionArrow = windDirection.isAvailable && !showWindDirectionReadoutAsNA;

                            return (
                                <tr key={index}>
                                    <td>WP-{index + 1}</td>
                                    <td>{wp.eta}</td>
                                    <td>{wp.lat}</td>
                                    <td>{wp.lon}</td>
                                    <td>
                                        <input
                                            type="number"
                                            value={wp.temperature_f ?? ""}
                                            onChange={(e) =>
                                                updateWeatherCell(index, "temperature_f", e.target.value)
                                            }
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            value={wp.wind_speed_mph ?? ""}
                                            onChange={(e) =>
                                                updateWeatherCell(index, "wind_speed_mph", e.target.value)
                                            }
                                        />
                                    </td>
                                    <td>
                                        <div className="wind-direction-cell">
                                            <input
                                                type="number"
                                                min="0"
                                                max="360"
                                                step="1"
                                                value={wp.wind_direction_deg ?? ""}
                                                aria-label={`Wind direction for waypoint ${index + 1}`}
                                                onChange={(e) =>
                                                    updateWeatherCell(index, "wind_direction_deg", e.target.value)
                                                }
                                            />
                                            <div
                                                className={`wind-direction-readout ${
                                                    showWindDirectionArrow ? "" : "missing"
                                                }`}
                                                title={
                                                    showWindDirectionArrow
                                                        ? `Wind direction ${windDirection.label}`
                                                        : "Wind direction unavailable"
                                                }
                                            >
                                                {showWindDirectionArrow ? (
                                                    <>
                                                        <span
                                                            className="wind-direction-arrow"
                                                            style={{
                                                                transform: `rotate(${windDirection.rotation}deg)`
                                                            }}
                                                            aria-hidden="true"
                                                        >
                                                            ↑
                                                        </span>
                                                        <span className="wind-direction-cardinal">
                                                            {windDirection.label}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span
                                                        className="wind-direction-unknown"
                                                        aria-label="Wind direction unavailable"
                                                    >
                                                        {showWindDirectionReadoutAsNA ? "N/A" : "?"}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            value={wp.humidity_pct ?? ""}
                                            onChange={(e) =>
                                                updateWeatherCell(index, "humidity_pct", e.target.value)
                                            }
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            value={wp.precipitation_in ?? ""}
                                            onChange={(e) =>
                                                updateWeatherCell(index, "precipitation_in", e.target.value)
                                            }
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                    {renderWeatherSituationActions({
                        regenerateOnClick: regenerateWeatherSituationAndScroll,
                        actionClassName: "waypoint-table-actions",
                        marginTop: "16px"
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="page">
            <h1>USNRL Weather Router</h1>
            <div className="card">
                <div className="card-header">
                    <h2>Inputs</h2>
                </div>

                <div style={{
                    padding: "20px",
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr",
                    gap: "20px"
                }}>
                    {/* Inputs Left side*/}
                    <div>
                        <label
                            style={{
                                display: "block",
                                marginBottom: "6px",
                                fontWeight: "bold"
                            }}
                        >
                            Waypoints
                        </label>
                        {/* Waypoint Input */}
                        <textarea
                            value={waypointsText}
                            onChange={(e) => setWaypointsText(e.target.value)}
                            rows={10}
                            style={{
                                width: "100%",
                                minHeight: "150px"
                            }}
                        />
                    </div>

                    {/* Inputs Right side  */}
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "16px"
                        }}
                    >
                        <div>
                            {/* Input Vehicle Name */}
                            <label
                                style={{
                                    display: "block",
                                    marginBottom: "6px",
                                    fontWeight: "bold"
                                }}
                            >
                                Vehicle Name
                            </label>
                            <input
                                type="text"
                                value={vehicleName}
                                onChange={(e) => setVehicleName(e.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "8px"
                                }}
                            />
                        </div>
                        <div>
                            {/* Input Route Name */}
                            <label
                                style={{
                                    display: "block",
                                    marginBottom: "6px",
                                    fontWeight: "bold"
                                }}
                            >
                                Route Name
                            </label>
                            <input
                                type="text"
                                value={routeName}
                                onChange={(e) => setRouteName(e.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "8px"
                                }}
                            />
                        </div>
                        {/* Input Run Forecast */}
                        <button
                            onClick={runForecast}
                            disabled={loading}
                            style={{
                                marginTop: "10px",
                                padding: "12px",
                                width: "100%"
                            }}
                        >
                            {loading ? "Loading..." : "Run Forecast"}
                        </button>
                        <input
                            ref={jsonUploadInputRef}
                            type="file"
                            accept="application/json,.json"
                            onChange={uploadWeatherContextJson}
                            style={{display: "none"}}
                        />
                        <button
                            onClick={openWeatherContextUpload}
                            style={{
                                marginTop: "10px",
                                padding: "12px",
                                width: "100%"
                            }}
                        >
                            Upload JSON
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <pre style={{color: "red", whiteSpace: "pre-wrap"}}>
          {error}
        </pre>
            )}

            {weatherData.length > 0 && (
                <div className="map-row">
                    <div className="card">
                        {/* Interactive Map */}
                        <div className="card-header">
                            <h2 ref={routeMapTitleRef}>Route Map</h2>
                        </div>

                        <MapContainer
                            center={[weatherData[0].lat, weatherData[0].lon]}
                            zoom={6}
                            style={{height: "500px", width: "100%"}}
                        >
                            <RouteBoundsUpdater points={weatherData}/>

                            <TileLayer
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                attribution="&copy; OpenStreetMap contributors"
                            />

                            <Polyline
                                positions={weatherData.map((wp) => [wp.lat, wp.lon])}
                                color="#26c6da"
                            />

                            {weatherData.map((wp, index) => (
                                <Marker
                                    key={index}
                                    position={[wp.lat, wp.lon]}
                                    icon={createWaypointWindMarkerIcon(
                                        index + 1,
                                        getWindDirectionDisplay(wp.wind_direction_deg),
                                        wp.wind_speed_mph,
                                        wp.wind_direction_deg
                                    )}
                                >
                                    <Popup>
                                        <strong>Waypoint {index + 1}</strong>
                                        <br/>
                                        ETA: {wp.eta}
                                        <br/>
                                        Temp: {wp.temperature_f ?? "N/A"} °F
                                        <br/>
                                        Wind: {wp.wind_speed_mph ?? "N/A"} mph
                                        <br/>
                                        Wind Dir: {formatWindDirection(wp.wind_direction_deg)}
                                        <br/>
                                        Humidity: {wp.humidity_pct ?? "N/A"}%
                                        <br/>
                                        Precipitation: {wp.precipitation_in ?? "N/A"} in
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>
                    </div>

                    {/* Right side cards */}
                    <div className="side-panel">
                        {/* Peak Values Table */}
                        <div className="card peak-card">
                            <div className="card-header">
                                <h2>Peak Values</h2>
                            </div>

                            <div className="peak-grid">
                                <div className="peak-cell">
                                    <div className="peak-label">🌡 Temperature</div>
                                    <div className="peak-value">
                                        {formatRange(minTemp, maxTemp)}
                                    </div>
                                    <div className="peak-sub">Min / Max °F</div>
                                </div>
                                <div className="peak-cell">
                                    <div className="peak-label">💨 Wind</div>
                                    <div className="peak-value">
                                        {formatRange(minWind, maxWind)}
                                    </div>
                                    <div className="peak-sub">Min / Max mph</div>
                                </div>
                                <div className="peak-cell">
                                    <div className="peak-label">💧 Humidity</div>
                                    <div className="peak-value">
                                        {formatRange(minHumidity, maxHumidity)}
                                    </div>
                                    <div className="peak-sub">Min / Max %</div>
                                </div>
                                <div className="peak-cell">
                                    <div className="peak-label">🌧 Precipitation</div>
                                    <div className="peak-value">
                                        {formatRange(minPrecip, maxPrecip)}
                                    </div>
                                    <div className="peak-sub">Min / Max in</div>
                                </div>
                            </div>
                        </div>

                        <div className="card travel-card">
                            <div className="card-header">
                                <h2>Travel Details</h2>
                            </div>

                            <table border="1" cellPadding="8" style={{width: "100%"}}>
                                <tbody>
                                <tr>
                                    <td><strong>Travel Time</strong></td>
                                    <td>{travelDetails.travelTime}</td>
                                </tr>
                                <tr>
                                    <td><strong>Estimated Distance</strong></td>
                                    <td>{travelDetails.travelDistance}</td>
                                </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>


                </div>
            )}
            {weatherData.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <h2>Weather Situation</h2>
                        <span className="badge muted">Editable</span>
                    </div>
                    {/* Weather Situation */}
                    <div style={{padding: "20px"}}>
                        <textarea
                            ref={weatherSituationTextAreaRef}
                            aria-label="Weather Situation"
                            value={weatherSituationText}
                            onChange={(e) => {
                                setWeatherSituationText(e.target.value);
                                setForecastText(e.target.value);
                            }}
                            rows={10}
                            style={{
                                width: "100%",
                                minHeight: "220px"
                            }}
                        />
                        {renderWeatherSituationActions()}
                    </div>
                </div>
            )}
            {validationFindings.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <h2>Validation Findings</h2>
                    </div>
                    <ul style={{padding: "20px", margin: 0}}>
                        {validationFindings.map((finding, index) => (
                            <li key={index}>
                                <strong>{finding.severity}</strong> {finding.field}: {finding.message}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {/* Waypoints Weather Table */}
            {renderWaypointsWeatherTable()}
        </div>
    );
}

export default App;

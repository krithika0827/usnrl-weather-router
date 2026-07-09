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
            const response = await fetch("http://localhost:8000/api/v1/summary", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    route: weatherData
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

    const {min: minTemp, max: maxTemp} = getMinMax("temperature_f");
    const {min: minWind, max: maxWind} = getMinMax("wind_speed_mph");
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
            const response = await fetch("http://localhost:8000/api/v1/forecast", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    waypoints: waypoints
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
    // Create a numbered Leaflet marker icon for each waypoint.
    function createWaypointIcon(number) {
        return L.divIcon({
            className: "",
            html: `
            <div style="
                background:#1e8bc3;
                color:white;
                border-radius:50%;
                width:30px;
                height:30px;
                display:flex;
                justify-content:center;
                align-items:center;
                font-weight:bold;
                border:2px solid white;
            ">
                ${number}
            </div>
        `,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
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

            {/* Waypoints Weather Table */}
            {weatherData.length > 0 && (
                <table border="1" cellPadding="8">
                    <thead>
                    <tr>
                        <th>Waypoint #</th>
                        <th>ETA</th>
                        <th>Lat</th>
                        <th>Lon</th>
                        <th>🌡 Temp °F</th>
                        <th>💨 Wind MPH</th>
                        <th>💧 Humidity %</th>
                        <th>🌧 Precipitation</th>
                    </tr>
                    </thead>
                    <tbody>
                    {weatherData.map((wp, index) => (
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
                    ))}
                    </tbody>
                </table>
            )}
            {weatherData.length > 0 && (
                <div className="map-row">
                    <div className="card">
                        {/* Interactive Map */}
                        <div className="card-header">
                            <h2>Route Map</h2>
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
                                    icon={createWaypointIcon(index + 1)}
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
                        <div style={{display: "flex", justifyContent: "flex-end", marginTop: "12px"}}>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "flex-end",
                                    marginTop: "12px",
                                    gap: "10px"
                                }}
                            >
                                <button
                                    style={{width: "190px", minWidth: "190px"}}
                                    onClick={regenerateWeatherSituation}
                                >
                                    Regenerate<br />
                                    Weather Situation
                                </button>

                                <button
                                    onClick={saveWeatherContextJson}
                                >
                                    Download<br />
                                    JSON
                                </button>

                                <button
                                    style={{width: "auto", padding: "10px 24px"}}
                                    onClick={() => {
                                        console.log("<WIP> Saved forecast text:", forecastText);
                                        alert("<WIP> Forecast text saved.");
                                    }}
                                >
                                    Save 💾
                                </button>
                            </div>
                        </div>
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
        </div>
    );
}

export default App;

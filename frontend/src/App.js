import React, {useState} from "react";
import "./App.css";

// for the Map
import "leaflet/dist/leaflet.css";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline
} from "react-leaflet";
import L from "leaflet";

// Used to create numbered way points on map
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

// prefilled waypoints for faster testing
const sampleWaypoints = `[
  { "lat": 36.85, "lon": -76.30, "eta": "2026-06-08T12:00:00Z" },
  { "lat": 36.20, "lon": -76.55, "eta": "2026-06-08T18:00:00Z" },
  { "lat": 35.65, "lon": -76.90, "eta": "2026-06-09T00:00:00Z" },
  { "lat": 35.10, "lon": -77.20, "eta": "2026-06-09T06:00:00Z" },
  { "lat": 34.55, "lon": -77.45, "eta": "2026-06-09T12:00:00Z" }
]`;

// Placeholder weather report
const placeHolderText = `
Example of the "Weather Situation"
THE <SHIP NAME> WILL CONTINUE TO TRANSIT BEHIND A COLD FRONT THAT HAS BECOME STATIONARY IN THE <LOCATION>. THE VESSELS WILL EXPERIENCE STEADY NORTHEAST WINDS OF 15-25 KNOTS WITH GUSTS TO 35 KNOTS FOR THE FIRST HALF OF THIS FORECAST.
THE WINDS ARE FORECAST TO DECREASE SLIGHTLY BY THE END OF THE PERIOD. NORTHEAST SEAS OF 10-15 FEET ARE FORECAST TO SLOWLY DECREASE WITH THE FALLING WIND SPEEDS AS THE VESSEL GETS CLOSER TO THE <LOCATION>.
MOSTLY CLOUDY AND COOL CONDITIONS ARE FORECAST BEHIND THE COLD FRONT. WARMING AIR AND SEA TEMPERATURES ARE EXPECTED AS THE VESSEL TRANSITS SOUTHWARD.
AREAS OF SCATTERED LIGHT RAIN AND PARTLY TO MOSTLY CLOUDY SKIES ARE FORECAST THROUGH THE PERIOD.
`;

function App() {
    const [waypointsText, setWaypointsText] = useState(sampleWaypoints);
    const [weatherData, setWeatherData] = useState([]);
    const [forecastText, setForecastText] = useState(placeHolderText);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [shipName, setShipName] = useState("Borealis");
    const [routeName, setRouteName] = useState("Kessel Run");

    const { min: minTemp, max: maxTemp } = getMinMax("temperature_f");
    const { min: minWind, max: maxWind } = getMinMax("wind_speed_mph");
    const { min: minHumidity, max: maxHumidity } = getMinMax("humidity_pct");
    const { min: minPrecip, max: maxPrecip } = getMinMax("precipitation_in");

    /* Min max improved */
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

    // display and update weather data

    function buildWeatherContext() {
        return {
            shipName,
            routeName,
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

    // Get weather info

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
                setError(JSON.stringify(data, null, 2));
                setWeatherData([]);
                return;
            }
            setWeatherData(data.route);
        } catch (err) {
            setError(err.message);
            setWeatherData([]);
        } finally {
            setLoading(false);
        }
    }

    // Formats min/max to prevent "7-7"
    const formatRange = (min, max) => {
        if (min === "N/A" || max === "N/A") return "N/A";
        return min === max ? `${min}` : `${min} - ${max}`;
    };

    return (
        <div className="page">
            <h1>USNRL Weather Router</h1>
            <div className="card" style={{marginBottom: "20px"}}>
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
                            {/* Input Ship Name */}
                            <label
                                style={{
                                    display: "block",
                                    marginBottom: "6px",
                                    fontWeight: "bold"
                                }}
                            >
                                Ship Name
                            </label>
                            <input
                                type="text"
                                value={shipName}
                                onChange={(e) => setShipName(e.target.value)}
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
                            <span className="badge">OpenStreetMap</span>
                        </div>

                        <MapContainer
                            center={[weatherData[0].lat, weatherData[0].lon]}
                            zoom={6}
                            style={{height: "500px", width: "100%"}}
                        >
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
                </div>
            )}
            {weatherData.length > 0 && (
                <div className="card" style={{marginTop: "20px"}}>
                    <div className="card-header">
                        <h2>Weather Situation</h2>
                        <span className="badge muted">Editable</span>
                    </div>
                    {/* Weather Situation */}
                    <div style={{padding: "20px"}}>
                        <textarea
                            value={forecastText}
                            onChange={(e) => setForecastText(e.target.value)}
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
                                    onClick={() =>
                                        setForecastText(
                                            JSON.stringify(buildWeatherContext(), null, 2)
                                        )
                                    }
                                >
                                    AI data example / Generate JSON
                                </button>

                                <button
                                    style={{width: "auto", padding: "10px 24px"}}
                                    onClick={() => {
                                        console.log("<WIP> Saved forecast text:", forecastText);
                                        alert("<WIP> Forecast text saved.");
                                    }}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
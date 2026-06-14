import React, { useState } from "react";
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

const sampleWaypoints = `[
  { "lat": 36.85, "lon": -76.30, "eta": "2026-06-08T12:00:00Z" },
  { "lat": 36.20, "lon": -76.55, "eta": "2026-06-08T18:00:00Z" },
  { "lat": 35.65, "lon": -76.90, "eta": "2026-06-09T00:00:00Z" },
  { "lat": 35.10, "lon": -77.20, "eta": "2026-06-09T06:00:00Z" },
  { "lat": 34.55, "lon": -77.45, "eta": "2026-06-09T12:00:00Z" }
]`;


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

    return (
        <div className="page">
            <h1>USNRL Weather Router</h1>

            <div className="card" style={{ marginBottom: "20px" }}>
                <div className="card-header">
                    <h2>Waypoint Input</h2>
                    <span className="badge">JSON</span>
                </div>

                <div style={{ padding: "20px" }}>
        <textarea
            value={waypointsText}
            onChange={(e) => setWaypointsText(e.target.value)}
            rows={10}
            style={{
                width: "100%",
                minHeight: "220px"
            }}
        />

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            marginTop: "12px"
                        }}
                    >
                        <button
                            style={{ width: "auto", padding: "10px 24px" }}
                            onClick={runForecast}
                            disabled={loading}
                        >
                            {loading ? "Loading..." : "Run Forecast"}
                        </button>
                    </div>
                </div>
            </div>

            <button onClick={runForecast} disabled={loading}>
                {loading ? "Loading..." : "Run Forecast"}
            </button>

            {error && (
                <pre style={{ color: "red", whiteSpace: "pre-wrap" }}>
          {error}
        </pre>
            )}

            {weatherData.length > 0 && (
                <table border="1" cellPadding="8">
                    <thead>
                    <tr>
                        <th>ETA</th>
                        <th>Lat</th>
                        <th>Lon</th>
                        <th>Temp °F</th>
                        <th>Wind MPH</th>
                        <th>Humidity %</th>
                        <th>Precip In</th>
                    </tr>
                    </thead>
                    <tbody>
                    {weatherData.map((wp, index) => (
                        <tr key={index}>
                            <td>{wp.eta}</td>
                            <td>{wp.lat}</td>
                            <td>{wp.lon}</td>
                            <td>{wp.temperature_f ?? "N/A"}</td>
                            <td>{wp.wind_speed_mph ?? "N/A"}</td>
                            <td>{wp.humidity_pct ?? "N/A"}</td>
                            <td>{wp.precipitation_in ?? "N/A"}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            )}
            {weatherData.length > 0 && (
                <div className="card" style={{ marginTop: "20px" }}>
                    <div className="card-header">
                        <h2>Route Map</h2>
                        <span className="badge">OpenStreetMap</span>
                    </div>

                    <MapContainer
                        center={[
                            weatherData[0].lat,
                            weatherData[0].lon
                        ]}
                        zoom={6}
                        style={{
                            height: "500px",
                            width: "100%"
                        }}
                    >
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution="&copy; OpenStreetMap contributors"
                        />

                        <Polyline
                            positions={weatherData.map((wp) => [
                                wp.lat,
                                wp.lon
                            ])}
                            color="#26c6da"
                        />

                        {weatherData.map((wp, index) => (
                            <Marker
                                key={index}
                                position={[wp.lat, wp.lon]}
                                icon={createWaypointIcon(index + 1)}
                            >
                                <Popup>
                                    <strong>
                                        Waypoint {index + 1}
                                    </strong>

                                    <br />

                                    ETA: {wp.eta}

                                    <br />

                                    Temp: {wp.temperature_f} °F

                                    <br />

                                    Wind: {wp.wind_speed_mph} mph

                                    <br />

                                    Humidity: {wp.humidity_pct}%
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                </div>
            )}
            {weatherData.length > 0 && (
                <div className="card" style={{ marginTop: "20px" }}>
                    <div className="card-header">
                        <h2>Forecast Discussion</h2>
                        <span className="badge muted">Editable</span>
                    </div>

                    <div style={{ padding: "20px" }}>
      <textarea
          value={forecastText}
          onChange={(e) => setForecastText(e.target.value)}
          rows={10}
          style={{
              width: "100%",
              minHeight: "220px"
          }}
      />
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                            <button
                                style={{ width: "auto", padding: "10px 24px" }}
                                onClick={() => {
                                    console.log("Updated forecast text:", forecastText);
                                    alert("Forecast text updated.");
                                }}
                            >
                                Update
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
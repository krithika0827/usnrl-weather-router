const { test, expect } = require("@playwright/test");

const waypointsTextOnePoint = `[
  { "lat": 36.85, "lon": -76.30, "eta": "2026-07-09T12:00:00Z" }
]`;

const waypointsTextLarge = `[
    { "lat": 64.84, "lon": -147.72, "eta": "2026-07-09T12:00:00Z" },
    { "lat": 61.58, "lon": -149.68, "eta": "2026-07-09T18:00:00Z" },
    { "lat": 60.50, "lon": -144.00, "eta": "2026-07-10T00:00:00Z" },
    { "lat": 59.70, "lon": -137.37, "eta": "2026-07-10T06:00:00Z" },
    { "lat": 59.68, "lon": -134.78, "eta": "2026-07-10T12:00:00Z" },
    { "lat": 57.19, "lon": -131.46, "eta": "2026-07-10T18:00:00Z" },
    { "lat": 55.30, "lon": -126.43, "eta": "2026-07-11T00:00:00Z" },
    { "lat": 53.02, "lon": -122.82, "eta": "2026-07-11T06:00:00Z" },
    { "lat": 49.64, "lon": -123.09, "eta": "2026-07-11T12:00:00Z" },
    { "lat": 46.35, "lon": -122.54, "eta": "2026-07-11T18:00:00Z" },
    { "lat": 42.98, "lon": -122.53, "eta": "2026-07-12T00:00:00Z" },
    { "lat": 39.60, "lon": -122.40, "eta": "2026-07-12T06:00:00Z" },
    { "lat": 36.63, "lon": -121.14, "eta": "2026-07-12T12:00:00Z" },
    { "lat": 34.13, "lon": -118.33, "eta": "2026-07-12T18:00:00Z" },
    { "lat": 31.78, "lon": -115.55, "eta": "2026-07-13T00:00:00Z" },
    { "lat": 29.89, "lon": -112.30, "eta": "2026-07-13T06:00:00Z" },
    { "lat": 28.43, "lon": -108.85, "eta": "2026-07-13T12:00:00Z" },
    { "lat": 27.28, "lon": -105.27, "eta": "2026-07-13T18:00:00Z" },
    { "lat": 26.13, "lon": -101.69, "eta": "2026-07-14T00:00:00Z" },
    { "lat": 23.87, "lon": -101.42, "eta": "2026-07-14T06:00:00Z" },
    { "lat": 20.91, "lon": -103.20, "eta": "2026-07-14T12:00:00Z" },
    { "lat": 19.74, "lon": -100.20, "eta": "2026-07-14T18:00:00Z" },
    { "lat": 18.44, "lon": -96.91, "eta": "2026-07-15T00:00:00Z" },
    { "lat": 17.01, "lon": -93.70, "eta": "2026-07-15T06:00:00Z" },
    { "lat": 14.96, "lon": -90.92, "eta": "2026-07-15T12:00:00Z" },
    { "lat": 13.07, "lon": -88.04, "eta": "2026-07-15T18:00:00Z" },
    { "lat": 11.12, "lon": -85.26, "eta": "2026-07-16T00:00:00Z" },
    { "lat": 9.58, "lon": -82.38, "eta": "2026-07-16T06:00:00Z" },
    { "lat": 8.70, "lon": -79.11, "eta": "2026-07-16T12:00:00Z" },
    { "lat": 6.77, "lon": -76.31, "eta": "2026-07-16T18:00:00Z" },
    { "lat": 4.46, "lon": -74.30, "eta": "2026-07-17T00:00:00Z" },
    { "lat": 1.97, "lon": -76.58, "eta": "2026-07-17T06:00:00Z" },
    { "lat": -0.69, "lon": -78.57, "eta": "2026-07-17T12:00:00Z" },
    { "lat": -4.02, "lon": -79.01, "eta": "2026-07-17T18:00:00Z" },
    { "lat": -7.40, "lon": -79.03, "eta": "2026-07-18T00:00:00Z" },
    { "lat": -10.50, "lon": -77.82, "eta": "2026-07-18T06:00:00Z" },
    { "lat": -13.09, "lon": -75.72, "eta": "2026-07-18T12:00:00Z" },
    { "lat": -15.23, "lon": -73.02, "eta": "2026-07-18T18:00:00Z" },
    { "lat": -17.61, "lon": -70.57, "eta": "2026-07-19T00:00:00Z" },
    { "lat": -20.89, "lon": -70.33, "eta": "2026-07-19T06:00:00Z" },
    { "lat": -24.26, "lon": -70.48, "eta": "2026-07-19T12:00:00Z" },
    { "lat": -27.62, "lon": -70.94, "eta": "2026-07-19T18:00:00Z" },
    { "lat": -30.97, "lon": -71.07, "eta": "2026-07-20T00:00:00Z" },
    { "lat": -34.20, "lon": -71.19, "eta": "2026-07-20T06:00:00Z" },
    { "lat": -37.17, "lon": -73.04, "eta": "2026-07-20T12:00:00Z" },
    { "lat": -40.55, "lon": -72.96, "eta": "2026-07-20T18:00:00Z" },
    { "lat": -43.90, "lon": -72.42, "eta": "2026-07-21T00:00:00Z" },
    { "lat": -47.26, "lon": -72.19, "eta": "2026-07-21T06:00:00Z" },
    { "lat": -50.64, "lon": -72.42, "eta": "2026-07-21T12:00:00Z" },
    { "lat": -54.80, "lon": -68.30, "eta": "2026-07-21T21:00:00Z" }
]`;

// will be used after rate limit is added
const waypointsTextOversize = `[
    { "lat": 68.10, "lon": -145.76, "eta": "2026-07-09T06:00:00Z" },
    { "lat": 64.84, "lon": -147.72, "eta": "2026-07-09T12:00:00Z" },
    { "lat": 61.58, "lon": -149.68, "eta": "2026-07-09T18:00:00Z" },
    { "lat": 60.50, "lon": -144.00, "eta": "2026-07-10T00:00:00Z" },
    { "lat": 59.70, "lon": -137.37, "eta": "2026-07-10T06:00:00Z" },
    { "lat": 59.68, "lon": -134.78, "eta": "2026-07-10T12:00:00Z" },
    { "lat": 57.19, "lon": -131.46, "eta": "2026-07-10T18:00:00Z" },
    { "lat": 55.30, "lon": -126.43, "eta": "2026-07-11T00:00:00Z" },
    { "lat": 53.02, "lon": -122.82, "eta": "2026-07-11T06:00:00Z" },
    { "lat": 49.64, "lon": -123.09, "eta": "2026-07-11T12:00:00Z" },
    { "lat": 46.35, "lon": -122.54, "eta": "2026-07-11T18:00:00Z" },
    { "lat": 42.98, "lon": -122.53, "eta": "2026-07-12T00:00:00Z" },
    { "lat": 39.60, "lon": -122.40, "eta": "2026-07-12T06:00:00Z" },
    { "lat": 36.63, "lon": -121.14, "eta": "2026-07-12T12:00:00Z" },
    { "lat": 34.13, "lon": -118.33, "eta": "2026-07-12T18:00:00Z" },
    { "lat": 31.78, "lon": -115.55, "eta": "2026-07-13T00:00:00Z" },
    { "lat": 29.89, "lon": -112.30, "eta": "2026-07-13T06:00:00Z" },
    { "lat": 28.43, "lon": -108.85, "eta": "2026-07-13T12:00:00Z" },
    { "lat": 27.28, "lon": -105.27, "eta": "2026-07-13T18:00:00Z" },
    { "lat": 26.13, "lon": -101.69, "eta": "2026-07-14T00:00:00Z" },
    { "lat": 23.87, "lon": -101.42, "eta": "2026-07-14T06:00:00Z" },
    { "lat": 20.91, "lon": -103.20, "eta": "2026-07-14T12:00:00Z" },
    { "lat": 19.74, "lon": -100.20, "eta": "2026-07-14T18:00:00Z" },
    { "lat": 18.44, "lon": -96.91, "eta": "2026-07-15T00:00:00Z" },
    { "lat": 17.01, "lon": -93.70, "eta": "2026-07-15T06:00:00Z" },
    { "lat": 14.96, "lon": -90.92, "eta": "2026-07-15T12:00:00Z" },
    { "lat": 13.07, "lon": -88.04, "eta": "2026-07-15T18:00:00Z" },
    { "lat": 11.12, "lon": -85.26, "eta": "2026-07-16T00:00:00Z" },
    { "lat": 9.58, "lon": -82.38, "eta": "2026-07-16T06:00:00Z" },
    { "lat": 8.70, "lon": -79.11, "eta": "2026-07-16T12:00:00Z" },
    { "lat": 6.77, "lon": -76.31, "eta": "2026-07-16T18:00:00Z" },
    { "lat": 4.46, "lon": -74.30, "eta": "2026-07-17T00:00:00Z" },
    { "lat": 1.97, "lon": -76.58, "eta": "2026-07-17T06:00:00Z" },
    { "lat": -0.69, "lon": -78.57, "eta": "2026-07-17T12:00:00Z" },
    { "lat": -4.02, "lon": -79.01, "eta": "2026-07-17T18:00:00Z" },
    { "lat": -7.40, "lon": -79.03, "eta": "2026-07-18T00:00:00Z" },
    { "lat": -10.50, "lon": -77.82, "eta": "2026-07-18T06:00:00Z" },
    { "lat": -13.09, "lon": -75.72, "eta": "2026-07-18T12:00:00Z" },
    { "lat": -15.23, "lon": -73.02, "eta": "2026-07-18T18:00:00Z" },
    { "lat": -17.61, "lon": -70.57, "eta": "2026-07-19T00:00:00Z" },
    { "lat": -20.89, "lon": -70.33, "eta": "2026-07-19T06:00:00Z" },
    { "lat": -24.26, "lon": -70.48, "eta": "2026-07-19T12:00:00Z" },
    { "lat": -27.62, "lon": -70.94, "eta": "2026-07-19T18:00:00Z" },
    { "lat": -30.97, "lon": -71.07, "eta": "2026-07-20T00:00:00Z" },
    { "lat": -34.20, "lon": -71.19, "eta": "2026-07-20T06:00:00Z" },
    { "lat": -37.17, "lon": -73.04, "eta": "2026-07-20T12:00:00Z" },
    { "lat": -40.55, "lon": -72.96, "eta": "2026-07-20T18:00:00Z" },
    { "lat": -43.90, "lon": -72.42, "eta": "2026-07-21T00:00:00Z" },
    { "lat": -47.26, "lon": -72.19, "eta": "2026-07-21T06:00:00Z" },
    { "lat": -50.64, "lon": -72.42, "eta": "2026-07-21T12:00:00Z" },
    { "lat": -54.80, "lon": -68.30, "eta": "2026-07-21T21:00:00Z" },
    { "lat": -58.96, "lon": -64.18, "eta": "2026-07-22T03:00:00Z" }
]`;

const largeForecastBrowserWaitMs = 15000;

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes("Large forecast Test") && !page.isClosed()) {
    await page.waitForTimeout(largeForecastBrowserWaitMs);
  }
});

async function runForecast(page, waypoints = waypointsTextOnePoint) {
  await page.goto("/");

  await page.locator("textarea").first().fill(waypoints);
  await page.getByRole("button", { name: /run forecast/i }).click();
}

async function assertPeakValuesAndTravelDetails(page, waypointCount) {
  const peakValues = page.locator(".peak-card .peak-value");

  await expect(peakValues).toHaveCount(4);
  for (let index = 0; index < 4; index++) {
    await expect(peakValues.nth(index)).not.toHaveText("");
    await expect(peakValues.nth(index)).not.toHaveText("N/A");
  }

  const travelRows = page.locator(".travel-card tbody tr");
  const travelTime = travelRows.nth(0).locator("td").nth(1);
  const travelDistance = travelRows.nth(1).locator("td").nth(1);

  await expect(travelRows).toHaveCount(2);
  await expect(travelTime).not.toHaveText("");
  await expect(travelDistance).not.toHaveText("");

  if (waypointCount < 2) {
    await expect(travelTime).toHaveText("N/A");
    await expect(travelDistance).toHaveText("N/A");
    return;
  }

  await expect(travelTime).toContainText(/hrs/);
  await expect(travelDistance).toContainText(/mi/);
}

async function assertWeatherInputsHaveNumbers(rows, rowCount) {
  const fieldNames = ["Temp °F", "Wind MPH", "Wind Dir °", "Humidity %", "Precipitation"];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const weatherInputs = rows.nth(rowIndex).locator('input[type="number"]');

    await expect(weatherInputs).toHaveCount(fieldNames.length);

    for (let fieldIndex = 0; fieldIndex < fieldNames.length; fieldIndex++) {
      const input = weatherInputs.nth(fieldIndex);
      const value = await input.inputValue();
      const fieldName = fieldNames[fieldIndex];
      const waypointNumber = rowIndex + 1;

      expect(value, `${fieldName} is blank for WP-${waypointNumber}`).not.toBe("");
      expect(
        Number.isFinite(Number(value)),
        `${fieldName} must be numeric for WP-${waypointNumber}; got "${value}"`
      ).toBe(true);
    }
  }
}

async function assertWeatherInputsMatchValues(row, expectedValues) {
  const weatherInputs = row.locator('input[type="number"]');
  const expectedInputValues = [
    expectedValues.temperature_f,
    expectedValues.wind_speed_mph,
    expectedValues.wind_direction_deg,
    expectedValues.humidity_pct,
    expectedValues.precipitation_in
  ];

  await expect(weatherInputs).toHaveCount(expectedInputValues.length);

  for (let index = 0; index < expectedInputValues.length; index++) {
    await expect(weatherInputs.nth(index)).toHaveValue(String(expectedInputValues[index]));
  }
}

async function assertWaypointEndpoints(rows, waypoints) {
  const firstWaypoint = waypoints[0];
  const lastWaypoint = waypoints[waypoints.length - 1];

  await expect(rows.first().locator("td").nth(0)).toHaveText("WP-1");
  await expect(rows.first().locator("td").nth(1)).toHaveText(firstWaypoint.eta);
  await expect(rows.first().locator("td").nth(2)).toHaveText(String(firstWaypoint.lat));
  await expect(rows.first().locator("td").nth(3)).toHaveText(String(firstWaypoint.lon));

  await expect(rows.last().locator("td").nth(0)).toHaveText(`WP-${waypoints.length}`);
  await expect(rows.last().locator("td").nth(1)).toHaveText(lastWaypoint.eta);
  await expect(rows.last().locator("td").nth(2)).toHaveText(String(lastWaypoint.lat));
  await expect(rows.last().locator("td").nth(3)).toHaveText(String(lastWaypoint.lon));
}


// 1 waypoint (validate weather information)
test("Small forecast Test With data validation", async ({ page }) => {
  const smallWaypoints = JSON.parse(waypointsTextOnePoint);
  const expectedWeather = {
    ...smallWaypoints[0],
    temperature_f: 77,
    wind_speed_mph: 3.2,
    wind_direction_deg: 146,
    humidity_pct: 90,
    precipitation_in: 0
  };

  await runForecast(page);

  const weatherTable = page
    .locator("table")
    .filter({ hasText: "Temp °F" })
    .first();
  const rows = weatherTable.locator("tbody tr");

  await expect(rows).toHaveCount(smallWaypoints.length);

  await assertWeatherInputsHaveNumbers(rows, smallWaypoints.length);
  await assertWeatherInputsMatchValues(rows.first(), expectedWeather);
  await assertWaypointEndpoints(rows, smallWaypoints);

  await assertPeakValuesAndTravelDetails(page, smallWaypoints.length);
});
// 5 waypoints (Default) (confirm no errors)
test("Prefilled waypoints Test", async ({ page }) => {
  await page.goto("/");

  const prefilledWaypointsText = await page.locator("textarea").first().inputValue();
  const prefilledWaypoints = JSON.parse(prefilledWaypointsText);

  await page.getByRole("button", { name: /run forecast/i }).click();

  const weatherTable = page
    .locator("table")
    .filter({ hasText: "Temp °F" })
    .first();
  const rows = weatherTable.locator("tbody tr");

  await expect(rows).toHaveCount(prefilledWaypoints.length);

  await assertWeatherInputsHaveNumbers(rows, prefilledWaypoints.length);
  await assertWaypointEndpoints(rows, prefilledWaypoints);

  await assertPeakValuesAndTravelDetails(page, prefilledWaypoints.length);
});


// Re-enable after weather fetch fix is merged
test("Large forecast Test @headed", async ({ page }, testInfo) => {
  testInfo.setTimeout(largeForecastBrowserWaitMs + 120000);

  const largeWaypoints = JSON.parse(waypointsTextLarge);

  await runForecast(page, waypointsTextLarge);

  const weatherTable = page
    .locator("table")
    .filter({ hasText: "Temp °F" })
    .first();
  const rows = weatherTable.locator("tbody tr");

  await expect(rows).toHaveCount(largeWaypoints.length);

  await assertWeatherInputsHaveNumbers(rows, largeWaypoints.length);
  await assertWaypointEndpoints(rows, largeWaypoints);

  await assertPeakValuesAndTravelDetails(page, largeWaypoints.length);
});


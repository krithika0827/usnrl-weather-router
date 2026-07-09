const { test, expect } = require("@playwright/test");

const waypointsTextSmall = `[
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

async function runForecast(page, waypoints = waypointsTextSmall) {
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

test("Small forecast Test With data validation", async ({ page }) => {
  const smallWaypoints = JSON.parse(waypointsTextSmall);
  const expectedWeather = {
    ...smallWaypoints[0],
    temperature_f: 77,
    wind_speed_mph: 3.2,
    wind_direction_deg: 146,
    humidity_pct: 90,
    precipitation_in: 0
  };

  await page.route("http://localhost:8000/api/v1/forecast", async (routeRequest) => {
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        route: [expectedWeather],
        summary: "Mock forecast",
        validation: []
      })
    });
  });

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
test("Wind map arrows use speed outlines", async ({ page }) => {
  const route = [
    {
      lat: 36.85,
      lon: -76.30,
      eta: "2026-07-09T12:00:00Z",
      temperature_f: 70,
      wind_speed_mph: 20,
      wind_direction_deg: 45,
      humidity_pct: 70,
      precipitation_in: 0
    },
    {
      lat: 36.20,
      lon: -76.55,
      eta: "2026-07-09T18:00:00Z",
      temperature_f: 72,
      wind_speed_mph: 45,
      wind_direction_deg: 90,
      humidity_pct: 68,
      precipitation_in: 0
    },
    {
      lat: 35.65,
      lon: -76.90,
      eta: "2026-07-10T00:00:00Z",
      temperature_f: 74,
      wind_speed_mph: 58,
      wind_direction_deg: 180,
      humidity_pct: 66,
      precipitation_in: 0
    },
    {
      lat: 35.10,
      lon: -77.20,
      eta: "2026-07-10T06:00:00Z",
      temperature_f: 75,
      wind_speed_mph: 5,
      wind_direction_deg: 270,
      humidity_pct: 64,
      precipitation_in: 0
    },
    {
      lat: 34.55,
      lon: -77.45,
      eta: "2026-07-10T12:00:00Z",
      temperature_f: 76,
      wind_speed_mph: null,
      wind_direction_deg: 315,
      humidity_pct: 62,
      precipitation_in: 0
    },
    {
      lat: 34.00,
      lon: -77.70,
      eta: "2026-07-10T18:00:00Z",
      temperature_f: 77,
      wind_speed_mph: 20,
      wind_direction_deg: null,
      humidity_pct: 60,
      precipitation_in: 0
    },
    {
      lat: 33.45,
      lon: -77.95,
      eta: "2026-07-11T00:00:00Z",
      temperature_f: 78,
      wind_speed_mph: 45,
      wind_direction_deg: "",
      humidity_pct: 58,
      precipitation_in: 0
    },
    {
      lat: 32.90,
      lon: -78.20,
      eta: "2026-07-11T06:00:00Z",
      temperature_f: 79,
      wind_speed_mph: 58,
      wind_direction_deg: 400,
      humidity_pct: 56,
      precipitation_in: 0
    },
    {
      lat: 32.35,
      lon: -78.45,
      eta: "2026-07-11T12:00:00Z",
      temperature_f: 80,
      wind_speed_mph: null,
      wind_direction_deg: null,
      humidity_pct: 54,
      precipitation_in: 0
    }
  ];
  const waypoints = route.map(({ lat, lon, eta }) => ({ lat, lon, eta }));
  const validWindDirectionCount = route.filter(({ wind_direction_deg }) => {
    if (wind_direction_deg === null || wind_direction_deg === undefined || wind_direction_deg === "") {
      return false;
    }

    const direction = Number(wind_direction_deg);
    return Number.isFinite(direction) && direction >= 0 && direction <= 360;
  }).length;

  await page.route("http://localhost:8000/api/v1/forecast", async (routeRequest) => {
    await routeRequest.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        route,
        summary: "Mock forecast",
        validation: []
      })
    });
  });

  await runForecast(page, JSON.stringify(waypoints, null, 2));

  const mapArrows = page.locator(".wind-map-direction-arrow");
  const mapDots = page.locator(".wind-map-direction-dot");

  await expect(mapArrows).toHaveCount(validWindDirectionCount);
  await expect(mapDots).toHaveCount(route.length - validWindDirectionCount);
  await expect(page.locator(".wind-map-direction-arrow.wind-speed-default")).toHaveCount(2);
  await expect(page.locator(".wind-map-direction-arrow.wind-speed-strong")).toHaveCount(1);
  await expect(page.locator(".wind-map-direction-arrow.wind-speed-extreme")).toHaveCount(1);
  await expect(page.locator(".wind-map-direction-arrow.wind-speed-missing")).toHaveCount(1);
  await expect(page.locator(".wind-map-direction-dot.wind-speed-default")).toHaveCount(1);
  await expect(page.locator(".wind-map-direction-dot.wind-speed-strong")).toHaveCount(1);
  await expect(page.locator(".wind-map-direction-dot.wind-speed-extreme")).toHaveCount(1);
  await expect(page.locator(".wind-map-direction-dot.wind-speed-missing")).toHaveCount(1);
  await expect(page.locator(".wind-direction-unknown")).toHaveCount(route.length - validWindDirectionCount);
  await expect(mapArrows.first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(mapArrows.first()).toHaveCSS("border-top-width", "0px");
  for (let index = 0; index < validWindDirectionCount; index++) {
    await expect(mapArrows.nth(index)).toHaveCSS("color", "rgb(0, 0, 0)");
  }

  const invalidDirectionRow = page
    .locator("table")
    .filter({ hasText: "Temp °F" })
    .first()
    .locator("tbody tr")
    .nth(route.length - 1);

  await expect(invalidDirectionRow.locator(".wind-direction-unknown")).toHaveText("?");
  await expect(invalidDirectionRow.locator(".wind-direction-arrow")).toHaveCount(0);
  await expect(invalidDirectionRow.locator(".wind-direction-cardinal")).toHaveCount(0);

  const defaultOutlines = await page
    .locator(".wind-map-direction-arrow.wind-speed-default")
    .evaluateAll((elements) =>
      elements.map((element) => ({
        color: getComputedStyle(element).webkitTextStrokeColor,
        width: getComputedStyle(element).webkitTextStrokeWidth,
        shadow: getComputedStyle(element).textShadow
      }))
    );
  const strongOutline = await page
    .locator(".wind-map-direction-arrow.wind-speed-strong")
    .evaluate((element) => ({
      color: getComputedStyle(element).webkitTextStrokeColor,
      width: getComputedStyle(element).webkitTextStrokeWidth,
      shadow: getComputedStyle(element).textShadow
    }));
  const extremeOutline = await page
    .locator(".wind-map-direction-arrow.wind-speed-extreme")
    .evaluate((element) => ({
      color: getComputedStyle(element).webkitTextStrokeColor,
      width: getComputedStyle(element).webkitTextStrokeWidth,
      shadow: getComputedStyle(element).textShadow
    }));
  const missingOutline = await page
    .locator(".wind-map-direction-arrow.wind-speed-missing")
    .evaluate((element) => ({
      color: getComputedStyle(element).webkitTextStrokeColor,
      width: getComputedStyle(element).webkitTextStrokeWidth,
      shadow: getComputedStyle(element).textShadow
    }));
  const dotStyles = await mapDots
    .evaluateAll((elements) => elements.map((element) => ({
      width: getComputedStyle(element).width,
      height: getComputedStyle(element).height,
      background: getComputedStyle(element).backgroundColor,
      marginLeft: getComputedStyle(element.parentElement).marginLeft,
      marginTop: getComputedStyle(element.parentElement).marginTop
    })));

  expect(defaultOutlines).toEqual([
    {
      color: "rgb(27, 187, 228)",
      width: "2px",
      shadow: "none"
    },
    {
      color: "rgb(27, 187, 228)",
      width: "2px",
      shadow: "none"
    }
  ]);
  expect(missingOutline).toEqual({
    color: "rgb(0, 0, 0)",
    width: "2px",
    shadow: "none"
  });
  expect(strongOutline).toEqual({
    color: "rgb(37, 99, 235)",
    width: "2px",
    shadow: "none"
  });
  expect(extremeOutline).toEqual({
    color: "rgb(255, 46, 46)",
    width: "2px",
    shadow: "none"
  });
  expect(dotStyles).toEqual([
    {
      width: "15px",
      height: "15px",
      background: "rgb(27, 187, 228)",
      marginLeft: "-7.5px",
      marginTop: "-42px"
    },
    {
      width: "15px",
      height: "15px",
      background: "rgb(37, 99, 235)",
      marginLeft: "-7.5px",
      marginTop: "-42px"
    },
    {
      width: "15px",
      height: "15px",
      background: "rgb(255, 46, 46)",
      marginLeft: "-7.5px",
      marginTop: "-42px"
    },
    {
      width: "15px",
      height: "15px",
      background: "rgb(0, 0, 0)",
      marginLeft: "-7.5px",
      marginTop: "-42px"
    }
  ]);
});


// Re-enable after weather fetch fix is merged
/*
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
*/

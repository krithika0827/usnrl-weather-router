const { test, expect } = require("@playwright/test");

const SUMMARY_GENERATING_TEXT = "... Generating";
// Real Gemini responses take roughly 14 seconds, and this clock starts before
// the weather fetch goes out, so the budget has to cover both round trips.
const WEATHER_SITUATION_RESPONSE_TIMEOUT_MS = 45000;
const LIVE_GEMINI_TEST_TAG = "@live-gemini";
const waypointsTextOnePoint = `[
  { "lat": 36.85, "lon": -76.30, "eta": "2026-07-09T12:00:00Z" }
]`;

function waitForSummaryResponse(page) {
  return page.waitForResponse(
    (response) => (
      response.url().includes("/api/v1/summary")
      && response.request().method() === "POST"
    ),
    { timeout: WEATHER_SITUATION_RESPONSE_TIMEOUT_MS }
  );
}

async function waitForWeatherSituationReady(page) {
  const weatherSituation = page.getByLabel("Weather Situation");

  await expect(weatherSituation).toBeVisible();
  await expect(weatherSituation).not.toHaveValue(SUMMARY_GENERATING_TEXT, {
    timeout: WEATHER_SITUATION_RESPONSE_TIMEOUT_MS
  });

  return weatherSituation;
}

async function openAndRunForecast(page, waypoints = waypointsTextOnePoint) {
  await page.goto("/");

  await page.locator("textarea").first().fill(waypoints);
  const forecastResponsePromise = page.waitForResponse((response) => {
    return (
      response.url().includes("/api/v1/forecast")
      && response.request().method() === "POST"
    );
  });
  const summaryResponsePromise = waitForSummaryResponse(page).catch(() => null);

  await page.getByRole("button", { name: /run forecast/i }).click();

  const forecastResponse = await forecastResponsePromise;
  let summaryResponse = null;

  if (forecastResponse.ok()) {
    summaryResponse = await summaryResponsePromise;
    expect(summaryResponse, "Weather Situation summary response was not observed.").not.toBeNull();
    expect(summaryResponse.ok()).toBe(true);
    await waitForWeatherSituationReady(page);
  }

  return { forecastResponse, summaryResponse };
}

// Isolated to keep Gemini rate limits,
// missing API keys, and GitHub CI issues
// from failing the main test suite.

test(`${LIVE_GEMINI_TEST_TAG} Gemini summary generation uses the live AI response`, async ({ page }) => {
  const { summaryResponse } = await openAndRunForecast(page);
  const weatherSituationCard = page.locator(".card").filter({ hasText: "Weather Situation" }).first();
  const weatherSituation = await waitForWeatherSituationReady(page);

  expect(summaryResponse, "Expected the live Gemini summary response.").not.toBeNull();

  const summaryData = await summaryResponse.json();
  const summaryWarnings = (summaryData.validation ?? [])
    .map((finding) => finding?.message)
    .filter(Boolean);

  expect(
    summaryData.summary_mode,
    `Expected Gemini to generate the Weather Situation, but the backend returned `
    + `"${summaryData.summary_mode}". ${summaryWarnings.join(" ")}`
  ).toBe("gemini");
  expect(typeof summaryData.summary).toBe("string");
  expect(summaryData.summary.trim().length).toBeGreaterThan(0);

  await expect(weatherSituation).toHaveValue(summaryData.summary);
  await expect(weatherSituationCard).toContainText("Gemini Summary");
  await expect(weatherSituationCard).toContainText("Weather Situation generated using Gemini.");
});

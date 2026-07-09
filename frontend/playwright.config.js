const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 90000,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      BROWSER: "none"
    }
  },
  projects: [
    {
      name: "chromium",
      grepInvert: /@headed/,
      use: { ...devices["Desktop Chrome"], headless: true }
    },
    {
      name: "chromium-headed",
      grep: /@headed/,
      use: { ...devices["Desktop Chrome"], headless: false }
    }
  ]
});

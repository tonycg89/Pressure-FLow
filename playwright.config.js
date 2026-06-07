const { defineConfig } = require("@playwright/test");

const PORT = process.env.PLAYWRIGHT_PORT || "3173";

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "node server.js",
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
    env: {
      ...process.env,
      PORT,
      SESSION_SECRET: "playwright-local-session-secret",
      PRESSUREFLOW_DATA_DIR: ".tmp/playwright-data"
    }
  }
});

import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  timeout: 30000,
  use: {
    baseURL: process.env.TEST_URL || "http://127.0.0.1:5174/",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: process.env.TEST_URL
    ? undefined
    : {
        command: "npm run dev -- --host 0.0.0.0 --port 5174",
        url: "http://127.0.0.1:5174",
        reuseExistingServer: !process.env.CI,
      },
  reporter: "list",
});

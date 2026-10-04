import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the production build (`vite preview`), in real
 * Chrome with a fake webcam so the MediaPipe pipeline can start without a
 * person in front of the camera. Set PW_CHANNEL="" to use Playwright's bundled
 * Chromium instead of the locally installed Chrome (e.g. in CI).
 */
const channel = process.env.PW_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Each worker runs a browser with a live camera stream and a 60fps canvas;
  // more than a few at once starves the machine and makes timing flaky.
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        ...(channel ? { channel } : {}),
        viewport: { width: 1440, height: 900 },
        permissions: ["camera"],
        launchOptions: {
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        },
      },
    },
    {
      name: "mobile",
      testMatch: /layout\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        ...(channel ? { channel } : {}),
      },
    },
  ],
  webServer: {
    command: "npx vite build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

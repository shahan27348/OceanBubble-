/** What players see when the camera or the tracking model isn't available. */
import { expect, test } from "./fixtures";

test.describe("camera blocked", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }));
    });
  });

  test("explains the problem and still plays by mouse", async ({ page, pageErrors }) => {
    void pageErrors;
    await page.goto("/");
    await expect(page.getByRole("status")).toContainText("Camera access was blocked");
    await page.getByRole("button", { name: /Quick Dive/ }).click();
    await expect(page.getByText(/Drag from the bubble and release/)).toBeVisible();
    // No camera preview when there is no camera.
    await expect(page.getByTestId("camera-pip")).toHaveCount(0);
  });
});

test.describe("no camera attached", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(Object.assign(new Error("none"), { name: "NotFoundError" }));
    });
  });

  test("says so", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("status")).toContainText("No camera found");
  });
});

test.describe("tracking library blocked", () => {
  test.use({ useFakeHands: false });

  test("falls back to mouse when hands.js can't load", async ({ page, pageErrors }) => {
    void pageErrors;
    await page.route("**/@mediapipe/hands@*/hands.js", (route) => route.abort());
    await page.goto("/");
    await expect(page.getByRole("status")).toContainText("couldn't load");
    await page.getByRole("button", { name: /Quick Dive/ }).click();
    await expect(page.getByText("Endless Dive")).toBeVisible();
  });
});

test.describe("corrupted save", () => {
  test("loads with defaults instead of crashing", async ({ page, pageErrors }) => {
    void pageErrors;
    await page.addInitScript(() => {
      localStorage.setItem("ocean-bubbles:v1", '{"settings":42,"progress":"x","highScore":-1');
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Quick Dive/ })).toBeVisible();
  });
});

test.describe("real MediaPipe model", () => {
  test.use({ useFakeHands: false });

  test("starts on a fake webcam when the CDN is reachable", async ({ page, request }) => {
    test.slow();
    const reachable = await request
      .head("https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js", { timeout: 5000 })
      .then((r) => r.ok())
      .catch(() => false);
    test.skip(!reachable, "MediaPipe CDN not reachable from this machine");

    await page.goto("/");
    // Downloading and compiling the model can take a while on a cold cache.
    await expect(page.getByRole("status")).toHaveCount(0, { timeout: 90_000 });
    await page.getByRole("button", { name: /Quick Dive/ }).click();
    await expect(page.getByTestId("camera-pip")).toContainText("Show your hand");
  });
});

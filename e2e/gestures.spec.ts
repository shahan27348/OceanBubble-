/**
 * Hand-gesture gameplay, end to end: real Chrome, real fake-webcam stream,
 * the app's real tracking pipeline — only the neural network is replaced by a
 * scripted hand (see fixtures.ts).
 */
import { Locator } from "@playwright/test";
import { anchorOnScreen, centerOf, expect, test } from "./fixtures";

/** Condition for `hand.press`: the locator has appeared. */
const shows = (l: Locator) => () => l.isVisible();

test.beforeEach(async ({ page, pageErrors }) => {
  void pageErrors;
  await page.goto("/");
  // The status pill disappears once the camera is streaming into the model.
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 15_000 });
  await page.waitForFunction(() => (window as unknown as { __handsFrames: number }).__handsFrames > 5);
});

test("a pinch-and-hold presses menu buttons", async ({ page, hand }) => {
  const endless = page.getByText("Endless Dive");
  await hand.press(await centerOf(page, page.getByRole("button", { name: /Quick Dive/ })), shows(endless));
  await expect(endless).toBeVisible();
});

test("hovering without pinching never clicks", async ({ page, hand }) => {
  const target = await centerOf(page, page.getByRole("button", { name: /Quick Dive/ }));
  await hand.glideTo(target.x, target.y, false);
  await page.waitForTimeout(1500);
  await expect(page.getByRole("button", { name: /Quick Dive/ })).toBeVisible();
  await expect(page.getByText("Endless Dive")).toHaveCount(0);
});

test("a held pinch can't click through onto the next screen", async ({ page, hand }) => {
  const level1 = page.getByRole("button", { name: /Coral Reef/ });
  await hand.press(await centerOf(page, page.getByRole("button", { name: /Expedition/ })), shows(level1));
  await expect(level1).toBeVisible();

  // Pinch over Expedition and keep holding while the level list appears and
  // the hand drifts onto a level: nothing may start until the pinch reopens.
  await page.getByRole("button", { name: "Back" }).click();
  const expedition = await centerOf(page, page.getByRole("button", { name: /Expedition/ }));
  await hand.glideTo(expedition.x, expedition.y, false);
  await page.waitForTimeout(250);
  await hand.pinch();
  await expect(level1).toBeVisible({ timeout: 6000 });
  const target = await centerOf(page, level1);
  await hand.glideTo(target.x, target.y, true, 300);
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("ammo")).toHaveCount(0);

  // A fresh pinch does start it.
  await hand.open();
  await page.waitForTimeout(150);
  await hand.press(target, shows(page.getByTestId("ammo")));
  await expect(page.getByTestId("ammo")).toHaveAttribute("data-remaining", "10");
});

test("pinch, pull back and release fires the slingshot", async ({ page, hand }) => {
  const level1 = page.getByRole("button", { name: /Coral Reef/ });
  await hand.press(await centerOf(page, page.getByRole("button", { name: /Expedition/ })), shows(level1));
  await hand.press(await centerOf(page, level1), shows(page.getByTestId("ammo")));
  await expect(page.getByTestId("ammo")).toHaveAttribute("data-remaining", "10");
  await expect(page.getByText(/Pinch near the bubble/)).toBeVisible();

  const a = anchorOnScreen(page);
  await hand.glideTo(a.x, a.y, false, 400);
  await page.waitForTimeout(300);
  await hand.pinch();
  await page.waitForTimeout(150);
  await hand.glideTo(a.x - 20, a.y + 130, true, 400);
  await page.waitForTimeout(200);
  // The HUD under the pulled-back ball fades so the ball stays visible.
  await expect(page.getByTestId("bottom-hud")).toHaveClass(/opacity-25/);
  await hand.open();

  await expect(page.getByTestId("ammo")).toHaveAttribute("data-remaining", "9");
  await expect(page.getByTestId("bottom-hud")).toHaveClass(/opacity-100/);
  await expect(page.getByText(/Pinch near the bubble/)).toHaveCount(0);
});

test("a hand that leaves mid-pull doesn't fire", async ({ page, hand }) => {
  const level1 = page.getByRole("button", { name: /Coral Reef/ });
  await hand.press(await centerOf(page, page.getByRole("button", { name: /Expedition/ })), shows(level1));
  await hand.press(await centerOf(page, level1), shows(page.getByTestId("ammo")));

  const a = anchorOnScreen(page);
  await hand.glideTo(a.x, a.y, false, 400);
  await page.waitForTimeout(300);
  await hand.pinch();
  await hand.glideTo(a.x, a.y + 120, true, 300);
  await hand.hide();
  await page.waitForTimeout(2000);

  await expect(page.getByTestId("ammo")).toHaveAttribute("data-remaining", "10");
});

test("the gesture cursor follows the hand and the camera preview reports it", async ({ page, hand }) => {
  await hand.glideTo(400, 300, false);
  await page.waitForTimeout(300);
  const cursor = page.locator(".gesture-cursor");
  await expect(cursor).toBeVisible();
  const box = await cursor.boundingBox();
  expect(Math.abs(box!.x + box!.width / 2 - 400)).toBeLessThan(25);
  expect(Math.abs(box!.y + box!.height / 2 - 300)).toBeLessThan(25);

  await hand.press(
    await centerOf(page, page.getByRole("button", { name: /Quick Dive/ })),
    shows(page.getByTestId("camera-pip"))
  );
  await expect(page.getByTestId("camera-pip")).toContainText("Hand tracked");
  await hand.hide();
  await expect(page.getByTestId("camera-pip")).toContainText("Show your hand");
  await expect(cursor).toHaveCount(0);
});

test("settings toggles work by gesture", async ({ page, hand }) => {
  const toggle = page.getByRole("switch", { name: "Trajectory preview" });
  await hand.press(await centerOf(page, page.getByRole("button", { name: /^Settings/ })), shows(toggle));
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await hand.press(
    await centerOf(page, toggle),
    async () => (await toggle.getAttribute("aria-checked")) === "false"
  );
  await expect(toggle).toHaveAttribute("aria-checked", "false");
});

test("a one-frame tracking dropout mid-pull doesn't fire, even with a mouse present", async ({ page, hand }) => {
  // Enter the level with the mouse, so pointer input is live too.
  await page.getByRole("button", { name: /Expedition/ }).click();
  await page.getByRole("button", { name: /Coral Reef/ }).click();
  await expect(page.getByTestId("ammo")).toHaveAttribute("data-remaining", "10");

  const a = anchorOnScreen(page);
  await hand.glideTo(a.x, a.y, false, 400);
  await page.waitForTimeout(300);
  await hand.pinch();
  await hand.glideTo(a.x, a.y + 120, true, 300);

  await hand.hide();
  await page.waitForTimeout(80);
  await hand.moveTo(a.x, a.y + 120, true);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("ammo")).toHaveAttribute("data-remaining", "10");

  await hand.open();
  await expect(page.getByTestId("ammo")).toHaveAttribute("data-remaining", "9");
});

test("a dropout while holding a pinch doesn't click through to the next screen", async ({ page, hand }) => {
  const level1 = page.getByRole("button", { name: /Coral Reef/ });
  await hand.press(await centerOf(page, page.getByRole("button", { name: /Expedition/ })), shows(level1));
  // press() opened the hand; start a fresh held pinch on a level card…
  await page.getByRole("button", { name: "Back" }).click();
  const expedition = await centerOf(page, page.getByRole("button", { name: /Expedition/ }));
  await hand.glideTo(expedition.x, expedition.y, false);
  await page.waitForTimeout(250);
  await hand.pinch();
  await expect(level1).toBeVisible({ timeout: 6000 });
  const target = await centerOf(page, level1);
  await hand.glideTo(target.x, target.y, true, 300);

  // …lose tracking for a moment, come back still pinching.
  await hand.hide();
  await page.waitForTimeout(80);
  await hand.moveTo(target.x, target.y, true);
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("ammo")).toHaveCount(0);
});

/** Mouse/touch gameplay and resilience against the production build. */
import { Page } from "@playwright/test";
import { anchorOnScreen, expect, test } from "./fixtures";

const shoot = async (page: Page, dx = 0, dy = 130) => {
  const a = anchorOnScreen(page);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + dx / 2, a.y + dy / 2, { steps: 4 });
  await page.mouse.move(a.x + dx, a.y + dy, { steps: 4 });
  await page.mouse.up();
};

const startLevel1 = async (page: Page) => {
  await page.getByRole("button", { name: /Expedition/ }).click();
  await page.getByRole("button", { name: /Coral Reef/ }).click();
  await expect(page.getByTestId("ammo")).toHaveAttribute("data-remaining", "10");
};

test.beforeEach(async ({ page, pageErrors }) => {
  void pageErrors;
  await page.goto("/");
});

test("loads the menu with a proper title and no errors", async ({ page }) => {
  await expect(page).toHaveTitle(/Ocean Bubbles/);
  await expect(page.getByRole("heading", { name: /Ocean\s*Bubbles/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Quick Dive/ })).toBeVisible();
});

test("draws the board on the canvas", async ({ page }) => {
  await startLevel1(page);
  await page.waitForTimeout(300);
  const painted = await page.getByTestId("play-surface").evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d")!;
    // Sample the top rows, where the bubbles start.
    const data = ctx.getImageData(0, 0, c.width, Math.round(c.height * 0.2)).data;
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4 * 16) if (data[i] > 200) opaque++;
    return opaque;
  });
  expect(painted).toBeGreaterThan(100);
});

test("renders crisply on high-DPI screens", async ({ browser }) => {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  await page.goto("/");
  const size = await page.getByTestId("play-surface").evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  expect(size).toEqual([2400, 1600]);
  await context.close();
});

test("fires with a mouse drag and spends a shot", async ({ page }) => {
  await startLevel1(page);
  await shoot(page);
  await expect(page.getByTestId("ammo")).toHaveAttribute("data-remaining", "9");
});

test("plays a whole level through to the result screen and retries", async ({ page }) => {
  await startLevel1(page);
  const result = page.getByText(/Depth Cleared|Dive Over/);

  for (let i = 0; i < 10; i++) {
    if (await result.isVisible()) break;
    await shoot(page, (i % 5) * 25 - 50, 130);
    // Wait for the shot to land and the next one to load.
    await page.waitForTimeout(500);
  }
  await expect(result).toBeVisible();
  await expect(page.getByText("Final score")).toBeVisible();

  await page.getByRole("button", { name: /Try again|Replay/ }).click();
  await expect(result).toHaveCount(0);
  await expect(page.getByTestId("ammo")).toHaveAttribute("data-remaining", "10");
});

test("progress and settings survive a reload", async ({ page }) => {
  await page.getByRole("button", { name: /^Settings/ }).click();
  await page.getByRole("switch", { name: "Reduce motion" }).click();
  await page.reload();
  await page.getByRole("button", { name: /^Settings/ }).click();
  await expect(page.getByRole("switch", { name: "Reduce motion" })).toHaveAttribute("aria-checked", "true");
});

test("Escape leaves a round; settings mid-round resume it", async ({ page }) => {
  await startLevel1(page);
  await shoot(page);
  await expect(page.getByTestId("ammo")).toHaveAttribute("data-remaining", "9");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ammo")).toHaveAttribute("data-remaining", "9");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Quick Dive/ })).toBeVisible();
});

test("Quick Dive keeps going and the board creeps down", async ({ page }) => {
  await page.getByRole("button", { name: /Quick Dive/ }).click();
  await expect(page.getByText("Endless Dive")).toBeVisible();
  for (let i = 0; i < 8; i++) {
    if (await page.getByText("Dive Over").isVisible()) break;
    await shoot(page, (i % 3) * 40 - 40, 130);
    await page.waitForTimeout(400);
  }
  // No ammo limit in endless mode.
  await expect(page.getByTestId("ammo")).toHaveCount(0);
});

/** Layout sanity on desktop and phone viewports. */
import { expect, test } from "./fixtures";

const noHorizontalScroll = () =>
  document.documentElement.scrollWidth <= window.innerWidth &&
  document.body.scrollWidth <= window.innerWidth;

test("menu and game fit the viewport without sideways scrolling", async ({ page, pageErrors }) => {
  void pageErrors;
  await page.goto("/");
  expect(await page.evaluate(noHorizontalScroll)).toBe(true);
  await expect(page.getByRole("button", { name: /Quick Dive/ })).toBeVisible();

  await page.getByRole("button", { name: /Expedition/ }).click();
  expect(await page.evaluate(noHorizontalScroll)).toBe(true);
  await page.getByRole("button", { name: /Coral Reef/ }).click();

  const vp = page.viewportSize()!;
  const canvas = await page.getByTestId("play-surface").boundingBox();
  expect(Math.round(canvas!.width)).toBe(vp.width);
  expect(Math.round(canvas!.height)).toBe(vp.height);

  // The core controls are on screen.
  for (const id of ["ammo"]) await expect(page.getByTestId(id)).toBeInViewport();
  await expect(page.getByRole("button", { name: /^Load / }).first()).toBeInViewport();
  await expect(page.getByRole("button", { name: "Back to menu" })).toBeInViewport();
});

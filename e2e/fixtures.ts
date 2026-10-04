import { Page, expect, test as base } from "@playwright/test";
import { computeLayout } from "../game/engine";
import { GESTURE } from "../gameConfig";

const HANDS_URL = "**/@mediapipe/hands@*/hands.js";

/**
 * Stand-in for MediaPipe Hands. It answers every frame with a synthetic hand
 * built from `window.__hand` ({ x, y } in normalised screen space plus a
 * `pinch` flag), so the real pipeline — camera pump, pinch hysteresis,
 * smoothing, dwell clicks and the slingshot — runs exactly as it does for a
 * player, but under the test's control.
 */
const fakeHandsScript = (margin: number) => `
(() => {
  const M = ${margin};
  window.__hand = null;
  const toCamera = (sx, sy) => ({ x: 1 - (M + sx * (1 - 2 * M)), y: M + sy * (1 - 2 * M) });
  const makeHand = (h) => {
    const c = toCamera(h.x, h.y);
    const gap = h.pinch ? 0.02 : 0.2; // pinch ratio 0.1 vs 1.0 (span is 0.2)
    const lm = Array.from({ length: 21 }, () => ({ x: c.x, y: c.y + 0.15, z: 0 }));
    lm[0] = { x: c.x, y: c.y + 0.3, z: 0 };
    lm[5] = { x: c.x, y: c.y + 0.1, z: 0 };
    lm[4] = { x: c.x - gap / 2, y: c.y, z: 0 };
    lm[8] = { x: c.x + gap / 2, y: c.y, z: 0 };
    return lm;
  };
  window.__handsFrames = 0;
  window.Hands = class {
    setOptions() {}
    onResults(cb) { this.cb = cb; }
    async send() {
      window.__handsFrames++;
      const h = window.__hand;
      this.cb({ multiHandLandmarks: h ? [makeHand(h)] : [] });
    }
  };
})();
`;

export interface HandDriver {
  /** Moves the hand to a viewport pixel position. */
  moveTo(x: number, y: number, pinch?: boolean): Promise<void>;
  /** Glides there over several frames, like a real hand. */
  glideTo(x: number, y: number, pinch: boolean, ms?: number): Promise<void>;
  pinch(): Promise<void>;
  open(): Promise<void>;
  hide(): Promise<void>;
  /**
   * Pinch-and-hold over a point, then let go. With `until`, the pinch is held
   * until that condition holds (so a slow machine doesn't fail the test);
   * otherwise for one dwell period plus a margin.
   */
  press(target: { x: number; y: number }, until?: () => Promise<boolean>): Promise<void>;
}

const handDriver = (page: Page): HandDriver => {
  let pos = { x: 0, y: 0, pinch: false };
  const set = async () => {
    const vp = page.viewportSize()!;
    await page.evaluate(
      (h) => {
        (window as unknown as { __hand: unknown }).__hand = h;
      },
      { x: pos.x / vp.width, y: pos.y / vp.height, pinch: pos.pinch }
    );
  };
  const driver: HandDriver = {
    async moveTo(x, y, pinch = pos.pinch) {
      pos = { x, y, pinch };
      await set();
    },
    async glideTo(x, y, pinch, ms = 300) {
      const from = { ...pos };
      const steps = Math.max(2, Math.round(ms / 30));
      for (let i = 1; i <= steps; i++) {
        pos = { x: from.x + ((x - from.x) * i) / steps, y: from.y + ((y - from.y) * i) / steps, pinch };
        await set();
        await page.waitForTimeout(30);
      }
    },
    async pinch() {
      pos.pinch = true;
      await set();
    },
    async open() {
      pos.pinch = false;
      await set();
    },
    async hide() {
      await page.evaluate(() => {
        (window as unknown as { __hand: unknown }).__hand = null;
      });
    },
    async press(target, until) {
      await driver.glideTo(target.x, target.y, false, 240);
      await page.waitForTimeout(250); // let the smoothing settle on the target
      await driver.pinch();
      if (until) {
        const deadline = Date.now() + 4000;
        await page.waitForTimeout(GESTURE.dwellMs * 0.5);
        while (Date.now() < deadline && !(await until())) await page.waitForTimeout(100);
      } else {
        await page.waitForTimeout(GESTURE.dwellMs + 350);
      }
      await driver.open();
      await page.waitForTimeout(150);
    },
  };
  return driver;
};

export const centerOf = async (_page: Page, locator: ReturnType<Page["locator"]>) => {
  const box = await locator.boundingBox();
  expect(box, "element should be on screen").not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
};

/** The slingshot ball's resting position, in viewport pixels. */
export const anchorOnScreen = (page: Page) => {
  const vp = page.viewportSize()!;
  const l = computeLayout(vp.width, vp.height);
  return { x: l.anchor.x * l.scale, y: l.anchor.y * l.scale };
};

/** Collects uncaught page errors and console errors from our own origin. */
const errorCollector = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const url = msg.location()?.url ?? "";
    // Third-party CDNs (fonts, MediaPipe assets) can be slow or offline in CI;
    // only our own code's errors fail a test.
    if (url && !url.startsWith("http://localhost")) return;
    errors.push(`console: ${msg.text()}`);
  });
  return errors;
};

export const test = base.extend<{
  hand: HandDriver;
  pageErrors: string[];
  useFakeHands: boolean;
}>({
  useFakeHands: [true, { option: true }],
  pageErrors: async ({ page }, use) => {
    const errors = errorCollector(page);
    await use(errors);
    expect(errors, "no uncaught errors").toEqual([]);
  },
  page: async ({ page, useFakeHands }, use) => {
    if (useFakeHands) {
      await page.route(HANDS_URL, (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: fakeHandsScript(GESTURE.edgeMargin),
        })
      );
    }
    await use(page);
  },
  hand: async ({ page }, use) => {
    await use(handDriver(page));
  },
});

export { expect };

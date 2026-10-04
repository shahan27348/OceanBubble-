/**
 * Captures promo footage and screenshots of Ocean Bubbles.
 *
 * Drives the production build in Chrome with a scripted hand: MediaPipe is
 * replaced by a stub that reports a synthetic 21-point hand, so the game's real
 * gesture pipeline (smoothing, pinch detection, dwell clicks, slingshot) runs as
 * it does for a player. Shots are chosen by reading the board off the canvas and
 * simulating candidate pulls with the game's own physics.
 *
 * Usage:  MEDIA_OUT=<dir> npx vite-node scripts/capture-media.ts
 * Needs the production build served at MEDIA_URL (default http://localhost:4174).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, Page } from "@playwright/test";
import { Bubble, BubbleColor } from "../types";
import { COLOR_CONFIG, COLOR_KEYS, GESTURE, GRID, PHYSICS, adjustColor } from "../gameConfig";
import {
  Layout,
  arenaBounds,
  cellPosition,
  cellsInRow,
  computeLayout,
  findLandingCell,
  launchVelocity,
  predictTrajectory,
  resolveShot,
} from "../game/engine";

const OUT = process.env.MEDIA_OUT ?? path.resolve("media-out");
const URL = process.env.MEDIA_URL ?? "http://localhost:4174";
const W = 1920;
const H = 1080;
const FRAMES = path.join(OUT, "frames");
fs.mkdirSync(FRAMES, { recursive: true });

/* ------------------------------------------------------------ Fake hand rig */

const handScript = (margin: number) => `
(() => {
  const M = ${margin};
  window.__hand = null;      // { x, y, pinch } in normalised screen space
  let gap = 0.2;
  const toCam = (sx, sy) => ({ x: 1 - (M + sx * (1 - 2 * M)), y: M + sy * (1 - 2 * M) });
  const add = (c, o) => ({ x: c.x + o[0], y: c.y + o[1], z: 0 });
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: 0 });
  const makeHand = (h) => {
    gap += ((h.pinch ? 0.018 : 0.2) - gap) * 0.35;
    const j = () => (Math.random() - 0.5) * 0.0015;
    const c = toCam(h.x, h.y);
    c.x += j(); c.y += j();
    const d = [-0.8, 0.6];
    const thumbTip = add(c, [d[0] * gap / 2, d[1] * gap / 2]);
    const indexTip = add(c, [-d[0] * gap / 2, -d[1] * gap / 2]);
    const lm = [];
    lm[0] = add(c, [0.06, 0.32]);
    lm[1] = add(c, [-0.02, 0.26]);
    lm[2] = add(c, [-0.07, 0.19]);
    lm[4] = thumbTip;
    lm[3] = add(lerp(lm[2], thumbTip, 0.55), [-0.015, 0]);
    lm[5] = add(c, [0.02, 0.125]);
    lm[8] = indexTip;
    lm[6] = add(lerp(lm[5], indexTip, 0.4), [0.02, 0]);
    lm[7] = add(lerp(lm[5], indexTip, 0.72), [0.012, 0]);
    const curl = h.pinch ? 0.02 : 0;
    lm[9] = add(c, [0.065, 0.135]);  lm[10] = add(c, [0.075, 0.06 + curl]);
    lm[11] = add(c, [0.08, 0.01 + curl * 2]); lm[12] = add(c, [0.085, -0.03 + curl * 3]);
    lm[13] = add(c, [0.1, 0.155]);   lm[14] = add(c, [0.115, 0.09 + curl]);
    lm[15] = add(c, [0.12, 0.045 + curl * 2]); lm[16] = add(c, [0.125, 0.01 + curl * 3]);
    lm[17] = add(c, [0.13, 0.185]);  lm[18] = add(c, [0.145, 0.135 + curl]);
    lm[19] = add(c, [0.152, 0.105 + curl * 2]); lm[20] = add(c, [0.158, 0.075 + curl * 3]);
    return lm;
  };
  window.Hands = class {
    setOptions() {}
    onResults(cb) { this.cb = cb; }
    async send() {
      const h = window.__hand;
      this.cb({ multiHandLandmarks: h ? [makeHand(h)] : [] });
    }
  };
})();
`;

/** A dark, softly lit stand-in camera feed for the corner preview. */
const cameraScript = `
(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 960; canvas.height = 540;
  const ctx = canvas.getContext("2d");
  let t = 0;
  const paint = () => {
    t += 0.01;
    const g = ctx.createRadialGradient(480 + Math.sin(t) * 40, 200, 40, 480, 270, 620);
    g.addColorStop(0, "#29475c"); g.addColorStop(0.55, "#132634"); g.addColorStop(1, "#060d14");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 540);
    requestAnimationFrame(paint);
  };
  paint();
  const stream = canvas.captureStream(30);
  navigator.mediaDevices.getUserMedia = async () => stream;
})();
`;

/* ------------------------------------------------------------- Recording */

const markers: Record<string, number> = {};
const frames: { t: number; file: string }[] = [];
let frameNo = 0;
const mark = (name: string) => {
  markers[name] = Date.now() / 1000;
  console.log("mark", name);
};

const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log("screenshot", name);
};

/* ----------------------------------------------------------- Hand control */

let handPos = { x: W * 0.8, y: H * 1.1, pinch: false };
const setHand = (page: Page, h: { x: number; y: number; pinch: boolean } | null) =>
  page.evaluate((v) => {
    (window as unknown as { __hand: unknown }).__hand = v;
  }, h && { x: h.x / W, y: h.y / H, pinch: h.pinch });

const ease = (t: number) => t * t * (3 - 2 * t);

const glide = async (page: Page, x: number, y: number, pinch: boolean, ms = 600) => {
  const from = { ...handPos };
  const steps = Math.max(2, Math.round(ms / 20));
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    handPos = { x: from.x + (x - from.x) * k, y: from.y + (y - from.y) * k, pinch };
    await setHand(page, handPos);
    await page.waitForTimeout(20);
  }
};

const pinch = async (page: Page, on: boolean) => {
  handPos = { ...handPos, pinch: on };
  await setHand(page, handPos);
};

const centerOf = async (_page: Page, selector: ReturnType<Page["locator"]>) => {
  const b = (await selector.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** Point at a control, pinch and hold until it activates. */
const press = async (page: Page, target: { x: number; y: number }, done: () => Promise<boolean>) => {
  await glide(page, target.x, target.y, false, 700);
  await page.waitForTimeout(450);
  await pinch(page, true);
  const deadline = Date.now() + 5000;
  await page.waitForTimeout(GESTURE.dwellMs * 0.6);
  while (Date.now() < deadline && !(await done())) await page.waitForTimeout(60);
  await page.waitForTimeout(120);
  await pinch(page, false);
  await page.waitForTimeout(250);
};

/* ------------------------------------------------------- Reading the board */

const shadeTable = COLOR_KEYS.flatMap((key) =>
  [0, 0.2, 0.4, 0.6, 0.8].map((f) => {
    const hex = adjustColor(COLOR_CONFIG[key].hex, Math.round(-70 * f)).replace("#", "");
    return {
      key,
      rgb: [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)),
    };
  })
);

const classify = (px: number[]): BubbleColor | null => {
  // The canvas is transparent over the backdrop; faint tints aren't bubbles.
  if (px[3] < 200) return null;
  let best: BubbleColor | null = null;
  let bestD = Infinity;
  for (const s of shadeTable) {
    const d = Math.hypot(px[0] - s.rgb[0], px[1] - s.rgb[1], px[2] - s.rgb[2]);
    if (d < bestD) {
      bestD = d;
      best = s.key;
    }
  }
  return bestD < 55 ? best : null;
};

const readBoard = async (page: Page, layout: Layout): Promise<Bubble[]> => {
  const R = GRID.bubbleRadius;
  const offsets = [
    [0, 0],
    [0.55, 0.15],
    [-0.15, 0.6],
    [0.35, -0.5],
  ];
  const cells: { r: number; c: number; pts: number[][] }[] = [];
  for (let r = 0; r < 18; r++) {
    for (let c = 0; c < cellsInRow(r); c++) {
      const p = cellPosition(r, c, layout.arenaLeft);
      if (p.y > layout.dangerY) continue;
      cells.push({
        r,
        c,
        pts: offsets.map(([ox, oy]) => [(p.x + ox * R) * layout.scale, (p.y + oy * R) * layout.scale]),
      });
    }
  }
  const samples: number[][][] = await page.evaluate((cs) => {
    const cv = document.querySelector<HTMLCanvasElement>("[data-testid=play-surface]")!;
    const ctx = cv.getContext("2d")!;
    const dpr = cv.width / cv.clientWidth;
    return cs.map((cell) =>
      cell.pts.map(([x, y]) =>
        Array.from(ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data)
      )
    );
  }, cells);

  const board: Bubble[] = [];
  cells.forEach((cell, i) => {
    const votes = new Map<BubbleColor, number>();
    for (const px of samples[i]) {
      const k = classify(px);
      if (k) votes.set(k, (votes.get(k) ?? 0) + 1);
    }
    const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) {
      board.push({
        id: `${cell.r},${cell.c}`,
        row: cell.r,
        col: cell.c,
        ...cellPosition(cell.r, cell.c, layout.arenaLeft),
        color: top[0],
        active: true,
      });
    }
  });
  return board;
};

/* ---------------------------------------------------------- Picking a shot */

interface Plan {
  pull: { x: number; y: number }; // world offset from the anchor
  score: number;
}

const planShot = (board: Bubble[], layout: Layout, color: BubbleColor): Plan => {
  const bounds = arenaBounds(layout);
  let best: Plan = { pull: { x: 0, y: PHYSICS.maxDragDist }, score: -1 };
  for (let deg = 18; deg <= 162; deg += 1.5) {
    for (const power of [1]) {
      const a = (deg * Math.PI) / 180;
      const len = PHYSICS.maxDragDist * power;
      const dir = { x: Math.cos(a), y: -Math.sin(a) };
      const v = launchVelocity(dir.x * len, dir.y * len);
      const { landing } = predictTrajectory(layout.anchor, v, board, bounds, layout.worldH);
      if (!landing) continue;
      const cell = findLandingCell(board, landing, layout.arenaLeft);
      const clone = board.map((b) => ({ ...b }));
      const landed: Bubble = { id: "new", ...cell, color, active: true };
      clone.push(landed);
      const res = resolveShot(clone, landed, 0);
      const score =
        res.popped.length + res.dropped.length * 1.3 + res.fishFreed * 5 - Math.abs(90 - deg) / 400;
      if (score > best.score) best = { pull: { x: -dir.x * len, y: -dir.y * len }, score };
    }
  }
  return best;
};

const selectedColor = async (page: Page) => {
  const labels = await page
    .getByRole("button", { name: /^Load / })
    .evaluateAll((els) => els.map((e) => [e.getAttribute("aria-label"), e.getAttribute("aria-pressed")]));
  const toKey = (label: string | null) =>
    COLOR_KEYS.find((k) => `Load ${COLOR_CONFIG[k].label}` === label)!;
  const sel = labels.find((l) => l[1] === "true")!;
  const other = labels.find((l) => l[1] !== "true") ?? sel;
  return { selected: toKey(sel[0]), other: toKey(other[0]), otherIndex: labels.indexOf(other) };
};

/** Pinch the ball, pull it back along `plan`, hold, release. */
const fire = async (page: Page, layout: Layout, plan: Plan, onAim?: () => Promise<void>) => {
  const a = { x: layout.anchor.x * layout.scale, y: layout.anchor.y * layout.scale };
  await glide(page, a.x, a.y - 4, false, 450);
  await page.waitForTimeout(280);
  await pinch(page, true);
  await page.waitForTimeout(200);
  const k = layout.scale * 1.06; // a touch past max stretch; the game clamps it
  await glide(page, a.x + plan.pull.x * k, a.y + plan.pull.y * k, true, 600);
  await page.waitForTimeout(650);
  if (onAim) await onAim();
  await pinch(page, false);
  await page.waitForTimeout(120);
  await glide(page, a.x + plan.pull.x * 0.5, a.y + 60, false, 300);
};

/* --------------------------------------------------------------- Session */

const seed = {
  progress: {
    1: { unlocked: true, stars: 3, bestScore: 6420 },
    2: { unlocked: true, stars: 3, bestScore: 8810 },
    3: { unlocked: true, stars: 2, bestScore: 9150 },
    4: { unlocked: true, stars: 0, bestScore: 0 },
  },
  aquarium: { 1: 3, 2: 4, 3: 5 },
  totalFishRescued: 12,
  highScore: 18450,
  settings: {
    volume: 0.8,
    muted: true,
    colorBlindSymbols: false,
    reduceMotion: false,
    showTrajectory: true,
    showCamera: true,
    pinchSensitivity: 1,
  },
};

const main = async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  await page.route("**/@mediapipe/hands@*/hands.js", (r) =>
    r.fulfill({ contentType: "application/javascript", body: handScript(GESTURE.edgeMargin) })
  );
  await page.addInitScript(cameraScript);
  await page.addInitScript((s) => {
    if (!localStorage.getItem("ocean-bubbles:v1")) localStorage.setItem("ocean-bubbles:v1", s);
  }, JSON.stringify(seed));
  page.on("pageerror", (e) => console.error("pageerror", e.message));

  const client = await context.newCDPSession(page);
  client.on("Page.screencastFrame", async (f) => {
    const file = path.join(FRAMES, `f${String(frameNo++).padStart(6, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ t: f.metadata.timestamp ?? Date.now() / 1000, file });
    await client.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
  });

  await page.goto(URL);
  await page.getByRole("status").waitFor({ state: "detached", timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await client.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H });
  await page.waitForTimeout(600);

  /* Home */
  mark("home");
  const expedition = page.getByRole("button", { name: /Expedition/ });
  await glide(page, W * 0.62, H * 0.62, false, 900);
  await glide(page, ...(Object.values(await centerOf(page, expedition)) as [number, number]), false, 900);
  await page.waitForTimeout(500);
  await shot(page, "01-home");
  const level = page.getByRole("button", { name: new RegExp(process.env.MEDIA_LEVEL ?? "Deep Blue") });
  mark("home-press");
  await press(page, await centerOf(page, expedition), () => level.isVisible());

  /* Levels */
  mark("levels");
  await page.waitForTimeout(500);
  await glide(page, ...(Object.values(await centerOf(page, level)) as [number, number]), false, 900);
  await page.waitForTimeout(500);
  await shot(page, "02-levels");
  await press(page, await centerOf(page, level), () => page.getByTestId("ammo").isVisible());

  /* Game */
  mark("game");
  await page.waitForTimeout(900);
  const vp = page.viewportSize()!;
  const layout = computeLayout(vp.width, vp.height);
  let aimShot = false;
  let comboShot = false;

  for (let i = 0; i < 18; i++) {
    if (await page.getByText(/Depth Cleared|Dive Over/).isVisible()) break;
    await page.waitForTimeout(150);
    const t0 = Date.now();
    const board = await readBoard(page, layout);
    const { selected, other, otherIndex } = await selectedColor(page);
    let plan = planShot(board, layout, selected);
    const alt = planShot(board, layout, other);
    if (alt.score > plan.score + 1.5 && other !== selected) {
      // Switch colour with a pinch on the colour picker — part of the show.
      mark(`switch-${i}`);
      const btn = page.getByRole("button", { name: /^Load / }).nth(otherIndex);
      await press(page, await centerOf(page, btn), async () =>
        (await btn.getAttribute("aria-pressed")) === "true"
      );
      plan = alt;
    }
    console.log(`shot ${i}: ${selected} score ${plan.score.toFixed(2)} board ${board.length} plan ${Date.now() - t0}ms`);
    mark(`shot-${i}`);
    const scoreBefore = Number(await page.getByTestId("score").getAttribute("data-score"));
    await fire(page, layout, plan, async () => {
      if (!aimShot && plan.score >= 2 && Math.abs(plan.pull.x) > 60) {
        aimShot = true;
        await shot(page, "03-aim");
      }
    });
    await page.waitForTimeout(450);
    const scoreAfter = Number(await page.getByTestId("score").getAttribute("data-score"));
    if (scoreAfter > scoreBefore) mark(`pop-${i}`);
    if (!comboShot && scoreAfter > scoreBefore && (await page.getByText(/^[2-5]×$/).count()) > 0) {
      comboShot = true;
      await shot(page, "04-combo");
    }
  }

  /* Result */
  const result = page.getByText(/Depth Cleared|Dive Over/);
  if (await result.isVisible()) {
    mark("result");
    await page.waitForTimeout(2200);
    await shot(page, "05-result");
    await page.waitForTimeout(800);
    await press(page, await centerOf(page, page.getByRole("button", { name: /Home/ }).last()), () =>
      page.getByRole("button", { name: /Quick Dive/ }).isVisible()
    );
  } else {
    await press(page, await centerOf(page, page.getByRole("button", { name: "Back to menu" })), () =>
      page.getByRole("button", { name: /Quick Dive/ }).isVisible()
    );
  }

  /* Settings calibration */
  mark("settings");
  const settings = page.getByRole("button", { name: /^Settings/ });
  await press(page, await centerOf(page, settings), () =>
    page.getByText("Pinch calibration").isVisible()
  );
  await page.waitForTimeout(400);
  const meter = await centerOf(page, page.getByText("Pinch calibration"));
  await glide(page, meter.x + 260, meter.y + 90, false, 700);
  await page.waitForTimeout(500);
  await pinch(page, true);
  await page.waitForTimeout(900);
  await shot(page, "06-calibration");
  await pinch(page, false);
  await page.waitForTimeout(800);
  mark("end");

  await client.send("Page.stopScreencast");
  await page.waitForTimeout(300);
  fs.writeFileSync(path.join(OUT, "markers.json"), JSON.stringify({ markers, frames }, null, 1));
  await browser.close();
  console.log(`done: ${frames.length} frames`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

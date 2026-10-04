import { describe, expect, it } from "vitest";
import { GESTURE } from "../../gameConfig";
import {
  Landmark,
  OneEuroFilter,
  PointFilter,
  cameraToScreen,
  detectPinch,
  handSpan,
  isValidHand,
  pickReleasePoint,
  pinchMidpoint,
  pinchRatio,
  trackingQuality,
} from "../../game/gesture";

/** A synthetic 21-point hand. `gap` is the thumb–index distance. */
const makeHand = (opts: { cx?: number; cy?: number; scale?: number; gap?: number } = {}): Landmark[] => {
  const { cx = 0.5, cy = 0.5, scale = 1, gap = 0.2 } = opts;
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  lm[0] = { x: cx, y: cy + 0.2 * scale, z: 0 }; // wrist
  lm[5] = { x: cx, y: cy, z: 0 }; // index knuckle → span = 0.2 * scale
  lm[4] = { x: cx - (gap * scale) / 2, y: cy - 0.1 * scale, z: 0 }; // thumb tip
  lm[8] = { x: cx + (gap * scale) / 2, y: cy - 0.1 * scale, z: 0 }; // index tip
  return lm;
};

describe("hand validation", () => {
  it("accepts a full hand and rejects junk", () => {
    expect(isValidHand(makeHand())).toBe(true);
    expect(isValidHand([])).toBe(false);
    expect(isValidHand(null)).toBe(false);
    const broken = makeHand();
    broken[8] = { x: NaN, y: 0.5 };
    expect(isValidHand(broken)).toBe(false);
  });
});

describe("pinchRatio", () => {
  it("is the thumb–index gap measured in hand spans", () => {
    const lm = makeHand({ gap: 0.1 });
    expect(handSpan(lm)).toBeCloseTo(0.2);
    expect(pinchRatio(lm)).toBeCloseTo(0.5);
  });

  it("reads the same pinch the same at any distance from the camera", () => {
    const near = pinchRatio(makeHand({ scale: 1.6, gap: 0.08 }));
    const far = pinchRatio(makeHand({ scale: 0.5, gap: 0.08 }));
    expect(near).toBeCloseTo(far, 6);
  });

  it("does not divide by zero for a degenerate hand", () => {
    const lm = makeHand({ scale: 0 });
    expect(Number.isFinite(pinchRatio(lm))).toBe(true);
  });
});

describe("detectPinch hysteresis", () => {
  const enter = GESTURE.pinchRatio;
  const exit = GESTURE.releaseRatio;
  const between = (enter + exit) / 2;

  it("needs a tight pinch to start but a wide open hand to release", () => {
    expect(detectPinch(between, false)).toBe(false); // not tight enough to start
    expect(detectPinch(enter - 0.01, false)).toBe(true);
    expect(detectPinch(between, true)).toBe(true); // held through the dead band
    expect(detectPinch(exit + 0.01, true)).toBe(false);
  });

  it("doesn't chatter when the ratio jitters around the start threshold", () => {
    let pinching = false;
    let toggles = 0;
    for (let i = 0; i < 200; i++) {
      const ratio = enter + (i % 2 === 0 ? -0.02 : 0.02);
      const next = detectPinch(ratio, pinching);
      if (next !== pinching) toggles++;
      pinching = next;
    }
    expect(toggles).toBe(1);
  });

  it("scales both thresholds with sensitivity", () => {
    expect(detectPinch(enter * 1.3, false, 1)).toBe(false);
    expect(detectPinch(enter * 1.3, false, 1.4)).toBe(true);
  });
});

describe("pinch points", () => {
  it("midpoint sits between thumb and index", () => {
    const lm = makeHand({ cx: 0.3, gap: 0.2 });
    expect(pinchMidpoint(lm).x).toBeCloseTo(0.3);
  });

  it("quality is clamped to 0.15..1", () => {
    expect(trackingQuality(makeHand({ scale: 0.01 }))).toBe(0.15);
    expect(trackingQuality(makeHand({ scale: 5 }))).toBe(1);
  });
});

describe("cameraToScreen", () => {
  it("mirrors x so moving your hand right moves the cursor right", () => {
    expect(cameraToScreen({ x: 0.2, y: 0.5 }, 0).x).toBeCloseTo(0.8);
  });

  it("trims the edges so the corners are reachable", () => {
    const m = 0.1;
    expect(cameraToScreen({ x: 1 - m, y: m }, m)).toEqual({ x: 0, y: 0 });
    expect(cameraToScreen({ x: m, y: 1 - m }, m)).toEqual({ x: 1, y: 1 });
    expect(cameraToScreen({ x: 0.5, y: 0.5 }, m)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("clamps points outside the active area", () => {
    const p = cameraToScreen({ x: -0.5, y: 1.5 }, 0.1);
    expect(p).toEqual({ x: 1, y: 1 });
  });

  it("handles an absurd margin without NaN", () => {
    const p = cameraToScreen({ x: 0.5, y: 0.5 }, 0.6);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

describe("OneEuroFilter", () => {
  it("passes the first sample through untouched", () => {
    expect(new OneEuroFilter().filter(0.42, 0)).toBe(0.42);
  });

  it("smooths jitter on a still hand", () => {
    const f = new OneEuroFilter();
    let maxDev = 0;
    for (let i = 0; i < 120; i++) {
      const noisy = 0.5 + (i % 2 === 0 ? 0.01 : -0.01);
      const out = f.filter(noisy, i * 33);
      if (i > 20) maxDev = Math.max(maxDev, Math.abs(out - 0.5));
    }
    expect(maxDev).toBeLessThan(0.004);
  });

  it("follows a fast move with little lag", () => {
    const f = new OneEuroFilter();
    let out = 0;
    for (let i = 0; i <= 15; i++) out = f.filter(i / 15, i * 16);
    expect(out).toBeGreaterThan(0.85);
  });

  it("ignores out-of-order timestamps", () => {
    const f = new OneEuroFilter();
    f.filter(0.2, 100);
    expect(f.filter(0.9, 50)).toBe(0.2);
  });

  it("starts fresh after reset", () => {
    const f = new PointFilter();
    f.filter({ x: 0, y: 0 }, 0);
    f.filter({ x: 0, y: 0 }, 16);
    f.reset();
    expect(f.filter({ x: 1, y: 1 }, 32)).toEqual({ x: 1, y: 1 });
  });
});

describe("pickReleasePoint", () => {
  const history = [
    { x: 0, y: 0, t: 0 },
    { x: 1, y: 1, t: 50 },
    { x: 2, y: 2, t: 100 },
    { x: 9, y: 9, t: 160 }, // fingers opening: the point lurches
  ];

  it("aims from just before the fingers opened", () => {
    expect(pickReleasePoint(history, 180, 90)).toEqual({ x: 1, y: 1 });
  });

  it("uses the oldest sample for a very short pull", () => {
    expect(pickReleasePoint(history, 120, 500)).toEqual({ x: 0, y: 0 });
  });

  it("returns null with no history", () => {
    expect(pickReleasePoint([], 100)).toBeNull();
  });
});

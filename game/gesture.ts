/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Pure hand-tracking maths: pinch detection, smoothing and screen mapping. */

import { Point } from "../types";
import { GESTURE } from "../gameConfig";

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

const THUMB_TIP = 4;
const INDEX_TIP = 8;
const WRIST = 0;
const INDEX_MCP = 5;

export const isValidHand = (lm: unknown): lm is Landmark[] =>
  Array.isArray(lm) &&
  lm.length >= 21 &&
  [THUMB_TIP, INDEX_TIP, WRIST, INDEX_MCP].every(
    (i) => Number.isFinite(lm[i]?.x) && Number.isFinite(lm[i]?.y)
  );

/** Wrist to index knuckle: a stable yardstick for how big the hand appears. */
export const handSpan = (lm: Landmark[]) =>
  Math.hypot(lm[WRIST].x - lm[INDEX_MCP].x, lm[WRIST].y - lm[INDEX_MCP].y);

/**
 * Thumb-to-index distance normalised by hand span, so the same physical pinch
 * reads the same whether the hand is near the camera or far from it.
 */
export const pinchRatio = (lm: Landmark[]) => {
  const span = handSpan(lm) || 0.001;
  return (
    Math.hypot(lm[THUMB_TIP].x - lm[INDEX_TIP].x, lm[THUMB_TIP].y - lm[INDEX_TIP].y) / span
  );
};

/**
 * Two thresholds (hysteresis) so a hand hovering at the boundary doesn't
 * flicker between pinched and open and fire the slingshot by accident.
 */
export const detectPinch = (ratio: number, wasPinching: boolean, sensitivity = 1) =>
  wasPinching
    ? ratio < GESTURE.releaseRatio * sensitivity
    : ratio < GESTURE.pinchRatio * sensitivity;

export const pinchMidpoint = (lm: Landmark[]): Point => ({
  x: (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2,
  y: (lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2,
});

export const indexTip = (lm: Landmark[]): Point => ({ x: lm[INDEX_TIP].x, y: lm[INDEX_TIP].y });

/** Rough confidence proxy: tiny hands (far away) track worse. */
export const trackingQuality = (lm: Landmark[]) => Math.max(0.15, Math.min(1, handSpan(lm) * 3.2));

/**
 * Converts a raw camera-space point (0..1, un-mirrored) into normalised screen
 * space: mirrored so moving right moves right, and with the edges trimmed so
 * the corners are reachable without leaving the camera's view.
 */
export const cameraToScreen = (p: Point, margin: number = GESTURE.edgeMargin): Point => {
  const remap = (v: number) => {
    const span = 1 - margin * 2;
    return Math.max(0, Math.min(1, (v - margin) / (span > 0 ? span : 1)));
  };
  return { x: remap(1 - p.x), y: remap(p.y) };
};

/* ---------------------------------------------------------- One-euro filter */

/**
 * The one-euro filter (Casiez et al., 2012): heavy smoothing while the hand is
 * still, light smoothing while it moves. Removes landmark jitter without the
 * constant lag of a plain moving average.
 */
export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private lastT: number | null = null;

  constructor(
    private minCutoff: number = GESTURE.filterMinCutoff,
    private beta: number = GESTURE.filterBeta,
    private dCutoff = 1
  ) {}

  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.lastT = null;
  }

  /** `t` is in milliseconds. */
  filter(value: number, t: number) {
    if (this.x === null || this.lastT === null || t <= this.lastT) {
      const first = this.x === null;
      if (first) this.x = value;
      this.lastT = t;
      return first ? value : this.x!;
    }
    const dt = (t - this.lastT) / 1000;
    this.lastT = t;

    const rawDx = (value - this.x) / dt;
    this.dx += OneEuroFilter.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuroFilter.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

export class PointFilter {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;
  constructor(minCutoff?: number, beta?: number) {
    this.fx = new OneEuroFilter(minCutoff, beta);
    this.fy = new OneEuroFilter(minCutoff, beta);
  }
  reset() {
    this.fx.reset();
    this.fy.reset();
  }
  filter(p: Point, t: number): Point {
    return { x: this.fx.filter(p.x, t), y: this.fy.filter(p.y, t) };
  }
}

/* ------------------------------------------------------------- Release aim */

export interface TimedPoint extends Point {
  t: number;
}

/**
 * The sample to fire from when the pinch opens. Spreading the fingers drags the
 * pinch midpoint in the last few frames, which would knock the shot off line,
 * so aim from the newest sample that is at least `lookbackMs` old.
 */
export const pickReleasePoint = (
  history: TimedPoint[],
  now: number,
  lookbackMs: number = GESTURE.releaseLookbackMs
): Point | null => {
  if (history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (now - history[i].t >= lookbackMs) return { x: history[i].x, y: history[i].y };
  }
  return { x: history[0].x, y: history[0].y };
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure game rules. Nothing in here touches React, the DOM or the clock, so the
 * whole ruleset can be unit tested and the render loop stays a thin shell.
 *
 * Coordinates are in "world" units: CSS pixels divided by the layout scale, so
 * the board keeps the same proportions on a phone and on a 4K monitor.
 */

import { Bubble, BubbleColor, GameOutcome, LevelConfig, Point } from "../types";
import { COLOR_CONFIG, COLOR_KEYS, GRID, PHYSICS, STAR_THRESHOLDS } from "../gameConfig";

export type Rng = () => number;

/* ------------------------------------------------------------------- Layout */

export interface Layout {
  /** CSS pixels per world unit (<= 1; the board only ever shrinks to fit). */
  scale: number;
  worldW: number;
  worldH: number;
  arenaLeft: number;
  arenaWidth: number;
  anchor: Point;
  dangerY: number;
}

export const ARENA_WIDTH = GRID.cols * GRID.bubbleRadius * 2;

export const computeLayout = (cssW: number, cssH: number): Layout => {
  const w = Math.max(1, cssW);
  const h = Math.max(1, cssH);
  // The HUD under the slingshot is a fixed size on screen, so only the space
  // above it is available to the board.
  const boardCss = Math.max(1, h - GRID.hudReserve);
  const scale = Math.max(
    GRID.minScale,
    Math.min(1, w / GRID.minWorldWidth, boardCss / GRID.minBoardHeight)
  );
  const worldW = w / scale;
  const worldH = h / scale;
  const anchor = { x: worldW / 2, y: (h - GRID.hudReserve) / scale };
  return {
    scale,
    worldW,
    worldH,
    arenaLeft: (worldW - ARENA_WIDTH) / 2,
    arenaWidth: ARENA_WIDTH,
    anchor,
    dangerY: anchor.y - GRID.dangerMargin,
  };
};

/** Walls the projectile bounces between, and the ceiling it sticks to. */
export interface Bounds {
  left: number;
  right: number;
  top: number;
}

export const arenaBounds = (layout: Layout): Bounds => ({
  left: layout.arenaLeft + GRID.bubbleRadius,
  right: layout.arenaLeft + layout.arenaWidth - GRID.bubbleRadius,
  top: GRID.topPadding + GRID.bubbleRadius,
});

/* --------------------------------------------------------------------- Grid */

/** Odd rows are offset by half a bubble, so they hold one fewer cell. */
export const cellsInRow = (row: number) => (row % 2 !== 0 ? GRID.cols - 1 : GRID.cols);

export const cellPosition = (row: number, col: number, arenaLeft: number): Point => ({
  x:
    arenaLeft +
    GRID.bubbleRadius +
    col * GRID.bubbleRadius * 2 +
    (row % 2 !== 0 ? GRID.bubbleRadius : 0),
  y: GRID.topPadding + GRID.bubbleRadius + row * GRID.rowHeight,
});

export const cellKey = (row: number, col: number) => `${row},${col}`;

/** The six hex neighbours of a cell, in an "odd rows shifted right" layout. */
export const neighborCells = (row: number, col: number): Array<[number, number]> => {
  const shift = row % 2 !== 0 ? 0 : -1;
  return [
    [row, col - 1],
    [row, col + 1],
    [row - 1, col + shift],
    [row - 1, col + shift + 1],
    [row + 1, col + shift],
    [row + 1, col + shift + 1],
  ];
};

export const isValidCell = (row: number, col: number) =>
  row >= 0 && col >= 0 && col < cellsInRow(row);

export const areNeighbors = (a: Pick<Bubble, "row" | "col">, b: Pick<Bubble, "row" | "col">) =>
  neighborCells(a.row, a.col).some(([r, c]) => r === b.row && c === b.col);

const indexActive = (bubbles: Bubble[]) => {
  const map = new Map<string, Bubble>();
  for (const b of bubbles) if (b.active) map.set(cellKey(b.row, b.col), b);
  return map;
};

/** Flood fill from `start`, optionally restricted to bubbles of its colour. */
export const findCluster = (bubbles: Bubble[], start: Bubble, matchColor = true): Bubble[] => {
  const byCell = indexActive(bubbles);
  const seen = new Set<string>([cellKey(start.row, start.col)]);
  const queue = [start];
  const cluster: Bubble[] = [];

  while (queue.length) {
    const current = queue.shift()!;
    cluster.push(current);
    for (const [r, c] of neighborCells(current.row, current.col)) {
      const key = cellKey(r, c);
      if (seen.has(key)) continue;
      const next = byCell.get(key);
      if (!next) continue;
      if (matchColor && next.color !== start.color) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return cluster;
};

/** Active bubbles with no path back to the ceiling. */
export const findOrphans = (bubbles: Bubble[]): Bubble[] => {
  const byCell = indexActive(bubbles);
  const anchored = new Set<string>();
  const queue: Bubble[] = [];

  for (const b of byCell.values()) {
    if (b.row === 0) {
      anchored.add(cellKey(b.row, b.col));
      queue.push(b);
    }
  }
  while (queue.length) {
    const current = queue.shift()!;
    for (const [r, c] of neighborCells(current.row, current.col)) {
      const key = cellKey(r, c);
      if (anchored.has(key)) continue;
      const next = byCell.get(key);
      if (!next) continue;
      anchored.add(key);
      queue.push(next);
    }
  }
  return [...byCell.values()].filter((b) => !anchored.has(cellKey(b.row, b.col)));
};

let idCounter = 0;
export const nextBubbleId = () => `b${++idCounter}`;

const pick = <T,>(list: readonly T[], rng: Rng): T =>
  list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

const shuffle = <T,>(list: T[], rng: Rng): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export interface GridOptions {
  rows: number;
  fishCount: number;
  arenaLeft: number;
  rng?: Rng;
  /** Probability that any given cell is filled. */
  fill?: number;
  colors?: readonly BubbleColor[];
}

/**
 * Builds a starting board. Random holes can strand a bubble with no path to the
 * ceiling; those are removed so a round never starts with floating bubbles, and
 * fish are only placed on bubbles that survive.
 */
export const generateGrid = ({
  rows,
  fishCount,
  arenaLeft,
  rng = Math.random,
  fill = GRID.fill,
  colors = COLOR_KEYS,
}: GridOptions): Bubble[] => {
  const bubbles: Bubble[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cellsInRow(r); c++) {
      // The ceiling row is always full so the board can't start detached.
      if (r > 0 && rng() > fill) continue;
      const { x, y } = cellPosition(r, c, arenaLeft);
      bubbles.push({
        id: nextBubbleId(),
        row: r,
        col: c,
        x,
        y,
        color: pick(colors, rng),
        active: true,
        age: 1,
      });
    }
  }

  const orphans = new Set(findOrphans(bubbles).map((b) => b.id));
  const kept = bubbles.filter((b) => !orphans.has(b.id));

  for (const b of shuffle(kept, rng).slice(0, fishCount)) b.hasFish = true;
  return kept;
};

/** Re-derives every bubble's position, e.g. after the viewport resizes. */
export const relayoutBubbles = (bubbles: Bubble[], arenaLeft: number) => {
  for (const b of bubbles) {
    const { x, y } = cellPosition(b.row, b.col, arenaLeft);
    b.x = x;
    b.y = y;
  }
};

/**
 * Endless mode pressure: the board descends by two rows (two keeps the odd/even
 * offset of every existing bubble intact) and fresh rows fill in at the top.
 */
export const pushRowsDown = (
  bubbles: Bubble[],
  arenaLeft: number,
  rng: Rng = Math.random,
  colors: readonly BubbleColor[] = COLOR_KEYS
): Bubble[] => {
  const moved = bubbles
    .filter((b) => b.active)
    .map((b) => ({ ...b, row: b.row + 2 }));
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cellsInRow(r); c++) {
      moved.push({
        id: nextBubbleId(),
        row: r,
        col: c,
        x: 0,
        y: 0,
        color: pick(colors, rng),
        active: true,
        age: 0,
      });
    }
  }
  relayoutBubbles(moved, arenaLeft);
  return moved;
};

/**
 * Where a projectile that stopped at `pos` comes to rest: the nearest empty cell
 * that is attached to something (the ceiling or another bubble). Restricting to
 * attached cells stops a shot from parking in mid-water.
 */
export const findLandingCell = (
  bubbles: Bubble[],
  pos: Point,
  arenaLeft: number,
  maxRows: number = GRID.maxRows
): { row: number; col: number; x: number; y: number } => {
  type Cell = { row: number; col: number; x: number; y: number };
  const byCell = indexActive(bubbles);
  let best: Cell | null = null;
  let bestDist = Infinity;
  let fallback: Cell | null = null;
  let fallbackDist = Infinity;

  // Always search at least one row past the deepest bubble and past the shot
  // itself, so there is guaranteed to be an empty attached cell — however far
  // endless mode has pushed the board, on however tall a screen.
  let deepest = -1;
  for (const b of byCell.values()) deepest = Math.max(deepest, b.row);
  const posRow = Math.ceil((pos.y - GRID.topPadding - GRID.bubbleRadius) / GRID.rowHeight);
  const rows = Math.max(maxRows, deepest + 2, posRow + 2);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cellsInRow(r); c++) {
      if (byCell.has(cellKey(r, c))) continue;
      const p = cellPosition(r, c, arenaLeft);
      const dist = (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2;
      if (dist < fallbackDist) {
        fallbackDist = dist;
        fallback = { row: r, col: c, ...p };
      }
      const attached =
        r === 0 || neighborCells(r, c).some(([nr, nc]) => byCell.has(cellKey(nr, nc)));
      if (attached && dist < bestDist) {
        bestDist = dist;
        best = { row: r, col: c, ...p };
      }
    }
  }
  return best ?? fallback ?? { row: 0, col: 0, ...cellPosition(0, 0, arenaLeft) };
};

/* ------------------------------------------------------------------ Scoring */

export interface ShotResolution {
  popped: Bubble[];
  dropped: Bubble[];
  fishFreed: number;
  points: number;
  combo: number;
}

export const MAX_MULTIPLIER = 5;

/**
 * Applies the rules for a bubble that just landed: pop a same-colour group of
 * three or more, then drop anything left hanging. Mutates `active` on the
 * affected bubbles and reports what happened.
 */
export const resolveShot = (
  bubbles: Bubble[],
  landed: Bubble,
  comboBefore: number
): ShotResolution => {
  const matches = findCluster(bubbles, landed, true);
  if (matches.length < 3) {
    return { popped: [], dropped: [], fishFreed: 0, points: 0, combo: 0 };
  }

  const combo = comboBefore + 1;
  const multiplier = Math.min(combo, MAX_MULTIPLIER);
  const sizeBonus = matches.length > 3 ? 1.5 : 1;
  let points = Math.floor(
    COLOR_CONFIG[landed.color].points * matches.length * sizeBonus * multiplier
  );

  for (const b of matches) b.active = false;
  const dropped = findOrphans(bubbles);
  for (const b of dropped) {
    b.active = false;
    points += Math.floor(COLOR_CONFIG[b.color].points * 0.5);
  }

  const fishFreed = [...matches, ...dropped].filter((b) => b.hasFish).length;
  return { popped: matches, dropped, fishFreed, points, combo };
};

export const computeStars = (level: LevelConfig, ballsUsed: number) => {
  const leftoverRatio = Math.max(0, level.ballsLimit - ballsUsed) / level.ballsLimit;
  return STAR_THRESHOLDS.filter((t) => leftoverRatio >= t).length;
};

export const lowestBubbleEdge = (bubbles: Bubble[]) =>
  bubbles.reduce(
    (max, b) => (b.active ? Math.max(max, b.y + GRID.bubbleRadius) : max),
    -Infinity
  );

export interface OutcomeInput {
  level: LevelConfig | null;
  bubbles: Bubble[];
  fishFreed: number;
  ballsUsed: number;
  dangerY: number;
}

/**
 * Victory beats defeat when both happen on the same shot. Clearing every bubble
 * in a level also wins, so a board can never be left empty but unwinnable.
 */
export const evaluateOutcome = ({
  level,
  bubbles,
  fishFreed,
  ballsUsed,
  dangerY,
}: OutcomeInput): GameOutcome | null => {
  if (level && fishFreed >= level.fishCount) return "victory";
  if (level && !bubbles.some((b) => b.active)) return "victory";
  if (lowestBubbleEdge(bubbles) > dangerY) return "defeat";
  if (level && ballsUsed >= level.ballsLimit) return "defeat";
  return null;
};

/** 0 when the board is at the ceiling, 1 when it touches the danger line. */
export const computePressure = (bubbles: Bubble[], layout: Layout) => {
  const lowest = lowestBubbleEdge(bubbles);
  if (!Number.isFinite(lowest)) return 0;
  const top = GRID.topPadding + GRID.bubbleRadius * 2;
  const span = layout.dangerY - top;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (lowest - top) / span));
};

/* ------------------------------------------------------------------ Colours */

export interface ColorDeal {
  pair: [BubbleColor, BubbleColor];
  next: BubbleColor;
}

/**
 * Offers two colours still on the board. The colour previewed as "Next" is
 * honoured on the following deal (unless it has since been cleared), so the
 * preview is a promise rather than decoration.
 */
export const dealColors = (
  bubbles: Bubble[],
  promised: BubbleColor | null,
  rng: Rng = Math.random
): ColorDeal => {
  const onBoard = new Set<BubbleColor>();
  for (const b of bubbles) if (b.active) onBoard.add(b.color);
  const pool: BubbleColor[] = onBoard.size > 0 ? COLOR_KEYS.filter((c) => onBoard.has(c)) : [...COLOR_KEYS];

  const first = promised && pool.includes(promised) ? promised : pick(pool, rng);
  const others = pool.filter((c) => c !== first);
  const second = others.length > 0 ? pick(others, rng) : first;
  return { pair: [first, second], next: pick(pool, rng) };
};

/* ------------------------------------------------------------------ Physics */

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Launch velocity for a slingshot pulled back by (dx, dy) from the anchor. */
export const launchVelocity = (dx: number, dy: number): Point => {
  const stretch = Math.hypot(dx, dy);
  const powerRatio = Math.min(stretch / PHYSICS.maxDragDist, 1);
  const mult =
    PHYSICS.minForceMult +
    (PHYSICS.maxForceMult - PHYSICS.minForceMult) * powerRatio * powerRatio;
  return { x: dx * mult, y: dy * mult };
};

/** Clamps a drag point to the slingshot's maximum stretch. */
export const clampDrag = (point: Point, anchor: Point): Point => {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= PHYSICS.maxDragDist) return { ...point };
  const k = PHYSICS.maxDragDist / dist;
  return { x: anchor.x + dx * k, y: anchor.y + dy * k };
};

export interface StepResult {
  hit: boolean;
  bounced: boolean;
}

/**
 * Advances the projectile by one fixed step. Movement is sub-stepped so a fast
 * shot can't tunnel through a bubble. The trajectory preview runs this exact
 * function, so the dotted line is always where the shot really goes.
 */
export const stepBall = (ball: Ball, bubbles: Bubble[], bounds: Bounds): StepResult => {
  const speed = Math.hypot(ball.vx, ball.vy);
  const steps = Math.max(1, Math.ceil(speed / PHYSICS.substepDistance));
  const minDistSq = (GRID.bubbleRadius * PHYSICS.collisionDistance) ** 2;
  let bounced = false;
  let hit = false;

  for (let i = 0; i < steps && !hit; i++) {
    ball.x += ball.vx / steps;
    ball.y += ball.vy / steps;

    if (ball.x < bounds.left) {
      ball.x = bounds.left + (bounds.left - ball.x);
      ball.vx = Math.abs(ball.vx) * PHYSICS.bounceRestitution;
      bounced = true;
    } else if (ball.x > bounds.right) {
      ball.x = bounds.right - (ball.x - bounds.right);
      ball.vx = -Math.abs(ball.vx) * PHYSICS.bounceRestitution;
      bounced = true;
    }

    if (ball.y <= bounds.top) {
      hit = true;
      break;
    }
    for (const b of bubbles) {
      if (b.active && (ball.x - b.x) ** 2 + (ball.y - b.y) ** 2 < minDistSq) {
        hit = true;
        break;
      }
    }
  }

  ball.vy += PHYSICS.gravity;
  ball.vx *= PHYSICS.friction;
  ball.vy *= PHYSICS.friction;
  return { hit, bounced };
};

export interface Trajectory {
  points: Point[];
  landing: Point | null;
}

export const predictTrajectory = (
  start: Point,
  velocity: Point,
  bubbles: Bubble[],
  bounds: Bounds,
  floorY: number,
  maxSteps = 240
): Trajectory => {
  const ball: Ball = { x: start.x, y: start.y, vx: velocity.x, vy: velocity.y };
  const points: Point[] = [{ ...start }];
  for (let i = 0; i < maxSteps; i++) {
    const { hit } = stepBall(ball, bubbles, bounds);
    points.push({ x: ball.x, y: ball.y });
    if (hit) return { points, landing: { x: ball.x, y: ball.y } };
    if (ball.y > floorY) break;
  }
  return { points, landing: null };
};

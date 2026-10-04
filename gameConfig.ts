/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BubbleColor, LevelConfig } from "./types";

/* ------------------------------------------------------------------ Palette */

export const COLOR_CONFIG: Record<
  BubbleColor,
  { hex: string; points: number; label: string; symbol: string }
> = {
  red: { hex: "#ff6b9d", points: 100, label: "Coral", symbol: "✦" },
  blue: { hex: "#4fc3f7", points: 150, label: "Ocean", symbol: "●" },
  green: { hex: "#26c6da", points: 200, label: "Aqua", symbol: "▲" },
  yellow: { hex: "#ffd54f", points: 250, label: "Pearl", symbol: "◆" },
  purple: { hex: "#7e57c2", points: 300, label: "Jellyfish", symbol: "✚" },
  orange: { hex: "#ffab40", points: 500, label: "Starfish", symbol: "★" },
};

export const COLOR_KEYS: BubbleColor[] = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
];

/* ------------------------------------------------------------------- Levels */

export const LEVELS: LevelConfig[] = [
  { id: 1, name: "Coral Reef", depth: 12, fishCount: 3, ballsLimit: 10, rows: 4, biome: "#26c6da" },
  { id: 2, name: "Deep Blue", depth: 48, fishCount: 4, ballsLimit: 12, rows: 5, biome: "#4fc3f7" },
  { id: 3, name: "Kelp Forest", depth: 95, fishCount: 5, ballsLimit: 15, rows: 5, biome: "#66bb6a" },
  { id: 4, name: "Shipwreck", depth: 160, fishCount: 6, ballsLimit: 18, rows: 6, biome: "#ffab40" },
  { id: 5, name: "The Abyss", depth: 240, fishCount: 7, ballsLimit: 20, rows: 6, biome: "#5c6bc0" },
  { id: 6, name: "Atlantis", depth: 340, fishCount: 8, ballsLimit: 22, rows: 7, biome: "#ffd54f" },
  { id: 7, name: "Mariana", depth: 470, fishCount: 9, ballsLimit: 25, rows: 7, biome: "#7e57c2" },
  { id: 8, name: "Arctic Flow", depth: 620, fishCount: 10, ballsLimit: 28, rows: 8, biome: "#b3e5fc" },
  { id: 9, name: "Volcano Reef", depth: 810, fishCount: 12, ballsLimit: 30, rows: 8, biome: "#ff7043" },
  {
    id: 10,
    name: "Poseidon's Temple",
    depth: 1000,
    fishCount: 15,
    ballsLimit: 35,
    rows: 9,
    biome: "#ff6b9d",
  },
];

/** Species awarded per level, collected into the home-screen aquarium. */
export const FISH_SPECIES: Record<number, { emoji: string; name: string }> = {
  1: { emoji: "🐠", name: "Clownfish" },
  2: { emoji: "🐟", name: "Blue Tang" },
  3: { emoji: "🦐", name: "Kelp Shrimp" },
  4: { emoji: "🦞", name: "Wreck Lobster" },
  5: { emoji: "🦑", name: "Abyss Squid" },
  6: { emoji: "🐡", name: "Temple Puffer" },
  7: { emoji: "🦈", name: "Trench Shark" },
  8: { emoji: "🐋", name: "Ice Whale" },
  9: { emoji: "🐙", name: "Magma Octopus" },
  10: { emoji: "🐬", name: "Poseidon Dolphin" },
};

/* ------------------------------------------------------------------ Physics */

export const PHYSICS = {
  gravity: 0.03,
  friction: 0.998,
  bounceRestitution: 0.85,
  maxDragDist: 150,
  minForceMult: 0.3,
  maxForceMult: 0.8,
  collisionDistance: 2.1,
  /** Longest distance the projectile may move between collision checks. */
  substepDistance: 4,
  /** Simulation runs on a fixed step so behaviour no longer tracks webcam FPS. */
  fixedStepMs: 1000 / 60,
  /** A shot still airborne after this long is treated as lost. */
  maxFlightMs: 9000,
  /** Pulls shorter than this snap back instead of firing. */
  minFireStretch: 30,
} as const;

const BUBBLE_RADIUS = 22;

export const GRID = {
  bubbleRadius: BUBBLE_RADIUS,
  cols: 12,
  rowHeight: BUBBLE_RADIUS * Math.sqrt(3),
  /** Minimum rows searched when a shot settles (deeper boards extend it). */
  maxRows: 30,
  /** Chance that a cell below the ceiling row starts filled. */
  fill: 0.9,
  /** Screen space (CSS px, not scaled) kept under the slingshot anchor for
   *  the ammo gauge and colour picker, which don't shrink with the board. */
  hudReserve: 200,
  /** How far above the anchor the losing line sits. */
  dangerMargin: 70,
  /** Vertical padding above the first bubble row. */
  topPadding: 16,
  /** The board scales down below this size so every level has room to play,
   *  even on a short laptop screen. Units are world pixels; the height is
   *  measured from the top of the screen to the slingshot anchor. */
  minWorldWidth: 580,
  minBoardHeight: 640,
  /** Never shrink further than this, however small the window. */
  minScale: 0.35,
} as const;

/** Quick Dive: the board creeps down so a run always ends eventually. */
export const ENDLESS = {
  startRows: 5,
  shotsPerPush: 8,
  clearBonus: 1000,
} as const;

export const GESTURE = {
  /** Baseline pinch ratio, normalised against hand span so distance from the
   *  camera and hand size stop affecting how hard a pinch has to be. */
  pinchRatio: 0.42,
  releaseRatio: 0.55,
  /** Milliseconds a pinch must be held over a control before it activates. */
  dwellMs: 520,
  grabRadius: 120,
  /** Camera space margin trimmed from each edge, so the player can reach the
   *  corners of the screen without stretching out of frame. */
  edgeMargin: 0.12,
  /** One-euro filter tuning for the hand cursor: lower minCutoff = steadier
   *  when still, higher beta = less lag when moving fast. Beta is in
   *  normalised screen units (a full screen per second ≈ 1), hence larger
   *  than the per-pixel values usually quoted. */
  filterMinCutoff: 1.4,
  filterBeta: 4,
  /** Opening the fingers drags the pinch point; aim from just before that. */
  releaseLookbackMs: 90,
  /** A hand sample older than this counts as "no hand". */
  staleMs: 350,
  /** A drag whose hand has been gone this long is cancelled. */
  dragLostMs: 1200,
} as const;

/**
 * How long a combo survives between popping shots (simulation time). Aiming by
 * hand takes a few seconds per shot, so a tight window made chains impossible.
 */
export const COMBO_WINDOW_MS = 8000;

/** Star thresholds as a fraction of the level's ball budget left over. */
export const STAR_THRESHOLDS = [0, 0.2, 0.45] as const;

export const adjustColor = (color: string, amount: number) => {
  const hex = color.replace("#", "");
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  const r = clamp(parseInt(hex.substring(0, 2), 16) + amount);
  const g = clamp(parseInt(hex.substring(2, 4), 16) + amount);
  const b = clamp(parseInt(hex.substring(4, 6), 16) + amount);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

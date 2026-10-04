/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Point {
  x: number;
  y: number;
}

export type BubbleColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';

export interface Bubble {
  id: string;
  row: number;
  col: number;
  x: number;
  y: number;
  color: BubbleColor;
  active: boolean;
  hasFish?: boolean;
  /** 0..1 settle progress after landing; drives the squash-in animation. */
  age?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  radius: number;
}

/* -------------------------------------------------------------- Game shell */

export type Screen = 'home' | 'game' | 'levels' | 'settings';

export interface LevelConfig {
  id: number;
  name: string;
  /** Flavour depth in metres, used by the dive-map layout. */
  depth: number;
  fishCount: number;
  ballsLimit: number;
  rows: number;
  /** Accent colour for the level's biome. */
  biome: string;
}

export interface LevelProgress {
  unlocked: boolean;
  stars: number;
  bestScore: number;
}

export interface GameSettings {
  volume: number;
  muted: boolean;
  /** Show a shape on every bubble so colour is not the only signal. */
  colorBlindSymbols: boolean;
  reduceMotion: boolean;
  showTrajectory: boolean;
  showCamera: boolean;
  /** Multiplier applied to the calibrated pinch threshold. */
  pinchSensitivity: number;
}

export interface SavedState {
  progress: Record<number, LevelProgress>;
  settings: GameSettings;
  aquarium: Record<number, number>;
  totalFishRescued: number;
  highScore: number;
}

export type GameOutcome = 'victory' | 'defeat';

export interface RoundResult {
  outcome: GameOutcome;
  score: number;
  fishFreed: number;
  fishTarget: number;
  ballsUsed: number;
  stars: number;
  bestCombo: number;
  levelId: number | null;
  isNewHighScore: boolean;
}

/* ----------------------------------------------------------------- Gestures */

export type InputMode = 'hand' | 'pointer';

export interface HandSample {
  /** Smoothed pinch midpoint in normalised screen space (0..1, mirrored). */
  point: Point;
  /** Pinch distance normalised against hand span; scale invariant. */
  pinchRatio: number;
  isPinching: boolean;
  /** Tracking confidence proxy, 0..1. */
  quality: number;
  timestamp: number;
}

// MediaPipe Hands is loaded as a classic script from the CDN (see index.html).
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Hands: any;
  }
}

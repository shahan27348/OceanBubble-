/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameSettings, LevelProgress, SavedState } from "../types";
import { LEVELS } from "../gameConfig";

export const STORAGE_KEY = "ocean-bubbles:v1";

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.8,
  muted: false,
  colorBlindSymbols: false,
  reduceMotion: false,
  showTrajectory: true,
  showCamera: true,
  pinchSensitivity: 1,
};

export const PINCH_SENSITIVITY_RANGE = { min: 0.6, max: 1.6 } as const;

const defaultProgress = (): Record<number, LevelProgress> => {
  const progress: Record<number, LevelProgress> = {};
  LEVELS.forEach((level, index) => {
    progress[level.id] = { unlocked: index === 0, stars: 0, bestScore: 0 };
  });
  return progress;
};

export const defaultState = (): SavedState => ({
  progress: defaultProgress(),
  settings: { ...DEFAULT_SETTINGS },
  aquarium: {},
  totalFishRescued: 0,
  highScore: 0,
});

/* --------------------------------------------------------------- Validation */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

const int = (v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Math.floor(num(v, fallback, min, max));

const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

const sanitizeSettings = (raw: unknown): GameSettings => {
  const s = isRecord(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    volume: num(s.volume, d.volume, 0, 1),
    muted: bool(s.muted, d.muted),
    colorBlindSymbols: bool(s.colorBlindSymbols, d.colorBlindSymbols),
    reduceMotion: bool(s.reduceMotion, d.reduceMotion),
    showTrajectory: bool(s.showTrajectory, d.showTrajectory),
    showCamera: bool(s.showCamera, d.showCamera),
    pinchSensitivity: num(
      s.pinchSensitivity,
      d.pinchSensitivity,
      PINCH_SENSITIVITY_RANGE.min,
      PINCH_SENSITIVITY_RANGE.max
    ),
  };
};

/**
 * Anything read back from localStorage is untrusted: an older build, a manual
 * edit or a half-written save can all produce odd shapes. Every field is
 * checked and clamped, and unknown level ids are dropped, so a bad save can
 * degrade to defaults but never crash the game.
 */
export const sanitizeState = (raw: unknown): SavedState => {
  const fallback = defaultState();
  if (!isRecord(raw)) return fallback;

  const progress = fallback.progress;
  const rawProgress = isRecord(raw.progress) ? raw.progress : {};
  for (const level of LEVELS) {
    const entry = rawProgress[level.id];
    if (!isRecord(entry)) continue;
    progress[level.id] = {
      unlocked: bool(entry.unlocked, progress[level.id].unlocked),
      stars: int(entry.stars, 0, 0, 3),
      bestScore: int(entry.bestScore, 0),
    };
  }
  // The first level can never be locked, whatever the save says.
  if (LEVELS[0]) progress[LEVELS[0].id].unlocked = true;

  const aquarium: Record<number, number> = {};
  const rawAquarium = isRecord(raw.aquarium) ? raw.aquarium : {};
  for (const level of LEVELS) {
    const count = int(rawAquarium[level.id], 0);
    if (count > 0) aquarium[level.id] = count;
  }

  return {
    progress,
    settings: sanitizeSettings(raw.settings),
    aquarium,
    totalFishRescued: int(raw.totalFishRescued, 0),
    highScore: int(raw.highScore, 0),
  };
};

/* ------------------------------------------------------------------ Storage */

export const loadState = (): SavedState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return sanitizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
};

export const saveState = (state: SavedState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing or a full quota — progress just stays in memory.
  }
};

export const clearState = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* no-op */
  }
};

/**
 * Pure progression update applied when a round ends: best stars and score are
 * kept, a win unlocks the next level and banks the rescued fish.
 */
export const applyRoundResult = (
  prev: SavedState,
  round: {
    levelId: number | null;
    outcome: "victory" | "defeat";
    score: number;
    stars: number;
    fishFreed: number;
  }
): SavedState => {
  const next: SavedState = {
    ...prev,
    highScore: Math.max(prev.highScore, round.score),
    totalFishRescued: prev.totalFishRescued + round.fishFreed,
    progress: { ...prev.progress },
    aquarium: { ...prev.aquarium },
  };

  if (round.levelId === null) return next;
  const levelId = round.levelId;

  const existing = prev.progress[levelId] ?? { unlocked: true, stars: 0, bestScore: 0 };
  next.progress[levelId] = {
    unlocked: true,
    stars: Math.max(existing.stars, round.stars),
    bestScore: Math.max(existing.bestScore, round.score),
  };

  if (round.outcome === "victory") {
    const index = LEVELS.findIndex((l) => l.id === levelId);
    const following = index >= 0 ? LEVELS[index + 1] : undefined;
    if (following) {
      const prior = prev.progress[following.id];
      next.progress[following.id] = {
        unlocked: true,
        stars: prior?.stars ?? 0,
        bestScore: prior?.bestScore ?? 0,
      };
    }
    next.aquarium[levelId] = Math.max(prev.aquarium[levelId] ?? 0, round.fishFreed);
  }
  return next;
};

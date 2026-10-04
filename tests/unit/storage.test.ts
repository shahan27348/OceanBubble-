import { describe, expect, it, vi } from "vitest";
import { LEVELS } from "../../gameConfig";
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  applyRoundResult,
  clearState,
  defaultState,
  loadState,
  sanitizeState,
  saveState,
} from "../../services/storageService";

describe("defaultState", () => {
  it("unlocks only the first level", () => {
    const s = defaultState();
    expect(s.progress[LEVELS[0].id].unlocked).toBe(true);
    expect(LEVELS.slice(1).every((l) => !s.progress[l.id].unlocked)).toBe(true);
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("returns a fresh copy each time", () => {
    const a = defaultState();
    a.settings.muted = true;
    a.progress[1].stars = 3;
    expect(defaultState().settings.muted).toBe(false);
    expect(defaultState().progress[1].stars).toBe(0);
  });
});

describe("load / save", () => {
  it("round-trips a save", () => {
    const s = defaultState();
    s.highScore = 12345;
    s.settings.volume = 0.3;
    s.progress[2] = { unlocked: true, stars: 2, bestScore: 900 };
    s.aquarium[1] = 3;
    saveState(s);
    expect(loadState()).toEqual(s);
  });

  it("falls back to defaults when nothing is saved", () => {
    expect(loadState()).toEqual(defaultState());
  });

  it("falls back to defaults on corrupted JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadState()).toEqual(defaultState());
  });

  it("keeps working when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(loadState()).toEqual(defaultState());
    expect(() => saveState(defaultState())).not.toThrow();
    expect(() => clearState()).not.toThrow();
  });

  it("clearState removes the save", () => {
    saveState({ ...defaultState(), highScore: 5 });
    clearState();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("sanitizeState", () => {
  it("clamps and type-checks every field from an untrusted save", () => {
    const s = sanitizeState({
      highScore: -50,
      totalFishRescued: "lots",
      settings: {
        volume: 7,
        muted: "yes",
        pinchSensitivity: 99,
        showTrajectory: false,
        bogus: true,
      },
      progress: {
        1: { unlocked: false, stars: 10, bestScore: 1e3 },
        2: { unlocked: true, stars: -1, bestScore: "x" },
        999: { unlocked: true, stars: 3, bestScore: 1 },
      },
      aquarium: { 1: 4, 2: -3, 999: 8, 3: "two" },
    });

    expect(s.highScore).toBe(0);
    expect(s.totalFishRescued).toBe(0);
    expect(s.settings.volume).toBe(1);
    expect(s.settings.muted).toBe(DEFAULT_SETTINGS.muted);
    expect(s.settings.pinchSensitivity).toBe(1.6);
    expect(s.settings.showTrajectory).toBe(false);
    expect(s.settings).not.toHaveProperty("bogus");
    // The first level can never be locked.
    expect(s.progress[1]).toEqual({ unlocked: true, stars: 3, bestScore: 1000 });
    expect(s.progress[2]).toEqual({ unlocked: true, stars: 0, bestScore: 0 });
    expect(s.progress).not.toHaveProperty("999");
    expect(s.aquarium).toEqual({ 1: 4 });
  });

  it("migrates a save from before a level existed", () => {
    const s = sanitizeState({ progress: { 1: { unlocked: true, stars: 3, bestScore: 10 } } });
    for (const level of LEVELS) expect(s.progress[level.id]).toBeDefined();
  });

  it.each([null, 42, "str", [], undefined])("rejects a non-object save (%s)", (raw) => {
    expect(sanitizeState(raw)).toEqual(defaultState());
  });
});

describe("applyRoundResult", () => {
  it("unlocks the next level and banks fish on a win", () => {
    const next = applyRoundResult(defaultState(), {
      levelId: 1,
      outcome: "victory",
      score: 500,
      stars: 2,
      fishFreed: 3,
    });
    expect(next.progress[1]).toEqual({ unlocked: true, stars: 2, bestScore: 500 });
    expect(next.progress[2].unlocked).toBe(true);
    expect(next.aquarium[1]).toBe(3);
    expect(next.highScore).toBe(500);
    expect(next.totalFishRescued).toBe(3);
  });

  it("keeps the best stars and score across replays", () => {
    let s = applyRoundResult(defaultState(), {
      levelId: 1, outcome: "victory", score: 900, stars: 3, fishFreed: 3,
    });
    s = applyRoundResult(s, { levelId: 1, outcome: "victory", score: 100, stars: 1, fishFreed: 3 });
    expect(s.progress[1]).toEqual({ unlocked: true, stars: 3, bestScore: 900 });
    expect(s.highScore).toBe(900);
  });

  it("doesn't unlock anything on a loss", () => {
    const s = applyRoundResult(defaultState(), {
      levelId: 1, outcome: "defeat", score: 50, stars: 0, fishFreed: 1,
    });
    expect(s.progress[2].unlocked).toBe(false);
    expect(s.aquarium[1]).toBeUndefined();
    expect(s.totalFishRescued).toBe(1);
  });

  it("doesn't overrun past the last level", () => {
    const last = LEVELS[LEVELS.length - 1].id;
    const s = applyRoundResult(defaultState(), {
      levelId: last, outcome: "victory", score: 1, stars: 1, fishFreed: 1,
    });
    expect(Object.keys(s.progress)).toHaveLength(LEVELS.length);
  });

  it("only touches the high score in endless mode", () => {
    const before = defaultState();
    const s = applyRoundResult(before, {
      levelId: null, outcome: "defeat", score: 4200, stars: 0, fishFreed: 0,
    });
    expect(s.highScore).toBe(4200);
    expect(s.progress).toEqual(before.progress);
  });

  it("does not mutate the previous state", () => {
    const before = defaultState();
    const snapshot = JSON.stringify(before);
    applyRoundResult(before, { levelId: 1, outcome: "victory", score: 1, stars: 1, fishFreed: 1 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

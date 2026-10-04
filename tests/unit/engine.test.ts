import { describe, expect, it } from "vitest";
import { Bubble, BubbleColor, LevelConfig } from "../../types";
import { COLOR_CONFIG, GRID, LEVELS, PHYSICS } from "../../gameConfig";
import {
  ARENA_WIDTH,
  Ball,
  Bounds,
  areNeighbors,
  arenaBounds,
  cellPosition,
  cellsInRow,
  clampDrag,
  computeLayout,
  computePressure,
  computeStars,
  dealColors,
  evaluateOutcome,
  findCluster,
  findLandingCell,
  findOrphans,
  generateGrid,
  isValidCell,
  launchVelocity,
  neighborCells,
  predictTrajectory,
  pushRowsDown,
  relayoutBubbles,
  resolveShot,
  stepBall,
} from "../../game/engine";

/** Deterministic RNG (mulberry32) so generated boards are reproducible. */
const seeded = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const ARENA_LEFT = 100;

let uid = 0;
const bubble = (row: number, col: number, color: BubbleColor = "red", extra: Partial<Bubble> = {}): Bubble => ({
  id: `t${++uid}`,
  row,
  col,
  ...cellPosition(row, col, ARENA_LEFT),
  color,
  active: true,
  ...extra,
});

const level = (overrides: Partial<LevelConfig> = {}): LevelConfig => ({
  ...LEVELS[0],
  ...overrides,
});

/* ------------------------------------------------------------------ Layout */

describe("computeLayout", () => {
  it("keeps 1:1 scale on a roomy desktop viewport", () => {
    const l = computeLayout(1600, 1000);
    expect(l.scale).toBe(1);
    expect(l.worldW).toBe(1600);
    expect(l.arenaLeft).toBeCloseTo((1600 - ARENA_WIDTH) / 2);
    expect(l.anchor).toEqual({ x: 800, y: 1000 - GRID.hudReserve });
    expect(l.dangerY).toBe(l.anchor.y - GRID.dangerMargin);
  });

  it("scales the board down on a short laptop screen so the deepest level still fits", () => {
    const l = computeLayout(1366, 620);
    expect(l.scale).toBeLessThan(1);
    expect(l.anchor.y).toBeCloseTo(GRID.minBoardHeight);
    // Level 10 starts with its lowest row well above the danger line.
    const deepest = Math.max(...LEVELS.map((lv) => lv.rows));
    const lowestStartEdge = cellPosition(deepest - 1, 0, l.arenaLeft).y + GRID.bubbleRadius;
    expect(lowestStartEdge).toBeLessThan(l.dangerY - GRID.rowHeight * 4);
  });

  it.each([
    [1440, 900],
    [1366, 620],
    [800, 450],
    [412, 915],
  ])("keeps the slingshot clear of the fixed-size HUD at %ix%i", (w, h) => {
    const l = computeLayout(w, h);
    const anchorCssY = l.anchor.y * l.scale;
    expect(h - anchorCssY).toBeCloseTo(GRID.hudReserve);
  });

  it("scales to fit a narrow phone width", () => {
    const l = computeLayout(360, 740);
    expect(l.worldW).toBeGreaterThanOrEqual(GRID.minWorldWidth - 1e-6);
    expect(l.arenaLeft).toBeGreaterThanOrEqual(0);
  });

  it("survives a zero-sized container", () => {
    const l = computeLayout(0, 0);
    expect(Number.isFinite(l.scale)).toBe(true);
    expect(l.scale).toBeGreaterThan(0);
  });

  it("puts the walls at the arena edges, not the screen edges", () => {
    const l = computeLayout(1600, 1000);
    const b = arenaBounds(l);
    expect(b.left).toBeCloseTo(l.arenaLeft + GRID.bubbleRadius);
    expect(b.right).toBeCloseTo(l.arenaLeft + ARENA_WIDTH - GRID.bubbleRadius);
  });
});

/* -------------------------------------------------------------------- Grid */

describe("hex grid geometry", () => {
  it("gives odd rows one fewer cell and a half-bubble offset", () => {
    expect(cellsInRow(0)).toBe(GRID.cols);
    expect(cellsInRow(1)).toBe(GRID.cols - 1);
    const even = cellPosition(0, 0, 0);
    const odd = cellPosition(1, 0, 0);
    expect(odd.x - even.x).toBeCloseTo(GRID.bubbleRadius);
    expect(odd.y - even.y).toBeCloseTo(GRID.rowHeight);
  });

  it("keeps every cell inside the arena", () => {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < cellsInRow(r); c++) {
        const { x } = cellPosition(r, c, ARENA_LEFT);
        expect(x - GRID.bubbleRadius).toBeGreaterThanOrEqual(ARENA_LEFT - 1e-9);
        expect(x + GRID.bubbleRadius).toBeLessThanOrEqual(ARENA_LEFT + ARENA_WIDTH + 1e-9);
      }
    }
  });

  it("has symmetric neighbours, all exactly one bubble diameter apart", () => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < cellsInRow(r); c++) {
        const here = cellPosition(r, c, 0);
        for (const [nr, nc] of neighborCells(r, c)) {
          if (!isValidCell(nr, nc)) continue;
          expect(areNeighbors({ row: nr, col: nc }, { row: r, col: c })).toBe(true);
          const there = cellPosition(nr, nc, 0);
          expect(Math.hypot(there.x - here.x, there.y - here.y)).toBeCloseTo(
            GRID.bubbleRadius * 2,
            5
          );
        }
      }
    }
  });

  it("does not treat distant cells as neighbours", () => {
    expect(areNeighbors({ row: 0, col: 0 }, { row: 0, col: 2 })).toBe(false);
    expect(areNeighbors({ row: 0, col: 0 }, { row: 2, col: 0 })).toBe(false);
  });
});

describe("findCluster / findOrphans", () => {
  it("collects a connected same-colour group and stops at other colours", () => {
    const a = bubble(0, 0, "red");
    const b = bubble(0, 1, "red");
    const c = bubble(1, 0, "red");
    const d = bubble(0, 2, "blue");
    const e = bubble(0, 3, "red"); // red, but cut off by the blue
    const cluster = findCluster([a, b, c, d, e], a);
    expect(cluster.map((x) => x.id).sort()).toEqual([a.id, b.id, c.id].sort());
  });

  it("ignores colour when asked", () => {
    const list = [bubble(0, 0, "red"), bubble(0, 1, "blue"), bubble(0, 2, "green")];
    expect(findCluster(list, list[0], false)).toHaveLength(3);
  });

  it("skips inactive bubbles", () => {
    const a = bubble(0, 0);
    const gap = bubble(0, 1, "red", { active: false });
    const c = bubble(0, 2);
    expect(findCluster([a, gap, c], a)).toHaveLength(1);
  });

  it("finds bubbles with no path to the ceiling", () => {
    const top = bubble(0, 0);
    const hanging = bubble(1, 0);
    const floating = bubble(3, 5);
    const orphans = findOrphans([top, hanging, floating]);
    expect(orphans.map((b) => b.id)).toEqual([floating.id]);
  });
});

describe("generateGrid", () => {
  it("is reproducible for a given seed", () => {
    const a = generateGrid({ rows: 6, fishCount: 4, arenaLeft: 0, rng: seeded(7) });
    const b = generateGrid({ rows: 6, fishCount: 4, arenaLeft: 0, rng: seeded(7) });
    expect(a.map((x) => [x.row, x.col, x.color, !!x.hasFish])).toEqual(
      b.map((x) => [x.row, x.col, x.color, !!x.hasFish])
    );
  });

  it.each(LEVELS.map((l) => [l.name, l] as const))(
    "%s: full ceiling, no floating bubbles, exact fish count",
    (_, lv) => {
      for (let seed = 1; seed <= 20; seed++) {
        const grid = generateGrid({
          rows: lv.rows,
          fishCount: lv.fishCount,
          arenaLeft: ARENA_LEFT,
          rng: seeded(seed * 31 + lv.id),
        });
        expect(grid.filter((b) => b.row === 0)).toHaveLength(GRID.cols);
        expect(findOrphans(grid)).toHaveLength(0);
        expect(grid.filter((b) => b.hasFish)).toHaveLength(lv.fishCount);
        expect(new Set(grid.map((b) => b.id)).size).toBe(grid.length);
        expect(Math.max(...grid.map((b) => b.row))).toBeLessThan(lv.rows);
      }
    }
  );

  it("never places more fish than there are bubbles", () => {
    const grid = generateGrid({ rows: 1, fishCount: 99, arenaLeft: 0, rng: seeded(1) });
    expect(grid.filter((b) => b.hasFish)).toHaveLength(GRID.cols);
  });
});

describe("relayoutBubbles", () => {
  it("re-derives positions from row/col for a new arena offset", () => {
    const list = [bubble(0, 0), bubble(3, 4)];
    relayoutBubbles(list, 500);
    expect(list[1]).toMatchObject(cellPosition(3, 4, 500));
  });
});

describe("pushRowsDown", () => {
  it("drops existing bubbles two rows without changing their x, and refills the top", () => {
    const before = [bubble(0, 0, "blue"), bubble(1, 0, "green", { hasFish: true })];
    const after = pushRowsDown(before, ARENA_LEFT, seeded(3));
    const moved = after.filter((b) => before.some((o) => o.id === b.id));
    expect(moved.map((b) => b.row)).toEqual([2, 3]);
    moved.forEach((b, i) => expect(b.x).toBeCloseTo(before[i].x));
    expect(moved[1].hasFish).toBe(true);
    expect(after.filter((b) => b.row === 0)).toHaveLength(cellsInRow(0));
    expect(after.filter((b) => b.row === 1)).toHaveLength(cellsInRow(1));
    expect(findOrphans(after)).toHaveLength(0);
  });

  it("drops inactive bubbles instead of carrying them", () => {
    const after = pushRowsDown([bubble(0, 0, "red", { active: false })], 0, seeded(1));
    expect(after.every((b) => b.active)).toBe(true);
    expect(after.some((b) => b.row === 2)).toBe(false);
  });
});

describe("findLandingCell", () => {
  it("lands on the nearest empty cell attached to the board", () => {
    const board = [bubble(0, 5)];
    const target = cellPosition(1, 5, ARENA_LEFT);
    const cell = findLandingCell(board, { x: target.x + 3, y: target.y - 2 }, ARENA_LEFT);
    expect([cell.row, cell.col]).toEqual([1, 5]);
  });

  it("never parks a shot in mid-water", () => {
    const board = [bubble(0, 0)];
    // Ball stopped far below and to the right of the only bubble.
    const far = cellPosition(6, 9, ARENA_LEFT);
    const cell = findLandingCell(board, far, ARENA_LEFT);
    const attached =
      cell.row === 0 || neighborCells(cell.row, cell.col).some(([r, c]) => r === 0 && c === 0);
    expect(attached).toBe(true);
  });

  it("never lands on an occupied cell", () => {
    const board = [bubble(0, 0), bubble(0, 1)];
    const cell = findLandingCell(board, cellPosition(0, 0, ARENA_LEFT), ARENA_LEFT);
    expect(board.some((b) => b.row === cell.row && b.col === cell.col)).toBe(false);
  });

  it("finds a free cell below a board pushed deeper than the default search", () => {
    // A full column of bubbles down to row 40 (endless mode on a tall screen).
    const board: Bubble[] = [];
    for (let r = 0; r <= 40; r++) for (let c = 0; c < cellsInRow(r); c++) board.push(bubble(r, c));
    const hit = cellPosition(40, 3, ARENA_LEFT);
    const cell = findLandingCell(board, { x: hit.x, y: hit.y + GRID.rowHeight }, ARENA_LEFT);
    expect(cell.row).toBe(41);
    expect(board.some((b) => b.row === cell.row && b.col === cell.col)).toBe(false);
  });

  it("sticks to the ceiling on an empty board", () => {
    const cell = findLandingCell([], cellPosition(0, 4, ARENA_LEFT), ARENA_LEFT);
    expect(cell.row).toBe(0);
    expect(cell.col).toBe(4);
  });
});

/* ----------------------------------------------------------------- Scoring */

describe("resolveShot", () => {
  it("does nothing and breaks the combo below three in a row", () => {
    const a = bubble(0, 0, "red");
    const landed = bubble(0, 1, "red");
    const r = resolveShot([a, landed], landed, 4);
    expect(r).toMatchObject({ popped: [], dropped: [], points: 0, combo: 0, fishFreed: 0 });
    expect(a.active && landed.active).toBe(true);
  });

  it("pops a group of three and scores base x size", () => {
    const list = [bubble(0, 0, "blue"), bubble(0, 1, "blue")];
    const landed = bubble(0, 2, "blue");
    list.push(landed);
    const r = resolveShot(list, landed, 0);
    expect(r.popped).toHaveLength(3);
    expect(r.combo).toBe(1);
    expect(r.points).toBe(COLOR_CONFIG.blue.points * 3);
    expect(list.every((b) => !b.active)).toBe(true);
  });

  it("applies the 1.5x bonus for groups larger than three and the combo multiplier", () => {
    const list = [0, 1, 2].map((c) => bubble(0, c, "green"));
    const landed = bubble(0, 3, "green");
    list.push(landed);
    const r = resolveShot(list, landed, 1); // second pop in a row → 2x
    expect(r.combo).toBe(2);
    expect(r.points).toBe(Math.floor(COLOR_CONFIG.green.points * 4 * 1.5 * 2));
  });

  it("caps the multiplier at 5x", () => {
    const list = [bubble(0, 0, "red"), bubble(0, 1, "red")];
    const landed = bubble(0, 2, "red");
    list.push(landed);
    const r = resolveShot(list, landed, 20);
    expect(r.combo).toBe(21);
    expect(r.points).toBe(COLOR_CONFIG.red.points * 3 * 5);
  });

  it("drops everything left hanging, for half points, and frees their fish", () => {
    // Ceiling: red red red; hanging below the middle one: a purple with a fish.
    const r0 = bubble(0, 0, "red");
    const r1 = bubble(0, 1, "red");
    const hanging = bubble(1, 0, "purple", { hasFish: true });
    const other = bubble(0, 5, "yellow");
    const landed = bubble(0, 2, "red");
    const list = [r0, r1, hanging, other, landed];
    // hanging (1,0) touches (0,0) and (0,1) only.
    const r = resolveShot(list, landed, 0);
    expect(r.dropped.map((b) => b.id)).toEqual([hanging.id]);
    expect(r.fishFreed).toBe(1);
    expect(r.points).toBe(COLOR_CONFIG.red.points * 3 + COLOR_CONFIG.purple.points * 0.5);
    expect(other.active).toBe(true);
  });

  it("counts fish inside popped bubbles", () => {
    const list = [bubble(0, 0, "red", { hasFish: true }), bubble(0, 1, "red", { hasFish: true })];
    const landed = bubble(0, 2, "red");
    list.push(landed);
    expect(resolveShot(list, landed, 0).fishFreed).toBe(2);
  });
});

describe("computeStars", () => {
  const lv = level({ ballsLimit: 10 });
  it.each([
    [10, 1], // nothing left over still earns one star for winning
    [9, 1],
    [8, 2], // 20% left
    [6, 2],
    [5, 3], // 50% left
    [1, 3],
  ])("%i balls used → %i stars", (used, stars) => {
    expect(computeStars(lv, used)).toBe(stars);
  });
});

describe("evaluateOutcome", () => {
  const dangerY = 600;
  const safe = [bubble(0, 0)];

  it("wins once every fish is free", () => {
    expect(
      evaluateOutcome({ level: level({ fishCount: 3 }), bubbles: safe, fishFreed: 3, ballsUsed: 1, dangerY })
    ).toBe("victory");
  });

  it("prefers victory when the winning shot also used the last ball", () => {
    const lv = level({ fishCount: 3, ballsLimit: 5 });
    expect(evaluateOutcome({ level: lv, bubbles: safe, fishFreed: 3, ballsUsed: 5, dangerY })).toBe(
      "victory"
    );
  });

  it("wins a level whose board has been cleared", () => {
    expect(
      evaluateOutcome({ level: level({ fishCount: 3 }), bubbles: [], fishFreed: 1, ballsUsed: 1, dangerY })
    ).toBe("victory");
  });

  it("loses when the board crosses the danger line", () => {
    const low = [bubble(0, 0, "red", { y: dangerY })];
    expect(evaluateOutcome({ level: null, bubbles: low, fishFreed: 0, ballsUsed: 0, dangerY })).toBe(
      "defeat"
    );
  });

  it("loses when the ammo runs out", () => {
    const lv = level({ fishCount: 3, ballsLimit: 5 });
    expect(evaluateOutcome({ level: lv, bubbles: safe, fishFreed: 2, ballsUsed: 5, dangerY })).toBe(
      "defeat"
    );
  });

  it("keeps playing otherwise; endless mode has no ammo limit or win", () => {
    expect(
      evaluateOutcome({ level: null, bubbles: safe, fishFreed: 0, ballsUsed: 999, dangerY })
    ).toBeNull();
    expect(evaluateOutcome({ level: null, bubbles: [], fishFreed: 0, ballsUsed: 1, dangerY })).toBeNull();
  });
});

describe("computePressure", () => {
  const layout = computeLayout(1600, 1000);
  it("is 0 for an empty board and clamps to 1 past the danger line", () => {
    expect(computePressure([], layout)).toBe(0);
    expect(computePressure([bubble(0, 0)], layout)).toBe(0);
    expect(computePressure([bubble(0, 0, "red", { y: layout.dangerY + 50 })], layout)).toBe(1);
  });
  it("rises as the board descends", () => {
    const p3 = computePressure([bubble(3, 0)], layout);
    const p8 = computePressure([bubble(8, 0)], layout);
    expect(p3).toBeGreaterThan(0);
    expect(p8).toBeGreaterThan(p3);
  });
});

describe("dealColors", () => {
  it("only offers colours still on the board", () => {
    const board = [bubble(0, 0, "red"), bubble(0, 1, "blue")];
    for (let s = 0; s < 50; s++) {
      const d = dealColors(board, null, seeded(s));
      expect(["red", "blue"]).toContain(d.pair[0]);
      expect(["red", "blue"]).toContain(d.pair[1]);
      expect(d.pair[0]).not.toBe(d.pair[1]);
      expect(["red", "blue"]).toContain(d.next);
    }
  });

  it("keeps the promise made by the Next preview", () => {
    const board = [bubble(0, 0, "red"), bubble(0, 1, "blue"), bubble(0, 2, "green")];
    for (let s = 0; s < 20; s++) {
      expect(dealColors(board, "green", seeded(s)).pair[0]).toBe("green");
    }
  });

  it("falls back when the promised colour has been cleared", () => {
    const board = [bubble(0, 0, "red")];
    const d = dealColors(board, "purple", seeded(1));
    expect(d.pair).toEqual(["red", "red"]);
  });

  it("offers any colour on an empty board", () => {
    const d = dealColors([], null, seeded(2));
    expect(Object.keys(COLOR_CONFIG)).toContain(d.pair[0]);
  });
});

/* ----------------------------------------------------------------- Physics */

describe("launchVelocity / clampDrag", () => {
  it("fires opposite to the pull and harder the further it is pulled", () => {
    const weak = launchVelocity(0, 40);
    const strong = launchVelocity(0, 140);
    expect(weak.y).toBeGreaterThan(0);
    expect(strong.y).toBeGreaterThan(weak.y);
    expect(launchVelocity(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("caps power at maximum stretch", () => {
    const max = launchVelocity(0, PHYSICS.maxDragDist);
    expect(max.y).toBeCloseTo(PHYSICS.maxDragDist * PHYSICS.maxForceMult);
  });

  it("clamps a drag to the maximum stretch along the same direction", () => {
    const anchor = { x: 0, y: 0 };
    const p = clampDrag({ x: 300, y: 400 }, anchor);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(PHYSICS.maxDragDist);
    expect(p.x / p.y).toBeCloseTo(0.75);
    expect(clampDrag({ x: 10, y: 20 }, anchor)).toEqual({ x: 10, y: 20 });
  });
});

describe("stepBall", () => {
  const bounds: Bounds = { left: 100, right: 500, top: 50 };

  it("bounces off the side walls and stays inside them", () => {
    const ball: Ball = { x: 110, y: 400, vx: -30, vy: 0 };
    const r = stepBall(ball, [], bounds);
    expect(r.bounced).toBe(true);
    expect(ball.vx).toBeGreaterThan(0);
    expect(ball.x).toBeGreaterThanOrEqual(bounds.left);
  });

  it("sticks to the ceiling", () => {
    const ball: Ball = { x: 300, y: 60, vx: 0, vy: -20 };
    expect(stepBall(ball, [], bounds).hit).toBe(true);
  });

  it("can't tunnel through a bubble at full power", () => {
    const target: Bubble = { ...bubble(0, 0), x: 300, y: 200 };
    const ball: Ball = { x: 300, y: 330, vx: 0, vy: -PHYSICS.maxDragDist * PHYSICS.maxForceMult };
    const r = stepBall(ball, [target], bounds);
    expect(r.hit).toBe(true);
    expect(ball.y).toBeGreaterThan(target.y);
  });

  it("ignores popped bubbles", () => {
    const ghost: Bubble = { ...bubble(0, 0), x: 300, y: 300, active: false };
    const ball: Ball = { x: 300, y: 330, vx: 0, vy: -10 };
    expect(stepBall(ball, [ghost], bounds).hit).toBe(false);
  });
});

describe("predictTrajectory", () => {
  it("lands exactly where the real shot lands", () => {
    const layout = computeLayout(1600, 1000);
    const board = generateGrid({ rows: 5, fishCount: 0, arenaLeft: layout.arenaLeft, rng: seeded(11) });
    const bounds = arenaBounds(layout);

    for (const [dx, dy] of [
      [0, -120],
      [80, -90],
      [-140, -40],
      [60, -30],
    ]) {
      const v = launchVelocity(dx, dy);
      const predicted = predictTrajectory(layout.anchor, v, board, bounds, layout.worldH);

      const ball: Ball = { x: layout.anchor.x, y: layout.anchor.y, vx: v.x, vy: v.y };
      let landed: { x: number; y: number } | null = null;
      for (let i = 0; i < 1000 && !landed; i++) {
        if (stepBall(ball, board, bounds).hit) landed = { x: ball.x, y: ball.y };
        if (ball.y > layout.worldH) break;
      }

      expect(predicted.landing).not.toBeNull();
      expect(landed).not.toBeNull();
      expect(predicted.landing!.x).toBeCloseTo(landed!.x, 6);
      expect(predicted.landing!.y).toBeCloseTo(landed!.y, 6);
    }
  });

  it("reports no landing for a shot aimed into the floor", () => {
    const layout = computeLayout(1600, 1000);
    const t = predictTrajectory(
      layout.anchor,
      launchVelocity(0, 100),
      [],
      arenaBounds(layout),
      layout.worldH
    );
    expect(t.landing).toBeNull();
  });
});

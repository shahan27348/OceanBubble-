/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Home, Settings as SettingsIcon, Volume2, VolumeX } from "lucide-react";
import {
  Bubble,
  BubbleColor,
  GameSettings,
  HandSample,
  InputMode,
  LevelConfig,
  Particle,
  Point,
  RoundResult,
  SavedState,
  Screen,
} from "../types";
import {
  COLOR_CONFIG,
  COMBO_WINDOW_MS,
  ENDLESS,
  GESTURE,
  GRID,
  LEVELS,
  PHYSICS,
  adjustColor,
} from "../gameConfig";
import {
  Ball,
  Layout,
  MAX_MULTIPLIER,
  arenaBounds,
  clampDrag,
  computeLayout,
  computePressure,
  computeStars,
  dealColors,
  evaluateOutcome,
  findLandingCell,
  generateGrid,
  launchVelocity,
  lowestBubbleEdge,
  nextBubbleId,
  predictTrajectory,
  pushRowsDown,
  relayoutBubbles,
  resolveShot,
  stepBall,
} from "../game/engine";
import {
  Landmark,
  PointFilter,
  TimedPoint,
  cameraToScreen,
  detectPinch,
  isValidHand,
  pickReleasePoint,
  pinchMidpoint,
  pinchRatio,
  trackingQuality,
} from "../game/gesture";
import { audioManager } from "../services/audioService";
import {
  applyRoundResult,
  defaultState,
  loadState,
  saveState,
} from "../services/storageService";
import {
  TrackerStatus,
  describeStatus,
  isTrackerFailure,
  startHandTracking,
} from "../services/handTracker";
import { OceanBackdrop } from "./ui/OceanBackdrop";
import { GestureCursor } from "./ui/GestureCursor";
import { GestureButton, GestureProvider } from "./ui/GestureControl";
import { CameraPip } from "./ui/CameraPip";
import { HomeScreen } from "./screens/HomeScreen";
import { LevelsScreen } from "./screens/LevelsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ResultModal } from "./game/ResultModal";
import {
  AmmoGauge,
  ColorSelector,
  ComboBadge,
  DangerGauge,
  ObjectiveCard,
  ScoreCard,
} from "./game/GameHud";

/** MediaPipe's 21-point hand topology, for the camera preview skeleton. */
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const MAX_DPR = 2;

const OceanBubbles: React.FC = () => {
  /* ------------------------------------------------------------- Elements */

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipCanvasRef = useRef<HTMLCanvasElement>(null);
  const arenaRef = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------------------ Persisted */

  const [saved, setSaved] = useState<SavedState>(() => loadState());
  const settings = saved.settings;

  const patchSettings = useCallback((patch: Partial<GameSettings>) => {
    setSaved((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  }, []);

  useEffect(() => {
    saveState(saved);
  }, [saved]);

  useEffect(() => {
    audioManager.setMuted(settings.muted);
    audioManager.setVolume(settings.volume);
  }, [settings.muted, settings.volume]);

  /* ---------------------------------------------------------- Shell state */

  const [screen, setScreen] = useState<Screen>("home");
  const [settingsReturn, setSettingsReturn] = useState<"home" | "game">("home");
  const [currentLevel, setCurrentLevel] = useState<LevelConfig | null>(null);
  const [score, setScore] = useState(0);
  const [ballsRemaining, setBallsRemaining] = useState<number | null>(null);
  const [fishFreed, setFishFreed] = useState(0);
  const [selectedColor, setSelectedColor] = useState<BubbleColor>("red");
  const [colorPair, setColorPair] = useState<[BubbleColor, BubbleColor]>(["red", "blue"]);
  const [nextColor, setNextColor] = useState<BubbleColor>("green");
  const [combo, setCombo] = useState(0);
  const [comboFlash, setComboFlash] = useState(false);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [pressure, setPressure] = useState(0);
  const [hasFired, setHasFired] = useState(false);
  const [roundActive, setRoundActive] = useState(false);
  /** True while the slingshot is pulled back; fades the HUD under the ball. */
  const [aiming, setAiming] = useState(false);

  /* ------------------------------------------------------------- Tracking */

  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>("loading");
  const [handDetected, setHandDetected] = useState(false);
  const [trackingQualityLevel, setTrackingQualityLevel] = useState(0);
  const [livePinchRatio, setLivePinchRatio] = useState(1);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [cursorPinching, setCursorPinching] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);

  const inputMode: InputMode = isTrackerFailure(trackerStatus) ? "pointer" : "hand";

  /* --------------------------------------------------------- Engine state */

  const layoutRef = useRef<Layout>(computeLayout(1280, 800));
  const dprRef = useRef(1);
  const bubbles = useRef<Bubble[]>([]);
  const particles = useRef<Particle[]>([]);
  const ball = useRef<Ball>({ x: 0, y: 0, vx: 0, vy: 0 });
  const aimHistory = useRef<TimedPoint[]>([]);
  const isDragging = useRef(false);
  const isFlying = useRef(false);
  const flightStart = useRef(0);
  /** Simulation clock (ms). Only advances while the round is actually being
   *  simulated, so pausing in Settings or switching tabs doesn't time out a
   *  shot in flight or expire a combo. */
  const simTime = useRef(0);
  /** Colour of the shot in flight, fixed at launch. */
  const ballColor = useRef<BubbleColor>("red");
  const handLostAt = useRef(0);
  const dragSource = useRef<"hand" | "pointer" | null>(null);
  const scoreRef = useRef(0);
  const fishRef = useRef(0);
  const comboRef = useRef(0);
  const bestComboRef = useRef(0);
  const comboExpiry = useRef(0);
  const ballsUsedRef = useRef(0);
  const shotsSincePush = useRef(0);
  const roundOverRef = useRef(false);
  const promisedColor = useRef<BubbleColor | null>(null);

  const handSample = useRef<HandSample | null>(null);
  const handFilter = useRef(new PointFilter());
  const pointerInput = useRef({ active: false, down: false, x: 0, y: 0 });
  /** After a pinch activates a control (or a round starts), the hand must be
   *  seen open before a pinch counts again — otherwise holding the pinch would
   *  click whatever appears under the cursor on the next screen. Hand-only: a
   *  mouse press only registers on the board, so it is always deliberate. */
  const awaitRelease = useRef(false);
  const dwell = useRef({ id: null as string | null, start: 0, fired: false });
  const gestureHandlers = useRef(new Map<string, () => void>());
  const lastTickSound = useRef(0);

  /**
   * Everything the render loop and the camera callback read lives in this ref,
   * refreshed every render, so neither ever sees stale React state and neither
   * has to restart when state changes.
   */
  const live = useRef({
    screen,
    currentLevel,
    ballsRemaining,
    settings,
    selectedColor,
    highScore: saved.highScore,
    hasResult: false,
  });
  live.current = {
    screen,
    currentLevel,
    ballsRemaining,
    settings,
    selectedColor,
    highScore: saved.highScore,
    hasResult: result !== null,
  };

  /* --------------------------------------------------------------- Gestures */

  const register = useCallback((id: string, handler: () => void) => {
    gestureHandlers.current.set(id, handler);
    return () => {
      gestureHandlers.current.delete(id);
    };
  }, []);

  const gestureValue = useMemo(
    () => ({ hoveredId, dwellProgress, register }),
    [hoveredId, dwellProgress, register]
  );

  /* ------------------------------------------------------------ Helpers */

  const resetBall = useCallback(() => {
    const { anchor } = layoutRef.current;
    ball.current = { x: anchor.x, y: anchor.y, vx: 0, vy: 0 };
  }, []);

  const createExplosion = useCallback((x: number, y: number, color: string) => {
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
      const speed = 2 + Math.random() * 5;
      particles.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 1,
        color,
        radius: 2 + Math.random() * 4,
      });
    }
    // Bound the particle pool so a huge avalanche can't stall the frame.
    if (particles.current.length > 600) particles.current.splice(0, particles.current.length - 600);
  }, []);

  const deal = useCallback(() => {
    const d = dealColors(bubbles.current, promisedColor.current);
    promisedColor.current = d.next;
    setColorPair(d.pair);
    setSelectedColor(d.pair[0]);
    // Keep the loop's copy current immediately; the next render would too.
    live.current.selectedColor = d.pair[0];
    setNextColor(d.next);
  }, []);

  /* --------------------------------------------------------------- Rounds */

  const beginRound = useCallback(
    (level: LevelConfig | null) => {
      const layout = layoutRef.current;
      scoreRef.current = 0;
      fishRef.current = 0;
      comboRef.current = 0;
      bestComboRef.current = 0;
      comboExpiry.current = 0;
      ballsUsedRef.current = 0;
      shotsSincePush.current = 0;
      roundOverRef.current = false;
      promisedColor.current = null;
      particles.current = [];
      isFlying.current = false;
      isDragging.current = false;
      aimHistory.current = [];
      awaitRelease.current = true;

      bubbles.current = generateGrid({
        rows: level ? level.rows : ENDLESS.startRows,
        fishCount: level ? level.fishCount : 0,
        arenaLeft: layout.arenaLeft,
      });
      resetBall();
      deal();

      setScore(0);
      setFishFreed(0);
      setCombo(0);
      setHasFired(false);
      setResult(null);
      setPressure(computePressure(bubbles.current, layout));
      setCurrentLevel(level);
      setBallsRemaining(level ? level.ballsLimit : null);
      setRoundActive(true);
      setScreen("game");
      live.current.currentLevel = level;
      live.current.screen = "game";
      live.current.hasResult = false;

      audioManager.playClick();
      audioManager.startAmbient();
    },
    [deal, resetBall]
  );

  const finishRound = useCallback((outcome: "victory" | "defeat") => {
    // A ref rather than the `result` state: two conditions can resolve in the
    // same frame, before React has re-rendered.
    if (roundOverRef.current) return;
    roundOverRef.current = true;
    isDragging.current = false;
    live.current.hasResult = true;

    const level = live.current.currentLevel;
    const finalScore = scoreRef.current;
    const stars = outcome === "victory" && level ? computeStars(level, ballsUsedRef.current) : 0;

    setResult({
      outcome,
      score: finalScore,
      fishFreed: fishRef.current,
      fishTarget: level?.fishCount ?? 0,
      ballsUsed: ballsUsedRef.current,
      stars,
      bestCombo: Math.max(1, bestComboRef.current),
      levelId: level?.id ?? null,
      isNewHighScore: finalScore > live.current.highScore,
    });
    setRoundActive(false);

    setSaved((prev) =>
      applyRoundResult(prev, {
        levelId: level?.id ?? null,
        outcome,
        score: finalScore,
        stars,
        fishFreed: fishRef.current,
      })
    );

    audioManager.stopAmbient();
    if (outcome === "victory") audioManager.playVictory();
    else audioManager.playDefeat();
    vibrate(outcome === "victory" ? [90, 60, 90, 60, 140] : [220]);
  }, []);

  /* -------------------------------------------------------------- Scoring */

  const resetCombo = useCallback(() => {
    comboRef.current = 0;
    comboExpiry.current = 0;
    setCombo(0);
  }, []);

  const checkOutcome = useCallback(() => {
    const outcome = evaluateOutcome({
      level: live.current.currentLevel,
      bubbles: bubbles.current,
      fishFreed: fishRef.current,
      ballsUsed: ballsUsedRef.current,
      dangerY: layoutRef.current.dangerY,
    });
    if (outcome) finishRound(outcome);
  }, [finishRound]);

  /** Endless mode: count the shot and lower the board when it's time. */
  const advanceEndless = useCallback(() => {
    if (live.current.currentLevel) return;
    const layout = layoutRef.current;

    if (!bubbles.current.some((b) => b.active)) {
      // Cleared the whole reef — reward it and refill.
      scoreRef.current += ENDLESS.clearBonus;
      setScore(scoreRef.current);
      bubbles.current = generateGrid({
        rows: ENDLESS.startRows,
        fishCount: 0,
        arenaLeft: layout.arenaLeft,
      });
      shotsSincePush.current = 0;
      audioManager.playVictory();
      return;
    }

    shotsSincePush.current += 1;
    if (shotsSincePush.current >= ENDLESS.shotsPerPush) {
      shotsSincePush.current = 0;
      bubbles.current = pushRowsDown(bubbles.current, layout.arenaLeft);
      audioManager.playWall();
    }
  }, []);

  /* ------------------------------------------------------------ Simulation */

  const landBall = useCallback(() => {
    isFlying.current = false;
    const layout = layoutRef.current;
    const cell = findLandingCell(bubbles.current, ball.current, layout.arenaLeft);

    const landed: Bubble = {
      id: nextBubbleId(),
      row: cell.row,
      col: cell.col,
      x: cell.x,
      y: cell.y,
      color: ballColor.current,
      active: true,
      age: 0,
    };
    bubbles.current.push(landed);

    const outcome = resolveShot(bubbles.current, landed, comboRef.current);
    if (outcome.popped.length > 0) {
      comboRef.current = outcome.combo;
      bestComboRef.current = Math.max(
        bestComboRef.current,
        Math.min(outcome.combo, MAX_MULTIPLIER)
      );
      comboExpiry.current = simTime.current + COMBO_WINDOW_MS;
      setCombo(outcome.combo);
      setComboFlash(true);
      window.setTimeout(() => setComboFlash(false), 400);
      if (outcome.combo >= 3) vibrate([40, 25, 40, 25, 40]);

      for (const b of [...outcome.popped, ...outcome.dropped]) {
        createExplosion(b.x, b.y, COLOR_CONFIG[b.color].hex);
      }
      audioManager.playPop(Math.min(MAX_MULTIPLIER, outcome.combo));

      scoreRef.current += outcome.points;
      setScore(scoreRef.current);
      if (outcome.fishFreed > 0) {
        fishRef.current += outcome.fishFreed;
        setFishFreed(fishRef.current);
      }
    } else {
      resetCombo();
    }

    // Popped bubbles are only kept around until their explosion is spawned.
    bubbles.current = bubbles.current.filter((b) => b.active);
    advanceEndless();
    resetBall();
    checkOutcome();
    if (!roundOverRef.current) deal();
  }, [advanceEndless, checkOutcome, createExplosion, deal, resetBall, resetCombo]);

  /** A shot that left the arena without hitting anything. */
  const loseBall = useCallback(() => {
    isFlying.current = false;
    resetBall();
    resetCombo();
    advanceEndless();
    checkOutcome();
  }, [advanceEndless, checkOutcome, resetBall, resetCombo]);

  const stepPhysics = useCallback(() => {
    simTime.current += PHYSICS.fixedStepMs;
    const now = simTime.current;
    // Combo windows and flight time run on the simulation clock rather than
    // wall time, so they pause with the game.
    if (comboRef.current > 0 && comboExpiry.current && now > comboExpiry.current) {
      resetCombo();
    }

    for (const b of bubbles.current) {
      if ((b.age ?? 1) < 1) b.age = Math.min(1, (b.age ?? 0) + 0.12);
    }

    for (let i = particles.current.length - 1; i >= 0; i--) {
      const p = particles.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.vx *= 0.98;
      p.life -= 0.028;
      if (p.life <= 0) particles.current.splice(i, 1);
    }

    if (!isFlying.current) return;

    if (now - flightStart.current > PHYSICS.maxFlightMs) {
      loseBall();
      return;
    }

    const layout = layoutRef.current;
    const { hit, bounced } = stepBall(ball.current, bubbles.current, arenaBounds(layout));
    if (bounced) audioManager.playWall();

    if (hit) {
      audioManager.playClick();
      vibrate(12);
      landBall();
      return;
    }

    if (ball.current.y > layout.worldH + GRID.bubbleRadius) loseBall();
  }, [landBall, loseBall, resetCombo]);

  const fire = useCallback(
    (dx: number, dy: number) => {
      const v = launchVelocity(dx, dy);
      const { anchor } = layoutRef.current;
      // The shot leaves from the anchor, exactly where the preview starts.
      ball.current = { x: anchor.x, y: anchor.y, vx: v.x, vy: v.y };
      ballColor.current = live.current.selectedColor;
      isFlying.current = true;
      flightStart.current = simTime.current;
      ballsUsedRef.current += 1;
      setHasFired(true);

      const level = live.current.currentLevel;
      if (level) {
        const remaining = Math.max(0, level.ballsLimit - ballsUsedRef.current);
        setBallsRemaining(remaining);
        live.current.ballsRemaining = remaining;
      }

      audioManager.playShoot();
      vibrate(25);
    },
    []
  );

  /* ------------------------------------------------------------- Rendering */

  const drawBubble = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      b: { x: number; y: number; color: BubbleColor; hasFish?: boolean; age?: number },
      radius: number,
      showSymbol: boolean
    ) => {
      const config = COLOR_CONFIG[b.color];
      const settle = b.age === undefined ? 1 : Math.min(1, b.age);
      const r = radius * (0.72 + 0.28 * settle);

      const grad = ctx.createRadialGradient(b.x - r * 0.32, b.y - r * 0.34, r * 0.1, b.x, b.y, r);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.22, config.hex);
      grad.addColorStop(1, adjustColor(config.hex, -70));

      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Specular glint
      ctx.beginPath();
      ctx.ellipse(b.x - r * 0.3, b.y - r * 0.36, r * 0.26, r * 0.15, Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fill();

      if (b.hasFish) {
        ctx.save();
        ctx.font = `${Math.round(r * 0.95)}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🐠", b.x, b.y + 1);
        ctx.restore();
      } else if (showSymbol) {
        ctx.save();
        ctx.font = `bold ${Math.round(r * 0.8)}px Outfit, system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(config.symbol, b.x, b.y + 1);
        ctx.restore();
      }
    },
    []
  );

  const render = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const { settings: cfg } = live.current;
      const layout = layoutRef.current;
      const { arenaLeft, arenaWidth, dangerY, anchor: a, worldW, worldH } = layout;
      ctx.clearRect(0, 0, worldW, worldH);

      // Arena column — the walls the shot bounces off.
      const columnGrad = ctx.createLinearGradient(0, 0, 0, worldH);
      columnGrad.addColorStop(0, "rgba(79,195,247,0.07)");
      columnGrad.addColorStop(1, "rgba(79,195,247,0)");
      ctx.fillStyle = columnGrad;
      ctx.fillRect(arenaLeft, 0, arenaWidth, worldH);

      ctx.strokeStyle = "rgba(79,195,247,0.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(arenaLeft, 0);
      ctx.lineTo(arenaLeft, worldH);
      ctx.moveTo(arenaLeft + arenaWidth, 0);
      ctx.lineTo(arenaLeft + arenaWidth, worldH);
      ctx.stroke();

      // Danger line
      const close = lowestBubbleEdge(bubbles.current) > dangerY - GRID.rowHeight * 2;
      ctx.save();
      ctx.setLineDash([12, 10]);
      ctx.strokeStyle = close ? "rgba(255,23,68,0.85)" : "rgba(255,107,157,0.35)";
      ctx.lineWidth = 2;
      if (close) {
        ctx.shadowBlur = 14;
        ctx.shadowColor = "rgba(255,23,68,0.8)";
      }
      ctx.beginPath();
      ctx.moveTo(arenaLeft, dangerY);
      ctx.lineTo(arenaLeft + arenaWidth, dangerY);
      ctx.stroke();
      ctx.restore();

      for (const b of bubbles.current) {
        if (b.active) drawBubble(ctx, b, GRID.bubbleRadius - 1, cfg.colorBlindSymbols);
      }

      // Trajectory preview — the same simulation the real shot runs.
      if (isDragging.current && !isFlying.current && cfg.showTrajectory) {
        const dx = a.x - ball.current.x;
        const dy = a.y - ball.current.y;
        const stretch = Math.hypot(dx, dy);

        if (stretch > PHYSICS.minFireStretch) {
          const powerRatio = Math.min(stretch / PHYSICS.maxDragDist, 1);
          const { points, landing } = predictTrajectory(
            a,
            launchVelocity(dx, dy),
            bubbles.current,
            arenaBounds(layout),
            worldH
          );

          ctx.save();
          ctx.setLineDash([7, 9]);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = `rgba(155,231,255,${0.35 + powerRatio * 0.5})`;
          ctx.shadowBlur = 10;
          ctx.shadowColor = "rgba(79,195,247,0.8)";
          ctx.beginPath();
          points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
          ctx.restore();

          if (landing) {
            const pulse = (Math.sin(performance.now() / 140) + 1) / 2;
            ctx.save();
            ctx.strokeStyle = "rgba(79,195,247,0.5)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(landing.x, landing.y, 13 + pulse * 7, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "#9be7ff";
            ctx.beginPath();
            ctx.arc(landing.x, landing.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // Slingshot frame
      ctx.save();
      ctx.strokeStyle = "rgba(38,198,218,0.9)";
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, worldH);
      ctx.lineTo(a.x, a.y + 42);
      ctx.moveTo(a.x, a.y + 42);
      ctx.lineTo(a.x - 40, a.y);
      ctx.moveTo(a.x, a.y + 42);
      ctx.lineTo(a.x + 40, a.y);
      ctx.stroke();
      ctx.restore();

      if (!isFlying.current) {
        ctx.save();
        ctx.strokeStyle = isDragging.current ? "#ffd54f" : "rgba(79,195,247,0.5)";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(a.x - 40, a.y);
        ctx.lineTo(ball.current.x, ball.current.y);
        ctx.lineTo(a.x + 40, a.y);
        ctx.stroke();
        ctx.restore();
      }

      // Projectile
      if (!live.current.hasResult) {
        const projectileColor = isFlying.current ? ballColor.current : live.current.selectedColor;
        ctx.save();
        if (isDragging.current) {
          ctx.shadowBlur = 22;
          ctx.shadowColor = COLOR_CONFIG[projectileColor].hex;
        }
        drawBubble(
          ctx,
          { x: ball.current.x, y: ball.current.y, color: projectileColor },
          GRID.bubbleRadius,
          cfg.colorBlindSymbols
        );
        ctx.restore();
      }

      for (const p of particles.current) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    [drawBubble]
  );

  /* --------------------------------------------------- Input + master loop */

  const hoverIdRef = useRef<string | null>(null);
  const pressureRef = useRef(0);
  const aimingRef = useRef(false);
  const dwellRef = useRef(0);
  const lastCursor = useRef({ x: -999, y: -999, pressed: false });

  /** Cursor updates are gated so the loop does not queue a setState per frame. */
  const setCursorState = useCallback((viewport: Point | null, pressed: boolean) => {
    if (!viewport) {
      if (lastCursor.current.x !== -999) {
        lastCursor.current = { x: -999, y: -999, pressed: false };
        setCursor(null);
        setCursorPinching(false);
      }
      return;
    }
    const moved =
      Math.abs(viewport.x - lastCursor.current.x) > 1 ||
      Math.abs(viewport.y - lastCursor.current.y) > 1;
    if (moved) setCursor({ x: viewport.x, y: viewport.y });
    if (pressed !== lastCursor.current.pressed) setCursorPinching(pressed);
    lastCursor.current = { x: viewport.x, y: viewport.y, pressed };
  }, []);

  const setDwell = useCallback((value: number) => {
    // Quantised: the whole tree re-renders on change, so 5% steps are plenty.
    const q = Math.round(value * 20) / 20;
    if (q !== dwellRef.current) {
      dwellRef.current = q;
      setDwellProgress(q);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const arena = arenaRef.current;
    if (!canvas || !arena) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const cssW = arena.clientWidth || window.innerWidth;
      const cssH = arena.clientHeight || window.innerHeight;
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      const prev = layoutRef.current;
      const layout = computeLayout(cssW, cssH);
      layoutRef.current = layout;
      dprRef.current = dpr;

      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);

      relayoutBubbles(bubbles.current, layout.arenaLeft);
      if (isFlying.current) {
        ball.current.x += layout.arenaLeft - prev.arenaLeft;
      } else {
        isDragging.current = false;
        resetBall();
      }
    };

    resize();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(resize);
      observer.observe(arena);
    } else {
      window.addEventListener("resize", resize);
    }

    let raf = 0;
    let last: number | null = null;
    let accumulator = 0;

    const clearHover = () => {
      if (hoverIdRef.current !== null) {
        hoverIdRef.current = null;
        setHoveredId(null);
      }
      dwell.current = { id: null, start: 0, fired: false };
      setDwell(0);
    };

    const processUiGestures = (viewport: Point | null, pressed: boolean, now: number) => {
      if (!viewport || isDragging.current) {
        clearHover();
        return;
      }

      // Hit-test like a real pointer would: only the topmost element counts,
      // so controls covered by a dialog (or with pointer-events off) can't be
      // pinched through it.
      const top =
        typeof document.elementFromPoint === "function"
          ? document.elementFromPoint(viewport.x, viewport.y)
          : null;
      const found: string | null =
        top?.closest<HTMLElement>("[data-gesture-id]")?.dataset.gestureId ?? null;

      if (found !== hoverIdRef.current) {
        hoverIdRef.current = found;
        setHoveredId(found);
        if (found) audioManager.playHover();
      }

      // Pinch-and-hold to activate: intent is explicit and progress is shown
      // on the cursor.
      if (found && pressed) {
        if (dwell.current.id !== found) dwell.current = { id: found, start: now, fired: false };
        const progress = Math.min(1, (now - dwell.current.start) / GESTURE.dwellMs);
        setDwell(progress);

        if (now - lastTickSound.current > 90 && progress < 1) {
          lastTickSound.current = now;
          audioManager.playDwellTick(progress);
        }

        if (progress >= 1 && !dwell.current.fired) {
          dwell.current.fired = true;
          awaitRelease.current = true;
          audioManager.playClick();
          vibrate(30);
          setDwell(0);
          gestureHandlers.current.get(found)?.();
        }
      } else {
        if (dwell.current.id !== null) dwell.current = { id: null, start: 0, fired: false };
        setDwell(0);
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);

      // rAF timestamps and performance.now() use different clocks in some
      // environments, so never let frame time run backwards.
      const dt = last === null ? 0 : Math.max(0, Math.min(now - last, 120));
      last = now;
      const layout = layoutRef.current;

      const sample = handSample.current;
      const handFresh =
        !!sample && performance.now() - sample.timestamp < GESTURE.staleMs;
      const usingPointer = pointerInput.current.active && !handFresh;

      /* -------- Resolve a single aim input from hand or pointer ---------- */
      const rect = canvas.getBoundingClientRect();
      let aim: Point | null = null;
      let aimViewport: Point | null = null;
      let pressed = false;
      let source: "hand" | "pointer" | null = null;

      if (handFresh && sample) {
        source = "hand";
        aim = { x: sample.point.x * layout.worldW, y: sample.point.y * layout.worldH };
        aimViewport = {
          x: rect.left + sample.point.x * rect.width,
          y: rect.top + sample.point.y * rect.height,
        };
        pressed = sample.isPinching;
      } else if (usingPointer) {
        source = "pointer";
        aim = {
          x: (pointerInput.current.x - rect.left) / layout.scale,
          y: (pointerInput.current.y - rect.top) / layout.scale,
        };
        aimViewport = { x: pointerInput.current.x, y: pointerInput.current.y };
        pressed = pointerInput.current.down;
      }

      // Only seeing the hand open clears the latch. A tracking dropout (no
      // hand, or the idle mouse taking over for a frame) must not.
      if (source === "hand" && !pressed) awaitRelease.current = false;
      const latched = source === "hand" && awaitRelease.current;

      setCursorState(handFresh ? aimViewport : null, pressed);
      processUiGestures(aimViewport, pressed && !latched, now);

      /* --------------------------- Slingshot ---------------------------- */
      const onGameScreen = live.current.screen === "game" && !live.current.hasResult;
      // A drag only listens to the input that started it: if the hand drops
      // out for a frame mid-pull, the idle mouse must not be read as a release.
      const dragInputLost = isDragging.current && source !== dragSource.current;

      if (onGameScreen && aim && !dragInputLost) {
        handLostAt.current = 0;
        const outOfAmmo =
          live.current.ballsRemaining !== null && live.current.ballsRemaining <= 0;

        if (pressed && !isFlying.current && !outOfAmmo && !latched) {
          if (
            !isDragging.current &&
            !hoverIdRef.current &&
            Math.hypot(aim.x - ball.current.x, aim.y - ball.current.y) < GESTURE.grabRadius
          ) {
            isDragging.current = true;
            dragSource.current = source;
            aimHistory.current = [];
            vibrate(18);
          }

          if (isDragging.current) {
            const p = clampDrag(aim, layout.anchor);
            ball.current.x = p.x;
            ball.current.y = p.y;
            aimHistory.current.push({ ...p, t: now });
            while (aimHistory.current.length && now - aimHistory.current[0].t > 400) {
              aimHistory.current.shift();
            }
          }
        } else if (isDragging.current) {
          isDragging.current = false;
          // Hand releases aim from just before the fingers opened; a mouse
          // release is crisp, so it aims from where it is.
          const from =
            (source === "hand" && pickReleasePoint(aimHistory.current, now)) || ball.current;
          aimHistory.current = [];

          const dx = layout.anchor.x - from.x;
          const dy = layout.anchor.y - from.y;
          if (Math.hypot(dx, dy) > PHYSICS.minFireStretch) fire(dx, dy);
          else resetBall();
        }
      } else if (isDragging.current) {
        // The hand left the frame mid-pull: hold briefly, then let go safely.
        if (!handLostAt.current) handLostAt.current = now;
        else if (now - handLostAt.current > GESTURE.dragLostMs || !onGameScreen) {
          isDragging.current = false;
          aimHistory.current = [];
          resetBall();
        }
      }

      if (isDragging.current !== aimingRef.current) {
        aimingRef.current = isDragging.current;
        setAiming(isDragging.current);
      }

      if (!isDragging.current && !isFlying.current) {
        // Ease the idle ball back onto the anchor.
        ball.current.x += (layout.anchor.x - ball.current.x) * 0.18;
        ball.current.y += (layout.anchor.y - ball.current.y) * 0.18;
      }

      /* --------------------------- Fixed-step sim ----------------------- */
      accumulator += dt;
      let guard = 0;
      while (accumulator >= PHYSICS.fixedStepMs && guard < 5) {
        if (onGameScreen) stepPhysics();
        accumulator -= PHYSICS.fixedStepMs;
        guard++;
      }
      if (accumulator > PHYSICS.fixedStepMs * 5) accumulator = 0;

      /* ------------------------------ Draw ------------------------------ */
      const k = dprRef.current * layout.scale;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      if (live.current.screen === "game") {
        render(ctx);
        const next = computePressure(bubbles.current, layout);
        if (Math.abs(next - pressureRef.current) > 0.02) {
          pressureRef.current = next;
          setPressure(next);
        }
      } else {
        ctx.clearRect(0, 0, layout.worldW, layout.worldH);
      }
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [fire, render, resetBall, setCursorState, setDwell, stepPhysics]);

  /* ------------------------------------------------------- Hand tracking */

  const lastQuality = useRef(-1);
  const lastRatio = useRef(-1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const drawPip = (landmarks: Landmark[] | null, pinching: boolean) => {
      const pip = pipCanvasRef.current;
      const pctx = pip?.getContext("2d");
      if (!pip || !pctx) return;
      pctx.save();
      // Mirrored, so the preview behaves like a mirror for the player.
      pctx.translate(pip.width, 0);
      pctx.scale(-1, 1);
      pctx.globalAlpha = 0.7;
      if (video.readyState >= 2) pctx.drawImage(video, 0, 0, pip.width, pip.height);
      else pctx.clearRect(0, 0, pip.width, pip.height);
      pctx.globalAlpha = 1;

      if (landmarks) {
        pctx.strokeStyle = pinching ? "#26c6da" : "rgba(155,231,255,0.75)";
        pctx.lineWidth = 2;
        pctx.beginPath();
        for (const [from, to] of HAND_CONNECTIONS) {
          pctx.moveTo(landmarks[from].x * pip.width, landmarks[from].y * pip.height);
          pctx.lineTo(landmarks[to].x * pip.width, landmarks[to].y * pip.height);
        }
        pctx.stroke();
        pctx.fillStyle = pinching ? "#ffffff" : "#4fc3f7";
        for (const p of landmarks) {
          pctx.beginPath();
          pctx.arc(p.x * pip.width, p.y * pip.height, 2, 0, Math.PI * 2);
          pctx.fill();
        }
      }
      pctx.restore();
    };

    const onHands = (lm: Landmark[] | null) => {
      if (!lm || !isValidHand(lm)) {
        handSample.current = null;
        handFilter.current.reset();
        setHandDetected(false);
        if (lastQuality.current !== 0) {
          lastQuality.current = 0;
          setTrackingQualityLevel(0);
        }
        drawPip(null, false);
        return;
      }

      const now = performance.now();
      const ratio = pinchRatio(lm);
      const isPinching = detectPinch(
        ratio,
        handSample.current?.isPinching ?? false,
        live.current.settings.pinchSensitivity
      );
      const point = cameraToScreen(handFilter.current.filter(pinchMidpoint(lm), now));
      const quality = trackingQuality(lm);

      handSample.current = { point, pinchRatio: ratio, isPinching, quality, timestamp: now };
      setHandDetected(true);

      // Only push to React what the UI can actually show, at the precision it
      // shows it — not a full re-render per camera frame.
      const q = Math.round(quality * 10) / 10;
      if (q !== lastQuality.current) {
        lastQuality.current = q;
        setTrackingQualityLevel(q);
      }
      if (live.current.screen === "settings") {
        const r = Math.round(ratio * 100) / 100;
        if (r !== lastRatio.current) {
          lastRatio.current = r;
          setLivePinchRatio(r);
        }
      }
      drawPip(lm, isPinching);
    };

    return startHandTracking(video, {
      onHands,
      onStatus: (status) => {
        setTrackerStatus(status);
        if (isTrackerFailure(status)) {
          handSample.current = null;
          setHandDetected(false);
        }
      },
    });
  }, []);

  /* -------------------------------------------------------- Pointer input */

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointerInput.current.x = e.clientX;
      pointerInput.current.y = e.clientY;
      pointerInput.current.active = true;
    };
    const onDown = (e: PointerEvent) => {
      audioManager.unlock();
      pointerInput.current.x = e.clientX;
      pointerInput.current.y = e.clientY;
      pointerInput.current.active = true;
      // Only a press on the play surface drives the slingshot; DOM controls
      // keep their native click handling.
      if ((e.target as HTMLElement | null)?.dataset?.playSurface !== undefined) {
        pointerInput.current.down = true;
      }
    };
    const onUp = () => {
      pointerInput.current.down = false;
    };
    const onKey = () => audioManager.unlock();
    const onVisibility = () => {
      audioManager.setHidden(document.hidden);
      if (document.hidden) pointerInput.current.down = false;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /* ------------------------------------------------------------ Callbacks */

  const goHome = useCallback(() => {
    setScreen("home");
    setResult(null);
    setRoundActive(false);
    isDragging.current = false;
    audioManager.stopAmbient();
    audioManager.playClick();
  }, []);

  const openSettings = useCallback((from: "home" | "game") => {
    setSettingsReturn(from);
    setScreen("settings");
    isDragging.current = false;
    audioManager.playClick();
  }, []);

  /** Settings opened mid-round return to the paused round, not the menu. */
  const closeSettings = useCallback(() => {
    if (settingsReturn === "game" && roundActive) {
      setScreen("game");
      audioManager.playClick();
    } else {
      goHome();
    }
  }, [goHome, roundActive, settingsReturn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (screen === "settings") closeSettings();
      else if (screen === "levels" || (screen === "game" && !result)) goHome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSettings, goHome, result, screen]);

  const handleSelectColor = useCallback((color: BubbleColor) => {
    setSelectedColor(color);
    live.current.selectedColor = color;
    audioManager.playClick();
    vibrate(12);
  }, []);

  const nextLevel = useMemo(() => {
    if (!result?.levelId) return null;
    const index = LEVELS.findIndex((l) => l.id === result.levelId);
    return index >= 0 ? LEVELS[index + 1] ?? null : null;
  }, [result?.levelId]);

  const depthFactor = currentLevel ? currentLevel.depth / 1000 : 0.25;
  const biome = currentLevel?.biome ?? "#4fc3f7";
  const showStatusPill = screen !== "game" && trackerStatus !== "running";

  /* ----------------------------------------------------------------- View */

  return (
    <GestureProvider value={gestureValue}>
      <div
        className={`relative h-full w-full overflow-hidden bg-abyss-950 ${
          settings.reduceMotion ? "reduce-motion" : ""
        }`}
      >
        <OceanBackdrop
          depth={screen === "game" ? depthFactor : 0.2}
          accent={screen === "game" ? biome : "#4fc3f7"}
          bubbleCount={settings.reduceMotion ? 0 : 18}
          showShafts={!settings.reduceMotion}
        />

        {/* Tracking source. Kept mounted on every screen and visually hidden;
            the corner preview paints its frames onto a canvas. */}
        <video
          ref={videoRef}
          playsInline
          muted
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
        />

        <div ref={arenaRef} className="absolute inset-0">
          <canvas
            ref={canvasRef}
            data-play-surface=""
            data-testid="play-surface"
            aria-label="Bubble shooter board"
            role="img"
            className={`absolute inset-0 z-10 h-full w-full touch-none ${
              screen === "game" ? "cursor-crosshair" : "pointer-events-none"
            }`}
          />

          {/* ---------------------------------------------------- Screens */}
          {screen === "home" && (
            <HomeScreen
              saved={saved}
              onQuickStart={() => beginRound(null)}
              onLevels={() => {
                setScreen("levels");
                audioManager.playClick();
              }}
              onSettings={() => openSettings("home")}
            />
          )}

          {screen === "levels" && (
            <LevelsScreen
              progress={saved.progress}
              onBack={goHome}
              onSelect={(level) => {
                if (!saved.progress[level.id]?.unlocked) return;
                beginRound(level);
              }}
            />
          )}

          {screen === "settings" && (
            <SettingsScreen
              settings={settings}
              onChange={patchSettings}
              onBack={closeSettings}
              onResetProgress={() =>
                // Progress only: audio, calibration and accessibility stay.
                setSaved((prev) => ({ ...defaultState(), settings: prev.settings }))
              }
              livePinchRatio={livePinchRatio}
              handDetected={handDetected}
            />
          )}

          {/* ------------------------------------------------- Game chrome */}
          {screen === "game" && (
            <>
              {/* Top-left: score, objective and combo — kept off the board. */}
              <div className="absolute left-4 top-4 z-30 flex w-56 flex-col gap-3 md:left-6 md:top-6">
                <ScoreCard score={score} highScore={saved.highScore} />
                <ObjectiveCard level={currentLevel} fishFreed={fishFreed} />
                <ComboBadge
                  combo={combo}
                  multiplier={Math.min(combo, MAX_MULTIPLIER)}
                  flash={comboFlash}
                />
              </div>

              {/* Top-right: camera + controls */}
              <div className="absolute right-4 top-4 z-30 flex flex-col items-end gap-3 md:right-6 md:top-6">
                <div className="flex gap-2">
                  <GestureButton
                    id="hud:home"
                    onActivate={goHome}
                    className="glass grid h-10 w-10 place-items-center rounded-2xl"
                    title="Back to menu"
                  >
                    <Home className="h-4 w-4 text-glow-cyan" />
                  </GestureButton>
                  <GestureButton
                    id="hud:mute"
                    onActivate={() => patchSettings({ muted: !settings.muted })}
                    className="glass grid h-10 w-10 place-items-center rounded-2xl"
                    title={settings.muted ? "Unmute" : "Mute"}
                  >
                    {settings.muted ? (
                      <VolumeX className="h-4 w-4 text-glow-coral" />
                    ) : (
                      <Volume2 className="h-4 w-4 text-glow-cyan" />
                    )}
                  </GestureButton>
                  <GestureButton
                    id="hud:settings"
                    onActivate={() => openSettings("game")}
                    className="glass grid h-10 w-10 place-items-center rounded-2xl"
                    title="Settings"
                  >
                    <SettingsIcon className="h-4 w-4 text-glow-cyan" />
                  </GestureButton>
                </div>

                {settings.showCamera && inputMode === "hand" && (
                  <CameraPip
                    overlayRef={pipCanvasRef}
                    quality={trackingQualityLevel}
                    handDetected={handDetected}
                    inputMode={inputMode}
                    cameraEnabled={settings.showCamera}
                  />
                )}
              </div>

              {/* Left rail: depth pressure */}
              <div className="absolute bottom-1/4 left-4 z-30 hidden md:left-8 lg:block">
                <DangerGauge pressure={pressure} />
              </div>

              {/* Bottom: ammo + colours. Fades while aiming, since pulling the
                  slingshot down drags the ball underneath it. */}
              <div
                data-testid="bottom-hud"
                className={`absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-3 transition-opacity duration-200 md:bottom-7 ${
                  aiming ? "pointer-events-none opacity-25" : "opacity-100"
                }`}
              >
                <AmmoGauge remaining={ballsRemaining ?? 0} limit={currentLevel?.ballsLimit ?? null} />
                <ColorSelector
                  pair={colorPair}
                  selected={selectedColor}
                  nextColor={nextColor}
                  showSymbols={settings.colorBlindSymbols}
                  onSelect={handleSelectColor}
                  disabled={result !== null}
                />
                {!hasFired && (
                  <p className="animate-pulse text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                    {inputMode === "hand" && handDetected
                      ? "Pinch near the bubble, pull back, release"
                      : "Drag from the bubble and release"}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ----------------------------------------------------- Result */}
          {result && (
            <ResultModal
              result={result}
              hasNextLevel={nextLevel !== null}
              onRetry={() => beginRound(currentLevel)}
              onNextLevel={() => nextLevel && beginRound(nextLevel)}
              onHome={goHome}
            />
          )}

          {/* ---------------------------------------- Tracking status pill */}
          {showStatusPill && (
            <div
              role="status"
              aria-live="polite"
              className="glass absolute bottom-4 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-[11px] font-semibold"
              style={{ color: trackerStatus === "loading" ? "#9be7ff" : "#ffab40" }}
            >
              {trackerStatus === "loading" && (
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-glow-cyan" />
              )}
              <span>{describeStatus(trackerStatus)}</span>
            </div>
          )}
        </div>

        <GestureCursor
          position={cursor}
          isPinching={cursorPinching}
          dwellProgress={dwellProgress}
          visible={inputMode === "hand" && handDetected}
        />
      </div>
    </GestureProvider>
  );
};

const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* unsupported */
    }
  }
};

export default OceanBubbles;

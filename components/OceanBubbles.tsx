/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { audioManager } from "../services/audioService";
import { Point, Bubble, Particle, BubbleColor } from "../types";
import {
  Loader2,
  Trophy,
  Play,
  MousePointerClick,
  Monitor,
  Volume2,
  VolumeX,
  RefreshCw,
  XCircle,
  Zap,
  Lock,
  Home,
  Star,
  Fish,
  Target,
  ArrowLeft,
  Settings as SettingsIcon,
} from "lucide-react";

type Screen = "home" | "game" | "levels" | "settings";

type LevelConfig = {
  id: number;
  name: string;
  fishCount: number;
  ballsLimit: number;
  rows: number;
  unlocked: boolean;
  stars: number;
};

const LEVELS: LevelConfig[] = [
  {
    id: 1,
    name: "Coral Reef",
    fishCount: 3,
    ballsLimit: 10,
    rows: 4,
    unlocked: true,
    stars: 0,
  },
  {
    id: 2,
    name: "Deep Blue",
    fishCount: 4,
    ballsLimit: 12,
    rows: 5,
    unlocked: false,
    stars: 0,
  },
  {
    id: 3,
    name: "Kelp Forest",
    fishCount: 5,
    ballsLimit: 15,
    rows: 5,
    unlocked: false,
    stars: 0,
  },
  {
    id: 4,
    name: "Shipwreck",
    fishCount: 6,
    ballsLimit: 18,
    rows: 6,
    unlocked: false,
    stars: 0,
  },
  {
    id: 5,
    name: "Abyss",
    fishCount: 7,
    ballsLimit: 20,
    rows: 6,
    unlocked: false,
    stars: 0,
  },
  {
    id: 6,
    name: "Atlantis",
    fishCount: 8,
    ballsLimit: 22,
    rows: 7,
    unlocked: false,
    stars: 0,
  },
  {
    id: 7,
    name: "Mariana",
    fishCount: 9,
    ballsLimit: 25,
    rows: 7,
    unlocked: false,
    stars: 0,
  },
  {
    id: 8,
    name: "Arctic Flow",
    fishCount: 10,
    ballsLimit: 28,
    rows: 8,
    unlocked: false,
    stars: 0,
  },
  {
    id: 9,
    name: "Volcano Reef",
    fishCount: 12,
    ballsLimit: 30,
    rows: 8,
    unlocked: false,
    stars: 0,
  },
  {
    id: 10,
    name: "Poseidon's Temple",
    fishCount: 15,
    ballsLimit: 35,
    rows: 9,
    unlocked: false,
    stars: 0,
  },
];

const PINCH_THRESHOLD = 0.05;
const GRAVITY = 0.03; // Reduced gravity for better arcs
const FRICTION = 0.998; // Minimal friction for smooth flight

const BUBBLE_RADIUS = 22;
const ROW_HEIGHT = BUBBLE_RADIUS * Math.sqrt(3);
const GRID_COLS = 12;
const GRID_ROWS = 8;
const SLINGSHOT_BOTTOM_OFFSET = 220;

const MAX_DRAG_DIST = 150;
const MIN_FORCE_MULT = 0.3; // Stronger minimum force
const MAX_FORCE_MULT = 0.8; // Stronger maximum force

const BOUNCE_RESTITUTION = 0.85; // Higher bounce to prevent sticking to walls
const STICK_SPEED_THRESHOLD = 8.0; // Higher threshold - stick on almost any speed
const MAX_REFLECTIONS_PER_STEP = 3; // Allow more wall bounces
const BUBBLE_COLLISION_DISTANCE = 2.1; // Larger detection radius

// Ocean Theme Colors & Scoring Strategy
const COLOR_CONFIG: Record<
  BubbleColor,
  { hex: string; points: number; label: string }
> = {
  red: { hex: "#ff6b9d", points: 100, label: "Coral" }, // Coral Pink
  blue: { hex: "#4fc3f7", points: 150, label: "Ocean" }, // Ocean Blue
  green: { hex: "#26c6da", points: 200, label: "Aqua" }, // Aqua Green
  yellow: { hex: "#ffd54f", points: 250, label: "Pearl" }, // Pearl Yellow
  purple: { hex: "#7e57c2", points: 300, label: "Jellyfish" }, // Purple Jellyfish
  orange: { hex: "#ffab40", points: 500, label: "Starfish" }, // Orange Starfish
};

const COLOR_KEYS: BubbleColor[] = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
];

// Color Helper for Gradients
const adjustColor = (color: string, amount: number) => {
  const hex = color.replace("#", "");
  const r = Math.max(
    0,
    Math.min(255, parseInt(hex.substring(0, 2), 16) + amount)
  );
  const g = Math.max(
    0,
    Math.min(255, parseInt(hex.substring(2, 4), 16) + amount)
  );
  const b = Math.max(
    0,
    Math.min(255, parseInt(hex.substring(4, 6), 16) + amount)
  );

  const componentToHex = (c: number) => {
    const hex = c.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
};

const OceanBubbles: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameContainerRef = useRef<HTMLDivElement>(null);

  // Game State Refs
  const ballPos = useRef<Point>({ x: 0, y: 0 });
  const ballVel = useRef<Point>({ x: 0, y: 0 });
  const anchorPos = useRef<Point>({ x: 0, y: 0 });
  const isPinching = useRef<boolean>(false);
  const isFlying = useRef<boolean>(false);
  const flightStartTime = useRef<number>(0);
  const bubbles = useRef<Bubble[]>([]);
  const particles = useRef<Particle[]>([]);
  const scoreRef = useRef<number>(0);

  // Smoothing for stable aim
  const smoothedBallPos = useRef<Point>({ x: 0, y: 0 });
  const positionHistory = useRef<Point[]>([]);

  const isGameOverRef = useRef<boolean>(false);

  // Combo System
  const comboCount = useRef<number>(0);
  const comboTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Current active color (Ref for loop, State for UI)
  const selectedColorRef = useRef<BubbleColor>("red");

  // React State
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("game");
  const [currentLevel, setCurrentLevel] = useState<LevelConfig | null>(LEVELS[0]);
  const [levels, setLevels] = useState<LevelConfig[]>(LEVELS);
  const [ballsRemaining, setBallsRemaining] = useState(LEVELS[0].ballsLimit);
  const [fishFreed, setFishFreed] = useState(0);
  const [volume, setVolume] = useState(1);
  const [score, setScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [selectedColor, setSelectedColor] = useState<BubbleColor>("red");
  const [availableColors, setAvailableColors] = useState<BubbleColor[]>([]);
  const [colorPair, setColorPair] = useState<[BubbleColor, BubbleColor]>([
    "red",
    "blue",
  ]);
  const [isMuted, setIsMuted] = useState(false);
  const [currentCombo, setCurrentCombo] = useState(0);
  const [comboMultiplier, setComboMultiplier] = useState(1);
  const [showComboText, setShowComboText] = useState(false);
  const [hoveredColor, setHoveredColor] = useState<BubbleColor | null>(null);

  // Track color button positions
  const colorButtonRefs = useRef<Map<BubbleColor, DOMRect>>(new Map());
  const lastMenuAction = useRef<number>(0);

  // Sync state to ref
  useEffect(() => {
    selectedColorRef.current = selectedColor;
  }, [selectedColor]);

  useEffect(() => {
    isGameOverRef.current = isGameOver;
  }, [isGameOver]);

  useEffect(() => {
    audioManager.setMuted(isMuted);
  }, [isMuted]);

  // Haptic feedback helper
  const triggerHaptic = (pattern: number | number[]) => {
    if (!isMuted && typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  };

  const getBubblePos = (row: number, col: number, width: number) => {
    const xOffset = (width - GRID_COLS * BUBBLE_RADIUS * 2) / 2 + BUBBLE_RADIUS;
    const isOdd = row % 2 !== 0;
    const x = xOffset + col * (BUBBLE_RADIUS * 2) + (isOdd ? BUBBLE_RADIUS : 0);
    const y = BUBBLE_RADIUS + row * ROW_HEIGHT;
    return { x, y };
  };

  const updateAvailableColors = () => {
    const activeColors = new Set<BubbleColor>();
    bubbles.current.forEach((b) => {
      if (b.active) activeColors.add(b.color);
    });
    setAvailableColors(Array.from(activeColors));

    // If current selected color is gone, switch to first available
    if (!activeColors.has(selectedColorRef.current) && activeColors.size > 0) {
      const next = Array.from(activeColors)[0];
      setSelectedColor(next);
    }
  };

  const generateNewColorPair = useCallback(() => {
    const activeColors = new Set<BubbleColor>();
    bubbles.current.forEach((b) => {
      if (b.active) activeColors.add(b.color);
    });
    const activeArray = Array.from(activeColors);

    if (activeArray.length >= 2) {
      // Pick 2 random colors from active colors
      const shuffled = [...activeArray].sort(() => Math.random() - 0.5);
      const newPair: [BubbleColor, BubbleColor] = [shuffled[0], shuffled[1]];
      setColorPair(newPair);
      // Auto-select first color in pair
      setSelectedColor(newPair[0]);
    } else if (activeArray.length === 1) {
      setColorPair([activeArray[0], activeArray[0]]);
      setSelectedColor(activeArray[0]);
    }
  }, []);

  const initGrid = useCallback(
    (width: number, levelConfig?: LevelConfig) => {
      const newBubbles: Bubble[] = [];
      const rowCount = levelConfig ? levelConfig.rows : 5;
      const fishCount = levelConfig ? levelConfig.fishCount : 0;
      let fishBubbles: string[] = [];

      // Generate all bubble positions first
      const allPositions: { r: number; c: number }[] = [];
      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < (r % 2 !== 0 ? GRID_COLS - 1 : GRID_COLS); c++) {
          if (Math.random() > 0.1) {
            allPositions.push({ r, c });
          }
        }
      }

      // Randomly select positions for fish bubbles
      const shuffled = [...allPositions].sort(() => Math.random() - 0.5);
      fishBubbles = shuffled
        .slice(0, fishCount)
        .map((pos) => `${pos.r}-${pos.c}`);

      // Create bubbles
      for (const pos of allPositions) {
        const { x, y } = getBubblePos(pos.r, pos.c, width);
        const id = `${pos.r}-${pos.c}`;
        newBubbles.push({
          id,
          row: pos.r,
          col: pos.c,
          x,
          y,
          color: COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)],
          active: true,
          hasFish: fishBubbles.includes(id),
        });
      }
      bubbles.current = newBubbles;
      updateAvailableColors();
      setTimeout(() => generateNewColorPair(), 100);
    },
    [generateNewColorPair]
  );

  const startQuickGame = () => {
    setScreen("game");
    setCurrentLevel(null);
    setBallsRemaining(999); // Unlimited for quick play
    setFishFreed(0);
    resetGame();
  };

  const startLevel = (level: LevelConfig) => {
    if (!level.unlocked) return;
    setCurrentLevel(level);
    setScreen("game");
    setBallsRemaining(level.ballsLimit);
    setFishFreed(0);
    resetGame();
  };

  const resetGame = () => {
    scoreRef.current = 0;
    setScore(0);
    particles.current = [];
    setIsGameOver(false);
    isGameOverRef.current = false;
    isFlying.current = false;
    ballVel.current = { x: 0, y: 0 };
    resetCombo(); // Reset combo system
    if (canvasRef.current) {
      ballPos.current = {
        x: canvasRef.current.width / 2,
        y: canvasRef.current.height - SLINGSHOT_BOTTOM_OFFSET,
      };
      initGrid(canvasRef.current.width);
    }
    audioManager.playClick();
  };

  const checkGameOverCondition = () => {
    // Level mode: check if no balls left or level complete
    if (currentLevel) {
      // Win condition: all fish rescued
      if (fishFreed >= currentLevel.fishCount) {
        setIsGameOver(true);
        isGameOverRef.current = true;
        audioManager.playPop(5);
        triggerHaptic([100, 50, 100]);
        // Unlock next level
        setLevels((prev) =>
          prev.map((l) =>
            l.id === currentLevel.id + 1 ? { ...l, unlocked: true } : l
          )
        );
        return;
      }

      // Lose condition: no balls left
      if (ballsRemaining <= 0 && !isFlying.current) {
        setIsGameOver(true);
        isGameOverRef.current = true;
        audioManager.playPop(5);
        triggerHaptic([100, 50, 100]);
        return;
      }
    }

    // Quick play mode: bubbles reach bottom
    const threshold = anchorPos.current.y - 60;
    const reached = bubbles.current.some(
      (b) => b.active && b.y + BUBBLE_RADIUS > threshold
    );
    if (reached) {
      setIsGameOver(true);
      isGameOverRef.current = true;
      audioManager.playPop(5);
      triggerHaptic([100, 50, 100]);
    }
  };

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 15; i++) {
      particles.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1.0,
        color,
      });
    }
  };

  const isNeighbor = (a: Bubble, b: Bubble) => {
    const dr = b.row - a.row;
    const dc = b.col - a.col;
    if (Math.abs(dr) > 1) return false;
    if (dr === 0) return Math.abs(dc) === 1;
    if (a.row % 2 !== 0) {
      return dc === 0 || dc === 1;
    } else {
      return dc === -1 || dc === 0;
    }
  };

  const getCluster = (start: Bubble, colorMatch: boolean = true): Bubble[] => {
    const cluster: Bubble[] = [];
    const queue = [start];
    const visited = new Set<string>([start.id]);
    const targetColor = start.color;

    while (queue.length > 0) {
      const current = queue.shift()!;
      cluster.push(current);

      const neighbors = bubbles.current.filter(
        (b) =>
          b.active &&
          !visited.has(b.id) &&
          isNeighbor(current, b) &&
          (!colorMatch || b.color === targetColor)
      );

      neighbors.forEach((n) => {
        visited.add(n.id);
        queue.push(n);
      });
    }
    return cluster;
  };

  const getConnectedToTop = (bubbleList: Bubble[]): Set<string> => {
    const active = bubbleList.filter((b) => b.active);
    const topRow = active.filter((b) => b.row === 0);
    const connected = new Set<string>();
    const queue = [...topRow];
    topRow.forEach((b) => connected.add(b.id));

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = active.filter(
        (n) => !connected.has(n.id) && isNeighbor(curr, n)
      );
      neighbors.forEach((n) => {
        connected.add(n.id);
        queue.push(n);
      });
    }
    return connected;
  };

  const calculateAvalanche = (cluster: Bubble[]): number => {
    const clusterIds = new Set(cluster.map((b) => b.id));
    const hypotheticalBubbles = bubbles.current.map((b) => ({
      ...b,
      active: b.active && !clusterIds.has(b.id),
    }));

    const connected = getConnectedToTop(hypotheticalBubbles);
    const activeCount = hypotheticalBubbles.filter((b) => b.active).length;
    return activeCount - connected.size;
  };

  const cleanupOrphans = () => {
    const connected = getConnectedToTop(bubbles.current);
    let orphansPopped = 0;
    bubbles.current.forEach((b) => {
      if (b.active && !connected.has(b.id)) {
        b.active = false;
        createExplosion(b.x, b.y, COLOR_CONFIG[b.color].hex);
        scoreRef.current += Math.floor(COLOR_CONFIG[b.color].points * 0.5);
        orphansPopped++;
      }
    });

    if (orphansPopped > 0) {
      setScore(scoreRef.current);
      audioManager.playPop(Math.min(5, Math.ceil(orphansPopped / 2)));
    }
  };

  const resetCombo = () => {
    comboCount.current = 0;
    setCurrentCombo(0);
    setComboMultiplier(1);
    setShowComboText(false);
  };

  const incrementCombo = () => {
    // Clear existing timeout
    if (comboTimeoutRef.current) {
      clearTimeout(comboTimeoutRef.current);
    }

    // Increment combo
    comboCount.current += 1;
    setCurrentCombo(comboCount.current);

    // Calculate multiplier: 1x, 2x, 3x, 4x, 5x (max)
    const multiplier = Math.min(comboCount.current, 5);
    setComboMultiplier(multiplier);

    // Show combo text with animation
    setShowComboText(true);
    setTimeout(() => setShowComboText(false), 1500);

    // Enhanced haptic for combos
    if (comboCount.current >= 3) {
      triggerHaptic([50, 30, 50, 30, 50]);
    }

    // Set timeout to reset combo (3 seconds)
    comboTimeoutRef.current = setTimeout(() => {
      resetCombo();
    }, 3000);
  };

  const checkMatches = (startBubble: Bubble) => {
    const matches = getCluster(startBubble, true);

    if (matches.length >= 3) {
      let points = 0;
      const basePoints = COLOR_CONFIG[startBubble.color].points;

      // Increment combo chain
      incrementCombo();

      audioManager.playPop(matches.length);

      matches.forEach((b) => {
        b.active = false;
        // Check if bubble has fish
        if (b.hasFish) {
          setFishFreed((prev) => prev + 1);
        }
        createExplosion(b.x, b.y, COLOR_CONFIG[b.color].hex);
        points += basePoints;
      });

      // Apply size bonus
      const sizeMultiplier = matches.length > 3 ? 1.5 : 1.0;

      // Apply combo multiplier
      const totalMultiplier = sizeMultiplier * comboMultiplier;

      scoreRef.current += Math.floor(points * totalMultiplier);
      setScore(scoreRef.current);

      // Clean up bubbles that are now orphans
      cleanupOrphans();
      return true;
    } else {
      // No match - reset combo
      resetCombo();
    }
    return false;
  };

  const handleColorSelect = (color: BubbleColor) => {
    if (isGameOver) return;
    setSelectedColor(color);
    audioManager.playClick();
  };

  const drawBubble = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    colorKey: BubbleColor
  ) => {
    const config = COLOR_CONFIG[colorKey];
    const baseColor = config.hex;

    const grad = ctx.createRadialGradient(
      x - radius * 0.3,
      y - radius * 0.3,
      radius * 0.1,
      x,
      y,
      radius
    );
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.2, baseColor);
    grad.addColorStop(1, adjustColor(baseColor, -60));

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = adjustColor(baseColor, -80);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(
      x - radius * 0.3,
      y - radius * 0.35,
      radius * 0.25,
      radius * 0.15,
      Math.PI / 4,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fill();
  };

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !gameContainerRef.current)
      return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = gameContainerRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    anchorPos.current = {
      x: canvas.width / 2,
      y: canvas.height - SLINGSHOT_BOTTOM_OFFSET,
    };
    ballPos.current = { ...anchorPos.current };

    // Initialize grid with first level configuration
    initGrid(canvas.width, LEVELS[0]);

    let camera: any = null;
    let hands: any = null;

    const onResults = (results: any) => {
      setLoading(false);

      if (
        canvas.width !== container.clientWidth ||
        canvas.height !== container.clientHeight
      ) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        anchorPos.current = {
          x: canvas.width / 2,
          y: canvas.height - SLINGSHOT_BOTTOM_OFFSET,
        };
        if (!isFlying.current && !isPinching.current) {
          ballPos.current = { ...anchorPos.current };
        }
      }

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw video background if available
      if (results.image) {
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(0, 15, 30, 0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        // Fallback: ocean gradient background
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#001F3F');
        gradient.addColorStop(0.5, '#003d5c');
        gradient.addColorStop(1, '#00263d');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Skip drawing game elements when not on game screen, but allow hand tracking
      if (screen !== "game") {
        // Still draw hand tracking landmarks for menu navigation
        if (
          results.multiHandLandmarks &&
          results.multiHandLandmarks.length > 0
        ) {
          const landmarks = results.multiHandLandmarks[0];
          if (window.drawConnectors && window.drawLandmarks) {
            window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
              color: "#669df6",
              lineWidth: 1,
            });
            window.drawLandmarks(ctx, landmarks, {
              color: "#aecbfa",
              lineWidth: 1,
              radius: 2,
            });
          }
        }
        ctx.restore();
        return;
      }

      if (isGameOverRef.current) {
        bubbles.current.forEach((b) => {
          if (!b.active) return;
          drawBubble(ctx, b.x, b.y, BUBBLE_RADIUS - 1, b.color);
        });
        ctx.restore();
        return;
      }

      let handPos: Point | null = null;
      let pinchDist = 1.0;

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const idxTip = landmarks[8];
        const thumbTip = landmarks[4];

        handPos = {
          x: (idxTip.x * canvas.width + thumbTip.x * canvas.width) / 2,
          y: (idxTip.y * canvas.height + thumbTip.y * canvas.height) / 2,
        };

        const dx = idxTip.x - thumbTip.x;
        const dy = idxTip.y - thumbTip.y;
        pinchDist = Math.sqrt(dx * dx + dy * dy);

        if (window.drawConnectors && window.drawLandmarks) {
          window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
            color: "#669df6",
            lineWidth: 1,
          });
          window.drawLandmarks(ctx, landmarks, {
            color: "#aecbfa",
            lineWidth: 1,
            radius: 2,
          });
        }

        ctx.beginPath();
        ctx.arc(handPos.x, handPos.y, 20, 0, Math.PI * 2);
        ctx.strokeStyle = pinchDist < PINCH_THRESHOLD ? "#26c6da" : "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Check if hand is hovering over color buttons
        let colorHovered: BubbleColor | null = null;
        let hoveredButton: Element | null = null;
        const colorButtons = document.querySelectorAll("[data-color-button]");

        // Use index finger tip position for hover (already declared above)
        const idxPos = {
          x: idxTip.x * canvas.width,
          y: idxTip.y * canvas.height,
        };

        colorButtons.forEach((button) => {
          const rect = button.getBoundingClientRect();
          const colorAttr = button.getAttribute("data-color-button");
          if (
            colorAttr &&
            idxPos &&
            idxPos.x >= rect.left &&
            idxPos.x <= rect.right &&
            idxPos.y >= rect.top &&
            idxPos.y <= rect.bottom
          ) {
            colorHovered = colorAttr as BubbleColor;
            hoveredButton = button;
          }
        });
        setHoveredColor(colorHovered);

        // Pinch to select color button in game
        if (
          screen === "game" &&
          colorHovered &&
          hoveredButton &&
          pinchDist < PINCH_THRESHOLD &&
          !isFlying.current &&
          !isPinching.current
        ) {
          const rect = hoveredButton.getBoundingClientRect();
          const idxInside =
            idxPos.x >= rect.left &&
            idxPos.x <= rect.right &&
            idxPos.y >= rect.top &&
            idxPos.y <= rect.bottom;

          if (idxInside && selectedColorRef.current !== colorHovered) {
            setSelectedColor(colorHovered);
            audioManager.playClick();
            triggerHaptic(15);
          }
        }

        // Menu button detection for home screen
        if (screen === "home") {
          const menuButtons = document.querySelectorAll("[data-menu-button]");
          let menuHovered: string | null = null;

          menuButtons.forEach((button) => {
            const rect = button.getBoundingClientRect();
            if (
              idxPos.x >= rect.left &&
              idxPos.x <= rect.right &&
              idxPos.y >= rect.top &&
              idxPos.y <= rect.bottom
            ) {
              menuHovered = button.getAttribute("data-menu-button");
              button.classList.add("scale-110", "ring-4", "ring-white/60");
            } else {
              button.classList.remove("scale-110", "ring-4", "ring-white/60");
            }
          });

          // Pinch to select menu option
          if (menuHovered && pinchDist < PINCH_THRESHOLD) {
            const now = performance.now();
            if (now - lastMenuAction.current > 1000) {
              // 1 second debounce
              lastMenuAction.current = now;
              audioManager.playClick();
              triggerHaptic(20);

              if (menuHovered === "quickstart") {
                setTimeout(() => startQuickGame(), 200);
              } else if (menuHovered === "levels") {
                setTimeout(() => setScreen("levels"), 200);
              } else if (menuHovered === "settings") {
                setTimeout(() => setScreen("settings"), 200);
              }
            }
          }
        }
      }

      if (
        handPos &&
        pinchDist < PINCH_THRESHOLD &&
        !isFlying.current &&
        screen === "game"
      ) {
        const distToBall = Math.sqrt(
          Math.pow(handPos.x - ballPos.current.x, 2) +
            Math.pow(handPos.y - ballPos.current.y, 2)
        );
        if (!isPinching.current && distToBall < 100) {
          isPinching.current = true;
          triggerHaptic(20);
        }

        if (isPinching.current) {
          // Add to position history for smoothing
          positionHistory.current.push({ x: handPos.x, y: handPos.y });

          // Keep only last 5 positions
          if (positionHistory.current.length > 5) {
            positionHistory.current.shift();
          }

          // Calculate smoothed position (average of recent positions)
          let avgX = 0,
            avgY = 0;
          positionHistory.current.forEach((pos) => {
            avgX += pos.x;
            avgY += pos.y;
          });
          avgX /= positionHistory.current.length;
          avgY /= positionHistory.current.length;

          // Apply exponential smoothing for even smoother result
          const smoothing = 0.3; // Lower = smoother but slower response
          smoothedBallPos.current.x =
            smoothedBallPos.current.x * (1 - smoothing) + avgX * smoothing;
          smoothedBallPos.current.y =
            smoothedBallPos.current.y * (1 - smoothing) + avgY * smoothing;

          ballPos.current = {
            x: smoothedBallPos.current.x,
            y: smoothedBallPos.current.y,
          };

          const dragDx = ballPos.current.x - anchorPos.current.x;
          const dragDy = ballPos.current.y - anchorPos.current.y;
          const dragDist = Math.sqrt(dragDx * dragDx + dragDy * dragDy);

          if (dragDist > MAX_DRAG_DIST) {
            const angle = Math.atan2(dragDy, dragDx);
            ballPos.current.x =
              anchorPos.current.x + Math.cos(angle) * MAX_DRAG_DIST;
            ballPos.current.y =
              anchorPos.current.y + Math.sin(angle) * MAX_DRAG_DIST;
            smoothedBallPos.current = { ...ballPos.current };
          }
        }
      } else if (
        isPinching.current &&
        (!handPos || pinchDist >= PINCH_THRESHOLD)
      ) {
        isPinching.current = false;
        positionHistory.current = []; // Clear history for next aim

        const dx = anchorPos.current.x - ballPos.current.x;
        const dy = anchorPos.current.y - ballPos.current.y;
        const stretchDist = Math.sqrt(dx * dx + dy * dy);

        if (stretchDist > 30) {
          // Decrease balls remaining in level mode
          if (currentLevel && ballsRemaining > 0) {
            setBallsRemaining((prev) => prev - 1);
          }

          isFlying.current = true;
          flightStartTime.current = performance.now();
          audioManager.playShoot();

          const powerRatio = Math.min(stretchDist / MAX_DRAG_DIST, 1.0);
          const velocityMultiplier =
            MIN_FORCE_MULT +
            (MAX_FORCE_MULT - MIN_FORCE_MULT) * (powerRatio * powerRatio);

          ballVel.current = {
            x: dx * velocityMultiplier,
            y: dy * velocityMultiplier,
          };
        } else {
          ballPos.current = { ...anchorPos.current };
        }
      } else if (!isFlying.current && !isPinching.current) {
        const dx = anchorPos.current.x - ballPos.current.x;
        const dy = anchorPos.current.y - ballPos.current.y;
        ballPos.current.x += dx * 0.15;
        ballPos.current.y += dy * 0.15;
      }

      if (isFlying.current) {
        if (performance.now() - flightStartTime.current > 10000) {
          isFlying.current = false;
          ballPos.current = { ...anchorPos.current };
          ballVel.current = { x: 0, y: 0 };
        } else {
          const currentSpeed = Math.sqrt(
            ballVel.current.x ** 2 + ballVel.current.y ** 2
          );
          const steps = Math.max(1, Math.ceil(currentSpeed / 5));
          let collisionOccurred = false;

          for (let i = 0; i < steps; i++) {
            ballPos.current.x += ballVel.current.x / steps;
            ballPos.current.y += ballVel.current.y / steps;

            // Wall collision with proper bounce
            if (ballPos.current.x < BUBBLE_RADIUS) {
              ballPos.current.x = BUBBLE_RADIUS;
              ballVel.current.x =
                Math.abs(ballVel.current.x) * BOUNCE_RESTITUTION;
              audioManager.playClick();
              triggerHaptic(10);
            } else if (ballPos.current.x > canvas.width - BUBBLE_RADIUS) {
              ballPos.current.x = canvas.width - BUBBLE_RADIUS;
              ballVel.current.x =
                -Math.abs(ballVel.current.x) * BOUNCE_RESTITUTION;
              audioManager.playClick();
              triggerHaptic(10);
            }

            // Ceiling collision
            if (ballPos.current.y < BUBBLE_RADIUS) {
              collisionOccurred = true;
              break;
            }

            // Bubble collision detection - STICK IMMEDIATELY
            for (const b of bubbles.current) {
              if (!b.active) continue;
              const bdx = ballPos.current.x - b.x;
              const bdy = ballPos.current.y - b.y;
              const distSq = bdx * bdx + bdy * bdy;
              const minDist = BUBBLE_RADIUS * BUBBLE_COLLISION_DISTANCE;

              if (distSq < minDist * minDist) {
                // STICK on contact - no bouncing between bubbles
                collisionOccurred = true;
                audioManager.playClick();
                triggerHaptic(15);
                break;
              }
            }
            if (collisionOccurred) break;
          }

          // Apply physics
          ballVel.current.y += GRAVITY;
          ballVel.current.x *= FRICTION;
          ballVel.current.y *= FRICTION;

          if (collisionOccurred) {
            isFlying.current = false;
            let bestDist = Infinity;
            let bestRow = 0;
            let bestCol = 0;
            let bestX = 0;
            let bestY = 0;

            for (let r = 0; r < GRID_ROWS + 10; r++) {
              const colsInRow = r % 2 !== 0 ? GRID_COLS - 1 : GRID_COLS;
              for (let c = 0; c < colsInRow; c++) {
                const { x, y } = getBubblePos(r, c, canvas.width);
                const occupied = bubbles.current.some(
                  (b) => b.active && b.row === r && b.col === c
                );
                if (occupied) continue;
                const dist = Math.sqrt(
                  Math.pow(ballPos.current.x - x, 2) +
                    Math.pow(ballPos.current.y - y, 2)
                );
                if (dist < bestDist) {
                  bestDist = dist;
                  bestRow = r;
                  bestCol = c;
                  bestX = x;
                  bestY = y;
                }
              }
            }

            const newBubble: Bubble = {
              id: `${bestRow}-${bestCol}-${Date.now()}`,
              row: bestRow,
              col: bestCol,
              x: bestX,
              y: bestY,
              color: selectedColorRef.current,
              active: true,
            };
            bubbles.current.push(newBubble);
            checkMatches(newBubble);
            checkGameOverCondition();
            updateAvailableColors();
            generateNewColorPair();
            ballPos.current = { ...anchorPos.current };
            ballVel.current = { x: 0, y: 0 };
          }

          if (ballPos.current.y > canvas.height) {
            isFlying.current = false;
            ballPos.current = { ...anchorPos.current };
            ballVel.current = { x: 0, y: 0 };
          }
        }
      }

      bubbles.current.forEach((b) => {
        if (!b.active) return;
        drawBubble(ctx, b.x, b.y, BUBBLE_RADIUS - 1, b.color);

        // Draw fish icon if bubble has fish
        if (b.hasFish) {
          ctx.save();
          ctx.font = "bold 16px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🐠", b.x, b.y);
          ctx.restore();
        }
      });

      if (isPinching.current && !isFlying.current) {
        const dx = anchorPos.current.x - ballPos.current.x;
        const dy = anchorPos.current.y - ballPos.current.y;
        const stretchDist = Math.sqrt(dx * dx + dy * dy);

        if (stretchDist > 20) {
          const powerRatio = Math.min(stretchDist / MAX_DRAG_DIST, 1.0);
          const velocityMultiplier =
            MIN_FORCE_MULT +
            (MAX_FORCE_MULT - MIN_FORCE_MULT) * (powerRatio * powerRatio);

          let tx = anchorPos.current.x;
          let ty = anchorPos.current.y;
          let tvx = dx * velocityMultiplier;
          let tvy = dy * velocityMultiplier;

          ctx.save();
          ctx.globalAlpha = 0.7;
          ctx.setLineDash([8, 6]);
          ctx.strokeStyle = "#4fc3f7";
          ctx.lineWidth = 3;
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#4fc3f7";
          ctx.beginPath();
          ctx.moveTo(tx, ty);

          let collision = false;
          const maxSteps = 150; // More steps for longer trajectory

          for (let step = 0; step < maxSteps; step++) {
            let reflectionsThisStep = 0;

            // Smaller substeps for smoother trajectory
            for (let sub = 0; sub < 2; sub++) {
              tx += tvx / 2;
              ty += tvy / 2;

              // Wall bounces
              if (tx < BUBBLE_RADIUS) {
                tx = BUBBLE_RADIUS;
                tvx = Math.abs(tvx) * BOUNCE_RESTITUTION;
                reflectionsThisStep++;
              } else if (tx > canvas.width - BUBBLE_RADIUS) {
                tx = canvas.width - BUBBLE_RADIUS;
                tvx = -Math.abs(tvx) * BOUNCE_RESTITUTION;
                reflectionsThisStep++;
              }

              // Ceiling collision
              if (ty < BUBBLE_RADIUS) {
                collision = true;
                break;
              }

              // Check collision with bubbles - STICK IMMEDIATELY
              for (const b of bubbles.current) {
                if (!b.active) continue;
                const bdx = tx - b.x;
                const bdy = ty - b.y;
                const distSq = bdx * bdx + bdy * bdy;
                const minDist = BUBBLE_RADIUS * BUBBLE_COLLISION_DISTANCE;

                if (distSq < minDist * minDist) {
                  // STICK on any contact
                  collision = true;
                  break;
                }
              }
              if (collision) break;

              // Apply physics
              tvy += GRAVITY;
              tvx *= FRICTION;
              tvy *= FRICTION;
            }

            if (collision) {
              ctx.lineTo(tx, ty);
              break;
            }

            // Draw trajectory point
            ctx.lineTo(tx, ty);

            // Stop if out of bounds
            if (ty > canvas.height || tx < 0 || tx > canvas.width) break;
          }

          ctx.stroke();

          // Draw target indicator
          if (collision) {
            ctx.setLineDash([]);

            // Outer pulsing circle
            const pulse = (Math.sin(performance.now() / 120) + 1) / 2;
            ctx.beginPath();
            ctx.arc(tx, ty, 12 + pulse * 8, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(79, 195, 247, 0.4)";
            ctx.lineWidth = 2;
            ctx.stroke();

            // Inner solid circle
            ctx.beginPath();
            ctx.arc(tx, ty, 6, 0, Math.PI * 2);
            ctx.fillStyle = "#4fc3f7";
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      const bandColor = isPinching.current
        ? "#ffd54f"
        : "rgba(79, 195, 247, 0.4)";
      if (!isFlying.current) {
        // Left band with gradient
        const leftGrad = ctx.createLinearGradient(
          anchorPos.current.x - 35,
          anchorPos.current.y - 10,
          ballPos.current.x,
          ballPos.current.y
        );
        leftGrad.addColorStop(0, "rgba(79, 195, 247, 0.6)");
        leftGrad.addColorStop(1, bandColor);

        ctx.beginPath();
        ctx.moveTo(anchorPos.current.x - 35, anchorPos.current.y - 10);
        ctx.lineTo(ballPos.current.x, ballPos.current.y);
        ctx.lineWidth = 5;
        ctx.strokeStyle = leftGrad;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      ctx.save();
      // Add glow effect to ball when pinching
      if (isPinching.current) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = COLOR_CONFIG[selectedColorRef.current].hex;
      }
      drawBubble(
        ctx,
        ballPos.current.x,
        ballPos.current.y,
        BUBBLE_RADIUS,
        selectedColorRef.current
      );
      ctx.restore();

      if (!isFlying.current) {
        // Right band with gradient
        const rightGrad = ctx.createLinearGradient(
          ballPos.current.x,
          ballPos.current.y,
          anchorPos.current.x + 35,
          anchorPos.current.y - 10
        );
        rightGrad.addColorStop(0, bandColor);
        rightGrad.addColorStop(1, "rgba(79, 195, 247, 0.6)");

        ctx.beginPath();
        ctx.moveTo(ballPos.current.x, ballPos.current.y);
        ctx.lineTo(anchorPos.current.x + 35, anchorPos.current.y - 10);
        ctx.lineWidth = 5;
        ctx.strokeStyle = rightGrad;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // Ocean-themed slingshot
      ctx.beginPath();
      ctx.moveTo(anchorPos.current.x, canvas.height);
      ctx.lineTo(anchorPos.current.x, anchorPos.current.y + 40);
      ctx.lineTo(anchorPos.current.x - 40, anchorPos.current.y);
      ctx.moveTo(anchorPos.current.x, anchorPos.current.y + 40);
      ctx.lineTo(anchorPos.current.x + 40, anchorPos.current.y);
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#26c6da"; // Aqua ocean color
      ctx.stroke();

      for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
        if (p.life <= 0) particles.current.splice(i, 1);
        else {
          ctx.globalAlpha = p.life;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }
      }
      ctx.restore();
    };

    // Initialize hand tracking for all devices
    if (window.Hands) {
      hands = new window.Hands({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      hands.onResults(onResults);
      if (window.Camera) {
        camera = new window.Camera(video, {
          onFrame: async () => {
            if (videoRef.current && hands)
              await hands.send({ image: videoRef.current });
          },
          width: 1280,
          height: 720,
        });
        camera.start();
      }
    } else {
      // Fallback: render loop without camera/hand tracking
      setLoading(false);
      let animationFrameId: number;
      const renderLoop = () => {
        onResults({ image: null });
        animationFrameId = requestAnimationFrame(renderLoop);
      };
      renderLoop();
      
      return () => {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
      };
    }

    return () => {
      if (camera) camera.stop();
      if (hands) hands.close();
    };
  }, [initGrid]);

  return (
    <div className="flex w-full h-screen bg-gradient-to-b from-[#001F3F] via-[#003d5c] to-[#00263d] overflow-hidden font-roboto text-[#e3e3e3] relative">

      {/* Animated Water Bubbles Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="bubble-float"
          style={{ left: "10%", animationDelay: "0s" }}
        />
        <div
          className="bubble-float"
          style={{ left: "20%", animationDelay: "2s" }}
        />
        <div
          className="bubble-float"
          style={{ left: "35%", animationDelay: "4s" }}
        />
        <div
          className="bubble-float"
          style={{ left: "50%", animationDelay: "1s" }}
        />
        <div
          className="bubble-float"
          style={{ left: "65%", animationDelay: "3s" }}
        />
        <div
          className="bubble-float"
          style={{ left: "80%", animationDelay: "5s" }}
        />
        <div
          className="bubble-float"
          style={{ left: "90%", animationDelay: "2.5s" }}
        />
      </div>

      <div
        ref={gameContainerRef}
        className="flex-1 relative h-full overflow-hidden z-10"
      >
        <video ref={videoRef} className="absolute hidden" playsInline />
        <canvas ref={canvasRef} className="absolute inset-0" />

        <button
          onClick={() => setIsMuted(!isMuted)}
          className="absolute top-6 right-6 z-50 bg-[#003d5c]/80 p-3 rounded-full border border-[#4fc3f7]/30 hover:bg-[#004d6d] transition-all shadow-lg backdrop-blur-sm"
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5 text-[#ff6b9d]" />
          ) : (
            <Volume2 className="w-5 h-5 text-[#4fc3f7]" />
          )}
        </button>

        {loading && screen === "game" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#001F3F] to-[#00263d] z-50">
            <div className="flex flex-col items-center">
              <Loader2 className="w-12 h-12 text-[#4fc3f7] animate-spin mb-4" />
              <p className="text-[#e3e3e3] text-lg font-medium">
                Diving into the Ocean...
              </p>
            </div>
          </div>
        )}

        {/* Home Screen with Tutorial Guide */}
        {screen === "home" && !loading && (
          <>
            {/* Tutorial Guide - Top Right Corner */}
            <div className="absolute top-8 right-8 z-40 max-w-xs">
              <div className="bg-[#001F3F]/90 backdrop-blur-md rounded-[24px] p-4 border border-[#4fc3f7]/30">
                <h2 className="text-lg font-bold text-[#4fc3f7] mb-2 flex items-center gap-2">
                  📖 How to Play
                </h2>
                <div className="space-y-1.5 text-[#c4c7c5] text-xs leading-relaxed">
                  <p>
                    👆 <span className="text-white font-semibold">Pinch</span>{" "}
                    near button
                  </p>
                  <p>
                    🤏{" "}
                    <span className="text-white font-semibold">Hold pinch</span>{" "}
                    to select
                  </p>
                  <p>
                    🎯{" "}
                    <span className="text-white font-semibold">
                      Pinch & pull
                    </span>{" "}
                    to shoot
                  </p>
                  <p>
                    🐠{" "}
                    <span className="text-white font-semibold">Match 3+</span>{" "}
                    to rescue fish
                  </p>
                </div>
              </div>
            </div>

            <div className="absolute inset-0 z-50 flex items-center justify-center">
              <div className="text-center max-w-2xl px-8">
                <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#4fc3f7] to-[#ff6b9d] mb-4 animate-pulse">
                  Ocean Bubble Shooter
                </h1>
                <p className="text-xl text-[#c4c7c5] mb-12">
                  🐟 Rescue the Fish with Hand Gestures 🐟
                </p>

                <div className="flex flex-col gap-4">
                  <button
                    data-menu-button="quickstart"
                    className="group bg-gradient-to-r from-[#4fc3f7] to-[#26c6da] px-12 py-5 rounded-[24px] text-white text-xl font-bold transition-all shadow-lg relative overflow-hidden"
                  >
                    <Play className="inline w-6 h-6 mr-2" />
                    Quick Start
                    <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>

                  <button
                    data-menu-button="levels"
                    className="group bg-gradient-to-r from-[#7e57c2] to-[#9c27b0] px-12 py-5 rounded-[24px] text-white text-xl font-bold transition-all shadow-lg relative overflow-hidden"
                  >
                    <Star className="inline w-6 h-6 mr-2" />
                    Levels
                    <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>

                  <button
                    data-menu-button="settings"
                    className="group bg-gradient-to-r from-[#ffab40] to-[#ff6b9d] px-12 py-5 rounded-[24px] text-white text-xl font-bold transition-all shadow-lg relative overflow-hidden"
                  >
                    <SettingsIcon className="inline w-6 h-6 mr-2" />
                    Settings
                    <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Levels Screen */}
        {screen === "levels" && !loading && (
          <div className="absolute inset-0 z-50 overflow-y-auto p-8">
            <button
              onClick={() => setScreen("home")}
              className="mb-6 bg-[#003d5c]/80 px-4 py-2 rounded-full border border-[#4fc3f7]/30 hover:bg-[#004d6d] transition-all flex items-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>

            <h2 className="text-4xl font-black text-center text-transparent bg-clip-text bg-gradient-to-r from-[#4fc3f7] to-[#ff6b9d] mb-8">
              Choose Your Level
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-6xl mx-auto">
              {levels.map((level) => (
                <button
                  key={level.id}
                  onClick={() => startLevel(level)}
                  disabled={!level.unlocked}
                  className={`relative p-6 rounded-[20px] border-2 transition-all ${
                    level.unlocked
                      ? "bg-gradient-to-br from-[#003d5c] to-[#004d6d] border-[#4fc3f7]/40 hover:scale-105 hover:shadow-[0_0_20px_rgba(79,195,247,0.4)] cursor-pointer"
                      : "bg-[#002840]/50 border-[#4fc3f7]/10 opacity-50 cursor-not-allowed"
                  }`}
                >
                  {!level.unlocked && (
                    <Lock className="absolute top-2 right-2 w-5 h-5 text-[#ff6b9d]" />
                  )}
                  <div className="text-3xl font-black text-white mb-2">
                    {level.id}
                  </div>
                  <div className="text-sm font-bold text-[#4fc3f7] mb-3">
                    {level.name}
                  </div>
                  <div className="text-xs text-[#c4c7c5] space-y-1">
                    <div className="flex items-center gap-1 justify-center">
                      <Fish className="w-4 h-4 text-[#ffab40]" />
                      <span>{level.fishCount}</span>
                    </div>
                    <div className="flex items-center gap-1 justify-center">
                      <Target className="w-4 h-4 text-[#ff6b9d]" />
                      <span>{level.ballsLimit}</span>
                    </div>
                  </div>
                  {level.stars > 0 && (
                    <div className="flex justify-center gap-1 mt-2">
                      {[...Array(level.stars)].map((_, i) => (
                        <Star
                          key={i}
                          className="w-4 h-4 text-[#ffd54f] fill-current"
                        />
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Settings Screen */}
        {screen === "settings" && !loading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-8">
            <div className="bg-[#003d5c]/90 backdrop-blur-md p-10 rounded-[32px] border border-[#4fc3f7]/40 max-w-md w-full">
              <button
                onClick={() => setScreen("home")}
                className="mb-6 bg-[#004d6d] px-4 py-2 rounded-full border border-[#4fc3f7]/30 hover:bg-[#005d7d] transition-all flex items-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>

              <h2 className="text-3xl font-black text-center text-white mb-8">
                Settings
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-lg font-bold text-[#c4c7c5] mb-3">
                    Volume
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setVolume(val);
                      audioManager.setVolume(val);
                    }}
                    className="w-full h-2 bg-[#004d6d] rounded-lg appearance-none cursor-pointer accent-[#4fc3f7]"
                  />
                  <div className="flex justify-between text-sm text-[#c4c7c5] mt-2">
                    <span>0%</span>
                    <span className="font-bold text-[#4fc3f7]">
                      {Math.round(volume * 100)}%
                    </span>
                    <span>100%</span>
                  </div>
                </div>

                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="w-full bg-gradient-to-r from-[#ff6b9d] to-[#ff6b9d]/80 px-6 py-4 rounded-[20px] text-white font-bold hover:scale-105 transition-all flex items-center justify-center gap-3"
                >
                  {isMuted ? (
                    <VolumeX className="w-6 h-6" />
                  ) : (
                    <Volume2 className="w-6 h-6" />
                  )}
                  {isMuted ? "Unmute" : "Mute"}
                </button>
              </div>
            </div>
          </div>
        )}

        {isGameOver && (
          <div className="absolute inset-0 bg-[#001F3F]/90 z-[60] flex items-center justify-center backdrop-blur-md animate-in fade-in duration-500">
            <div className="bg-[#003d5c] p-10 rounded-[40px] border border-[#ff6b9d]/30 shadow-[0_0_50px_rgba(255,107,157,0.2)] flex flex-col items-center text-center max-w-sm">
              <div className="w-20 h-20 bg-[#ff6b9d]/20 rounded-full flex items-center justify-center mb-6">
                <XCircle className="w-12 h-12 text-[#ff6b9d]" />
              </div>
              <h2 className="text-4xl font-black text-white mb-2 tracking-tight">
                GAME OVER
              </h2>
              <p className="text-[#c4c7c5] mb-4 leading-relaxed italic font-light">
                {currentLevel
                  ? fishFreed >= currentLevel.fishCount
                    ? "🎉 All Fish Rescued!"
                    : `Only ${fishFreed}/${currentLevel.fishCount} fish rescued`
                  : "The bubbles reached the surface!"}
              </p>

              <div className="bg-black/20 w-full py-4 px-6 rounded-2xl mb-4 border border-white/5">
                <p className="text-xs text-[#4fc3f7]/70 uppercase tracking-widest font-bold mb-1">
                  Final Score
                </p>
                <p className="text-4xl font-bold text-[#4fc3f7]">
                  {score.toLocaleString()}
                </p>
              </div>

              {currentLevel && (
                <div className="bg-black/20 w-full py-3 px-6 rounded-2xl mb-6 border border-white/5">
                  <p className="text-xs text-[#ffab40]/70 uppercase tracking-widest font-bold mb-1">
                    Fish Rescued
                  </p>
                  <p className="text-2xl font-bold text-[#ffab40]">
                    {fishFreed}/{currentLevel.fishCount}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={resetGame}
                  className="flex items-center gap-2 bg-gradient-to-r from-[#ff6b9d] to-[#ff8fab] text-white px-8 py-4 rounded-full font-bold hover:scale-105 active:scale-95 transition-all shadow-xl hover:shadow-2xl"
                >
                  <RefreshCw className="w-6 h-6" />
                  Restart Game
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Game UI - Only show when screen is 'game' */}
        {screen === "game" && (
          <>
            {/* Level Progress UI */}
            {currentLevel && (
              <div className="absolute top-4 right-20 md:top-6 md:right-24 z-40 flex gap-2">
                <div className="bg-[#003d5c]/90 p-2 md:p-3 rounded-[16px] md:rounded-[20px] border border-[#ff6b9d]/40 shadow-2xl flex items-center gap-2 backdrop-blur-sm">
                  <Target className="w-4 h-4 md:w-5 md:h-5 text-[#ff6b9d]" />
                  <div>
                    <p className="text-[8px] md:text-[10px] text-[#c4c7c5] uppercase tracking-wider font-medium">
                      Balls
                    </p>
                    <p className="text-base md:text-lg font-bold text-white">
                      {ballsRemaining}
                    </p>
                  </div>
                </div>
                <div className="bg-[#003d5c]/90 p-2 md:p-3 rounded-[16px] md:rounded-[20px] border border-[#ffab40]/40 shadow-2xl flex items-center gap-2 backdrop-blur-sm">
                  <Fish className="w-4 h-4 md:w-5 md:h-5 text-[#ffab40]" />
                  <div>
                    <p className="text-[8px] md:text-[10px] text-[#c4c7c5] uppercase tracking-wider font-medium">
                      Fish
                    </p>
                    <p className="text-base md:text-lg font-bold text-white">
                      {fishFreed}/{currentLevel.fishCount}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="absolute top-4 left-4 md:top-6 md:left-6 z-40">
              <div className="bg-[#003d5c]/90 p-3 md:p-5 rounded-[20px] md:rounded-[28px] border border-[#4fc3f7]/40 shadow-2xl flex items-center gap-2 md:gap-4 min-w-[140px] md:min-w-[180px] backdrop-blur-sm">
                <div className="bg-[#4fc3f7]/20 p-2 md:p-3 rounded-full">
                  <Trophy className="w-4 h-4 md:w-6 md:h-6 text-[#4fc3f7]" />
                </div>
                <div>
                  <p className="text-[10px] md:text-xs text-[#c4c7c5] uppercase tracking-wider font-medium">
                    Score
                  </p>
                  <p className="text-xl md:text-3xl font-bold text-white">
                    {score.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Combo Display */}
              {currentCombo > 0 && (
                <div
                  className={`mt-3 md:mt-4 bg-gradient-to-r from-[#ffab40] to-[#ff6b9d] p-3 md:p-4 rounded-[18px] md:rounded-[24px] border-2 border-white/30 shadow-2xl transition-all duration-300 ${
                    showComboText ? "animate-bounce scale-110" : "scale-100"
                  }`}
                >
                  <div className="flex items-center gap-2 md:gap-3">
                    <Zap className="w-4 h-4 md:w-5 md:h-5 text-white animate-pulse" />
                    <div>
                      <p className="text-[8px] md:text-[10px] text-white/80 uppercase tracking-widest font-bold">
                        Combo Chain
                      </p>
                      <p className="text-xl md:text-2xl font-black text-white">
                        {comboMultiplier}x
                      </p>
                    </div>
                  </div>
                  {showComboText && (
                    <div className="mt-2 text-center">
                      <p className="text-[10px] md:text-xs font-black text-white animate-pulse">
                        {comboMultiplier >= 5
                          ? "🔥 LEGENDARY!"
                          : comboMultiplier >= 4
                          ? "⚡ AMAZING!"
                          : comboMultiplier >= 3
                          ? "💥 GREAT!"
                          : "✨ NICE!"}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="absolute bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-40">
              <div
                className={`bg-[#003d5c]/30 backdrop-blur-md px-4 md:px-8 py-3 md:py-5 rounded-[24px] md:rounded-[32px] border border-[#4fc3f7]/30 shadow-2xl flex items-center gap-4 md:gap-6 transition-opacity duration-300 ${
                  isGameOver ? "opacity-20 pointer-events-none" : "opacity-100"
                }`}
              >
                <p className="text-[10px] md:text-xs text-[#c4c7c5] uppercase font-bold tracking-wider hidden sm:block">
                  Choose
                </p>
                {colorPair.map((color) => {
                  const isSelected = selectedColor === color;
                  const isHovered = hoveredColor === color;
                  const config = COLOR_CONFIG[color];
                  return (
                    <button
                      key={color}
                      data-color-button={color}
                      onClick={() => handleColorSelect(color)}
                      className={`relative w-12 h-12 md:w-16 md:h-16 rounded-full transition-all duration-200 transform flex items-center justify-center 
                              ${
                                isSelected
                                  ? "scale-125 ring-4 md:ring-[6px] ring-white/80 z-10"
                                  : isHovered
                                  ? "scale-115 ring-3 md:ring-[5px] ring-[#4fc3f7]/80 z-[5]"
                                  : "hover:scale-110 opacity-60"
                              }`}
                      style={{
                        background: `radial-gradient(circle at 35% 35%, ${
                          config.hex
                        }, ${adjustColor(config.hex, -60)})`,
                        boxShadow: isSelected
                          ? `0 0 30px ${config.hex}, inset 0 -5px 5px rgba(0,0,0,0.3)`
                          : isHovered
                          ? `0 0 20px ${config.hex}, inset 0 -4px 4px rgba(0,0,0,0.3)`
                          : "0 4px 6px rgba(0,0,0,0.3), inset 0 -4px 4px rgba(0,0,0,0.3)",
                      }}
                    >
                      <div className="absolute top-1 left-2 md:top-2 md:left-3 w-4 h-2 md:w-5 md:h-2 bg-white/50 rounded-full transform -rotate-45 filter blur-[1px]" />

                      {isSelected && (
                        <MousePointerClick className="w-5 h-5 md:w-7 md:h-7 text-white/90 drop-shadow-md" />
                      )}
                      {!isSelected && isHovered && (
                        <div className="flex items-center justify-center">
                          <div className="w-3 h-3 md:w-4 md:h-4 bg-[#4fc3f7] rounded-full animate-ping absolute" />
                          <div className="w-3 h-3 md:w-4 md:h-4 bg-[#4fc3f7] rounded-full" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {!isPinching.current && !isFlying.current && !isGameOver && (
              <div className="absolute bottom-20 md:bottom-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none opacity-50">
                <div className="flex items-center gap-2 bg-[#003d5c]/90 px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-[#4fc3f7]/40 backdrop-blur-sm">
                  <Play className="w-3 h-3 text-[#4fc3f7] fill-current" />
                  <p className="text-[#e3e3e3] text-[10px] md:text-xs font-medium">
                    Pinch & Pull to Shoot
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OceanBubbles;

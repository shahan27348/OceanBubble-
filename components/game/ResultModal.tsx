/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import {
  ChevronRight,
  Crown,
  Fish,
  Flame,
  Home,
  RefreshCw,
  Star,
  Target,
  Trophy,
  Waves,
} from "lucide-react";
import { RoundResult } from "../../types";
import { FISH_SPECIES } from "../../gameConfig";
import { GestureButton } from "../ui/GestureControl";

interface ResultModalProps {
  result: RoundResult;
  hasNextLevel: boolean;
  onRetry: () => void;
  onNextLevel: () => void;
  onHome: () => void;
}

export const ResultModal: React.FC<ResultModalProps> = ({
  result,
  hasNextLevel,
  onRetry,
  onNextLevel,
  onHome,
}) => {
  const victory = result.outcome === "victory";
  // Stars land one at a time so the award reads as an event, not a static score.
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!victory || result.stars === 0) return;
    const timers = Array.from({ length: result.stars }, (_, i) =>
      setTimeout(() => setRevealed(i + 1), 380 + i * 260)
    );
    return () => timers.forEach(clearTimeout);
  }, [victory, result.stars]);

  const accent = victory ? "#26c6da" : "#ff6b9d";
  const species = result.levelId ? FISH_SPECIES[result.levelId] : null;

  return (
    <div className="absolute inset-0 z-[70] grid place-items-center bg-abyss-950/80 p-6 backdrop-blur-xl">
      <div
        className="glass-solid animate-pop-in w-full max-w-md overflow-hidden rounded-5xl"
        style={{ borderColor: `${accent}55`, boxShadow: `0 30px 90px ${accent}22` }}
      >
        {/* --------------------------------------------------------- Banner */}
        <div
          className="relative px-8 pb-6 pt-8 text-center"
          style={{ background: `linear-gradient(180deg, ${accent}22, transparent)` }}
        >
          <div
            className="mx-auto mb-4 grid place-items-center rounded-full"
            style={{ background: `${accent}25`, width: 72, height: 72 }}
          >
            {victory ? (
              <Trophy className="h-9 w-9" style={{ color: accent }} />
            ) : (
              <Waves className="h-9 w-9" style={{ color: accent }} />
            )}
          </div>

          <h2 className="display text-3xl text-white">
            {victory ? "Depth Cleared" : "Dive Over"}
          </h2>
          <p className="mt-2 text-sm text-white/55">
            {victory
              ? species
                ? `Every ${species.name} made it home safely.`
                : "Every trapped fish made it home safely."
              : result.fishTarget > 0
              ? `${result.fishFreed} of ${result.fishTarget} fish rescued — the reef held out.`
              : "The bubbles reached the surface."}
          </p>

          {victory && result.fishTarget > 0 && (
            <div className="mt-5 flex justify-center gap-3">
              {[1, 2, 3].map((s) => (
                <Star
                  key={s}
                  className="h-9 w-9 transition-all duration-500"
                  style={{
                    color: s <= revealed ? "#ffd54f" : "rgba(255,255,255,0.12)",
                    fill: s <= revealed ? "#ffd54f" : "transparent",
                    transform: s <= revealed ? "scale(1)" : "scale(0.65)",
                    filter: s <= revealed ? "drop-shadow(0 0 12px #ffd54f)" : "none",
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ---------------------------------------------------- Score panel */}
        <div className="px-8">
          <div className="rounded-4xl bg-black/30 p-5 text-center">
            <p className="eyebrow">Final score</p>
            <p className="numeric mt-1 text-5xl text-white">
              {result.score.toLocaleString()}
            </p>
            {result.isNewHighScore && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-glow-pearl/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-glow-pearl">
                <Crown className="h-3 w-3" />
                New personal best
              </p>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Metric
              icon={<Fish className="h-3.5 w-3.5" />}
              label="Fish"
              value={result.fishTarget > 0 ? `${result.fishFreed}/${result.fishTarget}` : `${result.fishFreed}`}
              accent="#ffab40"
            />
            <Metric
              icon={<Target className="h-3.5 w-3.5" />}
              label="Shots"
              value={`${result.ballsUsed}`}
              accent="#4fc3f7"
            />
            <Metric
              icon={<Flame className="h-3.5 w-3.5" />}
              label="Best combo"
              value={`${result.bestCombo}×`}
              accent="#ff6b9d"
            />
          </div>
        </div>

        {/* -------------------------------------------------------- Actions */}
        <div className="flex flex-col gap-2.5 p-8 pt-6">
          {victory && hasNextLevel && (
            <GestureButton
              id="result:next"
              onActivate={onNextLevel}
              className="flex w-full items-center justify-center gap-2 rounded-3xl py-4 font-bold text-white"
              style={{ background: "linear-gradient(110deg, #26c6da, #4fc3f7)" }}
            >
              Descend deeper
              <ChevronRight className="h-5 w-5" />
            </GestureButton>
          )}

          <div className="flex gap-2.5">
            <GestureButton
              id="result:retry"
              onActivate={onRetry}
              className="glass flex flex-1 items-center justify-center gap-2 rounded-3xl py-3.5 text-sm font-bold text-white"
            >
              <RefreshCw className="h-4 w-4" />
              {victory ? "Replay" : "Try again"}
            </GestureButton>
            <GestureButton
              id="result:home"
              onActivate={onHome}
              className="glass flex flex-1 items-center justify-center gap-2 rounded-3xl py-3.5 text-sm font-bold text-white"
            >
              <Home className="h-4 w-4" />
              Home
            </GestureButton>
          </div>
        </div>
      </div>
    </div>
  );
};

const Metric: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}> = ({ icon, label, value, accent }) => (
  <div className="rounded-3xl bg-black/25 p-3 text-center">
    <div className="mb-1 flex items-center justify-center" style={{ color: accent }}>
      {icon}
    </div>
    <p className="numeric text-sm text-white">{value}</p>
    <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-white/40">
      {label}
    </p>
  </div>
);

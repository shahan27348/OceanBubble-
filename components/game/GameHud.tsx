/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Crown, Fish, Flame, Infinity as InfinityIcon, Target, Trophy } from "lucide-react";
import { BubbleColor, LevelConfig } from "../../types";
import { COLOR_CONFIG, adjustColor } from "../../gameConfig";
import { GlassPanel, StatBlock } from "../ui/GlassPanel";
import { GestureButton } from "../ui/GestureControl";

/* ---------------------------------------------------------------- Score card */

export const ScoreCard: React.FC<{ score: number; highScore: number }> = ({
  score,
  highScore,
}) => (
  <GlassPanel className="px-4 py-3" data-testid="score" data-score={score}>
    <StatBlock
      label="Score"
      value={score.toLocaleString()}
      icon={<Trophy className="h-5 w-5" />}
    />
    {highScore > 0 && (
      <div className="mt-2 flex items-center gap-1.5 border-t border-white/10 pt-2">
        <Crown className="h-3 w-3 text-glow-pearl" />
        <span className="text-[10px] font-semibold text-white/50">
          Best {highScore.toLocaleString()}
        </span>
      </div>
    )}
  </GlassPanel>
);

/* -------------------------------------------------------------- Combo badge */

export const ComboBadge: React.FC<{ combo: number; multiplier: number; flash: boolean }> = ({
  combo,
  multiplier,
  flash,
}) => {
  if (combo <= 0) return null;

  const tier =
    multiplier >= 5
      ? { label: "Legendary", from: "#ff6b9d", to: "#ffab40" }
      : multiplier >= 4
      ? { label: "Amazing", from: "#ffab40", to: "#ffd54f" }
      : multiplier >= 3
      ? { label: "Great", from: "#26c6da", to: "#4fc3f7" }
      : { label: "Nice", from: "#4fc3f7", to: "#7e57c2" };

  return (
    <div
      className={`animate-pop-in rounded-3xl px-4 py-3 shadow-glow-md transition-transform duration-300 ${
        flash ? "scale-105" : "scale-100"
      }`}
      style={{ background: `linear-gradient(120deg, ${tier.from}, ${tier.to})` }}
    >
      <div className="flex items-center gap-3">
        <Flame className="h-5 w-5 text-white" />
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/80">
            {tier.label}
          </p>
          <p className="numeric text-2xl leading-none text-white">{multiplier}×</p>
        </div>
      </div>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: step <= multiplier ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.25)" }}
          />
        ))}
      </div>
    </div>
  );
};

/* ----------------------------------------------------------- Objective card */

export const ObjectiveCard: React.FC<{
  level: LevelConfig | null;
  fishFreed: number;
}> = ({ level, fishFreed }) => {
  if (!level) {
    return (
      <GlassPanel className="px-5 py-2.5">
        <div className="flex items-center gap-2">
          <InfinityIcon className="h-4 w-4 text-glow-cyan" />
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/80">
            Endless Dive
          </p>
        </div>
      </GlassPanel>
    );
  }

  const pct = Math.min(100, (fishFreed / level.fishCount) * 100);

  return (
    <GlassPanel className="w-56 px-4 py-2.5" glowColor={level.biome}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-xs font-bold uppercase tracking-[0.16em] text-white">
          {level.name}
        </p>
        <span className="numeric shrink-0 text-xs" style={{ color: level.biome }}>
          {level.depth}m
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Fish className="h-3.5 w-3.5 shrink-0 text-glow-star" />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, #ffab40, #ffd54f)` }}
          />
        </div>
        <span className="numeric shrink-0 text-[11px] text-white/80">
          {fishFreed}/{level.fishCount}
        </span>
      </div>
    </GlassPanel>
  );
};

/* ---------------------------------------------------------------- Ammo gauge */

export const AmmoGauge: React.FC<{ remaining: number; limit: number | null }> = ({
  remaining,
  limit,
}) => {
  if (limit === null) return null;

  const low = remaining <= 3;
  // Beyond a dozen the dots stop being countable, so switch to a numeral.
  const asDots = limit <= 12;

  return (
    <GlassPanel
      className="px-4 py-2.5"
      data-testid="ammo"
      data-remaining={remaining}
      aria-label={`${remaining} of ${limit} shots left`}
      role="status"
    >
      <div className="flex items-center gap-3">
        <Target className={`h-4 w-4 ${low ? "text-glow-coral" : "text-glow-cyan"}`} />
        {asDots ? (
          <div className="flex gap-1.5">
            {Array.from({ length: limit }, (_, i) => (
              <span
                key={i}
                className="h-2.5 w-2.5 rounded-full transition-all duration-300"
                style={{
                  background: i < remaining ? "#4fc3f7" : "rgba(255,255,255,0.14)",
                  boxShadow: i < remaining ? "0 0 8px rgba(79,195,247,0.7)" : "none",
                }}
              />
            ))}
          </div>
        ) : (
          <p className={`numeric text-lg ${low ? "text-glow-coral" : "text-white"}`}>
            {remaining}
            <span className="text-xs text-white/40"> / {limit}</span>
          </p>
        )}
      </div>
    </GlassPanel>
  );
};

/* -------------------------------------------------------------- Depth gauge */

export const DangerGauge: React.FC<{ pressure: number }> = ({ pressure }) => {
  const pct = Math.round(Math.max(0, Math.min(1, pressure)) * 100);
  const critical = pressure > 0.75;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="glass relative h-40 w-3 overflow-hidden rounded-full md:h-52">
        <div
          className="absolute bottom-0 left-0 w-full rounded-full transition-all duration-500 ease-out"
          style={{
            height: `${pct}%`,
            background: critical
              ? "linear-gradient(180deg, #ff6b9d, #ff1744)"
              : "linear-gradient(180deg, #4fc3f7, #26c6da)",
            boxShadow: critical ? "0 0 16px rgba(255,23,68,0.7)" : "0 0 12px rgba(79,195,247,0.5)",
          }}
        />
      </div>
      <p
        className={`eyebrow ${critical ? "animate-pulse" : ""}`}
        style={{ color: critical ? "#ff6b9d" : undefined, writingMode: "vertical-rl" }}
      >
        {critical ? "Danger" : "Depth"}
      </p>
    </div>
  );
};

/* ------------------------------------------------------------ Color chooser */

export const ColorSelector: React.FC<{
  pair: [BubbleColor, BubbleColor];
  selected: BubbleColor;
  nextColor: BubbleColor;
  showSymbols: boolean;
  onSelect: (color: BubbleColor) => void;
  disabled?: boolean;
}> = ({ pair, selected, nextColor, showSymbols, onSelect, disabled = false }) => (
  <GlassPanel
    className={`flex items-center gap-4 px-4 py-3 transition-opacity duration-300 md:gap-5 md:px-6 ${
      disabled ? "pointer-events-none opacity-30" : "opacity-100"
    }`}
  >
    <div className="hidden sm:block">
      <p className="eyebrow">Load</p>
      <p className="text-[11px] font-semibold text-white/80">
        {COLOR_CONFIG[selected].label}
      </p>
      <p className="numeric text-[10px] text-glow-cyan">
        {COLOR_CONFIG[selected].points} pts
      </p>
    </div>

    <div className="flex items-center gap-3 md:gap-4">
      {pair.map((color, index) => {
        const config = COLOR_CONFIG[color];
        const isSelected = selected === color;
        return (
          <GestureButton
            key={`${color}-${index}`}
            id={`color:${index}`}
            onActivate={() => onSelect(color)}
            aria-label={`Load ${config.label}`}
            aria-pressed={isSelected}
            className={`grid h-14 w-14 place-items-center rounded-full md:h-16 md:w-16 ${
              isSelected ? "scale-110" : "scale-95 opacity-60 hover:scale-100 hover:opacity-90"
            }`}
            activeClassName="scale-110 opacity-100"
            style={{
              background: `radial-gradient(circle at 34% 30%, ${config.hex}, ${adjustColor(
                config.hex,
                -70
              )})`,
              boxShadow: isSelected
                ? `0 0 26px ${config.hex}, inset 0 -6px 8px rgba(0,0,0,0.35)`
                : `0 4px 10px rgba(0,0,0,0.4), inset 0 -5px 6px rgba(0,0,0,0.35)`,
              outline: isSelected ? "3px solid rgba(255,255,255,0.85)" : "none",
              outlineOffset: 3,
            }}
          >
            <span className="pointer-events-none absolute left-2.5 top-2 h-2 w-4 -rotate-45 rounded-full bg-white/55 blur-[1px]" />
            {showSymbols && (
              <span className="pointer-events-none text-lg font-black text-white/85 drop-shadow">
                {config.symbol}
              </span>
            )}
          </GestureButton>
        );
      })}
    </div>

    <div className="flex items-center gap-2 border-l border-white/10 pl-3 md:pl-4">
      <div>
        <p className="eyebrow">Next</p>
        <div
          className="mt-1 h-6 w-6 rounded-full"
          style={{
            background: `radial-gradient(circle at 34% 30%, ${COLOR_CONFIG[nextColor].hex}, ${adjustColor(
              COLOR_CONFIG[nextColor].hex,
              -70
            )})`,
          }}
        />
      </div>
    </div>
  </GlassPanel>
);

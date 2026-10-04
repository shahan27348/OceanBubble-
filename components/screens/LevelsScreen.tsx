/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ArrowLeft, Crown, Fish, Lock, Play, Star, Target } from "lucide-react";
import { LevelConfig, LevelProgress } from "../../types";
import { FISH_SPECIES, LEVELS } from "../../gameConfig";
import { GlassPanel } from "../ui/GlassPanel";
import { GestureButton } from "../ui/GestureControl";

interface LevelsScreenProps {
  progress: Record<number, LevelProgress>;
  onBack: () => void;
  onSelect: (level: LevelConfig) => void;
}

/**
 * Rendered as a descent rather than a grid: levels alternate down either side of
 * a dive line, with the depth ruler reinforcing that later levels are deeper.
 */
export const LevelsScreen: React.FC<LevelsScreenProps> = ({
  progress,
  onBack,
  onSelect,
}) => {
  const totalStars = LEVELS.reduce((sum, level) => sum + (progress[level.id]?.stars ?? 0), 0);

  return (
    <div className="thin-scroll relative z-20 h-full overflow-y-auto">
      {/* Sticky header keeps Back reachable while scrolling deep. */}
      <div className="sticky top-0 z-30 border-b border-white/5 bg-abyss-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <GestureButton
            id="nav:back"
            aria-label="Back"
            onActivate={onBack}
            className="glass grid h-11 w-11 place-items-center rounded-2xl"
          >
            <ArrowLeft className="h-5 w-5 text-glow-cyan" />
          </GestureButton>

          <div className="flex-1">
            <p className="eyebrow">Expedition</p>
            <h2 className="display text-2xl text-white">Choose your depth</h2>
          </div>

          <div className="glass flex items-center gap-2 rounded-2xl px-4 py-2.5">
            <Star className="h-4 w-4 fill-current text-glow-pearl" />
            <span className="numeric text-sm text-white">{totalStars}</span>
            <span className="text-xs text-white/40">/ {LEVELS.length * 3}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-16 pt-8">
        <p className="eyebrow mb-6 text-center">Surface · 0m</p>

        <div className="relative">
          {/* The dive line threading the nodes together. */}
          <div
            className="absolute bottom-0 left-6 top-0 w-px md:left-1/2 md:-translate-x-1/2"
            style={{
              background:
                "linear-gradient(180deg, rgba(79,195,247,0.5), rgba(126,87,194,0.4) 55%, rgba(255,107,157,0.35))",
            }}
          />

          <div className="space-y-5">
            {LEVELS.map((level, index) => {
              const state = progress[level.id] ?? {
                unlocked: index === 0,
                stars: 0,
                bestScore: 0,
              };
              const onLeft = index % 2 === 0;

              return (
                <div
                  key={level.id}
                  className={`relative flex items-center gap-4 pl-16 md:gap-6 md:pl-0 ${
                    onLeft ? "md:pr-[52%]" : "md:flex-row-reverse md:pl-[52%]"
                  }`}
                >
                  {/* Node marker on the dive line */}
                  <div className="absolute left-6 -translate-x-1/2 md:left-1/2">
                    <div
                      className="grid h-11 w-11 place-items-center rounded-full border-2 text-xs font-black transition-all"
                      style={{
                        borderColor: state.unlocked ? level.biome : "rgba(255,255,255,0.12)",
                        background: state.unlocked ? `${level.biome}25` : "rgba(4,18,31,0.9)",
                        color: state.unlocked ? level.biome : "rgba(255,255,255,0.25)",
                        boxShadow: state.unlocked ? `0 0 20px ${level.biome}55` : "none",
                      }}
                    >
                      {state.unlocked ? level.id : <Lock className="h-4 w-4" />}
                    </div>
                  </div>

                  <LevelCard
                    level={level}
                    state={state}
                    onSelect={() => onSelect(level)}
                    align={onLeft ? "left" : "right"}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <p className="eyebrow mt-8 text-center text-glow-coral/70">
          Seafloor · 1000m
        </p>
      </div>
    </div>
  );
};

/* --------------------------------------------------------------- Level card */

const LevelCard: React.FC<{
  level: LevelConfig;
  state: LevelProgress;
  onSelect: () => void;
  align: "left" | "right";
}> = ({ level, state, onSelect, align }) => {
  const species = FISH_SPECIES[level.id];
  const locked = !state.unlocked;

  return (
    <GestureButton
      id={`level:${level.id}`}
      onActivate={onSelect}
      disabled={locked}
      className={`w-full overflow-hidden rounded-4xl text-left ${
        locked ? "opacity-45" : "hover:scale-[1.02]"
      }`}
      activeClassName="scale-[1.02] ring-2 ring-white/70"
    >
      <GlassPanel
        tone={locked ? "glass" : "solid"}
        glowColor={locked ? undefined : level.biome}
        className="p-5"
      >
        <div className={`flex items-start gap-4 ${align === "right" ? "md:flex-row-reverse md:text-right" : ""}`}>
          <div
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl"
            style={{ background: `${level.biome}1f` }}
          >
            {locked ? <Lock className="h-5 w-5 text-white/30" /> : species?.emoji ?? "🐠"}
          </div>

          <div className="min-w-0 flex-1">
            <div className={`flex items-baseline gap-2 ${align === "right" ? "md:justify-end" : ""}`}>
              <h3 className="display truncate text-lg text-white">{level.name}</h3>
              <span className="numeric shrink-0 text-xs" style={{ color: level.biome }}>
                {level.depth}m
              </span>
            </div>

            <div className={`mt-2 flex flex-wrap items-center gap-3 ${align === "right" ? "md:justify-end" : ""}`}>
              <Chip icon={<Fish className="h-3 w-3" />} text={`${level.fishCount} fish`} accent="#ffab40" />
              <Chip icon={<Target className="h-3 w-3" />} text={`${level.ballsLimit} shots`} accent="#4fc3f7" />
              {state.bestScore > 0 && (
                <Chip
                  icon={<Crown className="h-3 w-3" />}
                  text={state.bestScore.toLocaleString()}
                  accent="#ffd54f"
                />
              )}
            </div>

            <div className={`mt-3 flex items-center gap-3 ${align === "right" ? "md:justify-end" : ""}`}>
              <div className="flex gap-1">
                {[1, 2, 3].map((s) => (
                  <Star
                    key={s}
                    className={`h-4 w-4 ${
                      s <= state.stars ? "fill-current text-glow-pearl" : "text-white/15"
                    }`}
                  />
                ))}
              </div>
              {!locked && (
                <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: level.biome }}>
                  <Play className="h-3 w-3 fill-current" />
                  Dive
                </span>
              )}
            </div>
          </div>
        </div>
      </GlassPanel>
    </GestureButton>
  );
};

const Chip: React.FC<{ icon: React.ReactNode; text: string; accent: string }> = ({
  icon,
  text,
  accent,
}) => (
  <span
    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold"
    style={{ background: `${accent}18`, color: accent }}
  >
    {icon}
    {text}
  </span>
);

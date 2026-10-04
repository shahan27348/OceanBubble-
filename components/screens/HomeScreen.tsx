/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import {
  ChevronRight,
  Crown,
  Fish,
  Hand,
  Map as MapIcon,
  Play,
  Settings as SettingsIcon,
  Sparkles,
  Waves,
} from "lucide-react";
import { SavedState } from "../../types";
import { FISH_SPECIES, LEVELS } from "../../gameConfig";
import { GlassPanel } from "../ui/GlassPanel";
import { GestureButton } from "../ui/GestureControl";

interface HomeScreenProps {
  saved: SavedState;
  onQuickStart: () => void;
  onLevels: () => void;
  onSettings: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  saved,
  onQuickStart,
  onLevels,
  onSettings,
}) => {
  const { levelsCleared, totalStars } = useMemo(() => {
    let cleared = 0;
    let stars = 0;
    for (const level of LEVELS) {
      const entry = saved.progress[level.id];
      if (!entry) continue;
      if (entry.stars > 0) cleared += 1;
      stars += entry.stars;
    }
    return { levelsCleared: cleared, totalStars: stars };
  }, [saved.progress]);

  const collected = useMemo(
    () =>
      LEVELS.map((level) => ({
        levelId: level.id,
        count: saved.aquarium[level.id] ?? 0,
        species: FISH_SPECIES[level.id] ?? { emoji: "🐠", name: "Reef Fish" },
      })).filter((entry) => entry.count > 0),
    [saved.aquarium]
  );

  return (
    <div className="thin-scroll relative z-20 h-full overflow-y-auto">
      <div className="mx-auto grid min-h-full max-w-6xl items-center gap-8 px-6 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-10">
        {/* ------------------------------------------------------------ Hero */}
        <div className="animate-pop-in">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-glow-cyan/25 bg-glow-cyan/10 px-3.5 py-1.5">
            <Hand className="h-3.5 w-3.5 text-glow-cyan" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-glow-cyan">
              Gesture controlled
            </span>
          </div>

          <h1 className="display text-6xl sm:text-7xl lg:text-8xl">
            <span className="text-gradient-tide">Ocean</span>
            <br />
            <span className="text-white">Bubbles</span>
          </h1>

          <p className="mt-5 max-w-md text-base leading-relaxed text-white/60">
            Pinch the water, pull back, and let go. Sink the reef, chain the combos,
            and set every trapped fish free — no controller, just your hands.
          </p>

          <div className="mt-8 flex max-w-md flex-col gap-3">
            <PrimaryAction
              id="menu:quickstart"
              onActivate={onQuickStart}
              icon={<Play className="h-5 w-5 fill-current" />}
              title="Quick Dive"
              subtitle="Endless reef — survive as long as you can"
              gradient="linear-gradient(110deg, #4fc3f7, #26c6da)"
            />
            <PrimaryAction
              id="menu:levels"
              onActivate={onLevels}
              icon={<MapIcon className="h-5 w-5" />}
              title="Expedition"
              subtitle={`Descend 10 depths · ${totalStars}/30 stars earned`}
              gradient="linear-gradient(110deg, #7e57c2, #4fc3f7)"
            />
            <PrimaryAction
              id="menu:settings"
              onActivate={onSettings}
              icon={<SettingsIcon className="h-5 w-5" />}
              title="Settings"
              subtitle="Calibration, audio and accessibility"
              gradient="linear-gradient(110deg, #ffab40, #ff6b9d)"
            />
          </div>
        </div>

        {/* -------------------------------------------------- Side: aquarium */}
        <div className="flex flex-col gap-4">
          <GlassPanel className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4">
              <div className="flex items-center gap-2">
                <Fish className="h-4 w-4 text-glow-star" />
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/85">
                  Your Aquarium
                </p>
              </div>
              <span className="numeric text-sm text-glow-star">
                {saved.totalFishRescued}
              </span>
            </div>

            {/* Rescued fish drift across a mini tank. */}
            <div className="relative mt-3 h-36 overflow-hidden border-y border-white/5 bg-gradient-to-b from-abyss-700/50 to-abyss-900/70">
              {collected.length === 0 ? (
                <div className="grid h-full place-items-center px-6 text-center">
                  <div>
                    <Waves className="mx-auto mb-2 h-6 w-6 text-white/20" />
                    <p className="text-xs text-white/40">
                      Empty for now. Rescue fish in Expedition mode and they will
                      live here.
                    </p>
                  </div>
                </div>
              ) : (
                collected.slice(0, 10).map((entry, i) => (
                  <span
                    key={entry.levelId}
                    className="absolute animate-sway text-2xl"
                    title={`${entry.species.name} ×${entry.count}`}
                    style={{
                      left: `${8 + ((i * 37) % 80)}%`,
                      top: `${14 + ((i * 29) % 60)}%`,
                      animationDelay: `${i * 0.42}s`,
                      animationDuration: `${4 + (i % 4)}s`,
                    }}
                  >
                    {entry.species.emoji}
                  </span>
                ))
              )}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(79,195,247,0.16),transparent_65%)]" />
            </div>

            <div className="grid grid-cols-3 divide-x divide-white/5">
              <MiniStat
                icon={<Crown className="h-3.5 w-3.5 text-glow-pearl" />}
                label="Best"
                value={saved.highScore.toLocaleString()}
              />
              <MiniStat
                icon={<Sparkles className="h-3.5 w-3.5 text-glow-cyan" />}
                label="Cleared"
                value={`${levelsCleared}/${LEVELS.length}`}
              />
              <MiniStat
                icon={<Fish className="h-3.5 w-3.5 text-glow-star" />}
                label="Species"
                value={`${collected.length}/${LEVELS.length}`}
              />
            </div>
          </GlassPanel>

          {/* ------------------------------------------------- How to play */}
          <GlassPanel className="px-5 py-4">
            <p className="eyebrow mb-3">How to play</p>
            <ol className="space-y-3">
              {[
                { step: "Pinch", text: "Touch thumb to index finger near the bubble." },
                { step: "Pull", text: "Drag back and down to load the slingshot." },
                { step: "Release", text: "Open your fingers to fire along the arc." },
                { step: "Match", text: "Group 3 or more to pop and free the fish." },
              ].map((row, i) => (
                <li key={row.step} className="flex gap-3">
                  <span className="numeric grid h-6 w-6 shrink-0 place-items-center rounded-full bg-glow-cyan/15 text-[11px] text-glow-cyan">
                    {i + 1}
                  </span>
                  <p className="text-xs leading-relaxed text-white/55">
                    <span className="font-bold text-white/90">{row.step}.</span> {row.text}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-4 rounded-2xl bg-black/25 px-3 py-2 text-[11px] leading-relaxed text-white/45">
              No webcam? Everything here works with a mouse or touch too.
            </p>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ Helpers */

const PrimaryAction: React.FC<{
  id: string;
  onActivate: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  gradient: string;
}> = ({ id, onActivate, icon, title, subtitle, gradient }) => (
  <GestureButton
    id={id}
    onActivate={onActivate}
    className="group w-full overflow-hidden rounded-3xl text-left"
    activeClassName="scale-[1.02] ring-2 ring-white/70"
    style={{ background: gradient }}
  >
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-black/20 text-white">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="display text-lg text-white">{title}</p>
        <p className="truncate text-[11px] font-medium text-white/70">{subtitle}</p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-white/70 transition-transform group-hover:translate-x-1" />
    </div>
  </GestureButton>
);

const MiniStat: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <div className="px-3 py-3 text-center">
    <div className="mb-1 flex items-center justify-center gap-1.5">
      {icon}
      <span className="eyebrow">{label}</span>
    </div>
    <p className="numeric text-sm text-white">{value}</p>
  </div>
);

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";

interface OceanBackdropProps {
  /** 0 = surface, 1 = deepest. Darkens and cools the gradient as you descend. */
  depth?: number;
  accent?: string;
  bubbleCount?: number;
  showShafts?: boolean;
}

/**
 * Layered underwater environment: depth gradient, god rays, caustic light,
 * rising bubbles and a vignette. Purely decorative and pointer-transparent.
 */
export const OceanBackdrop: React.FC<OceanBackdropProps> = ({
  depth = 0.35,
  accent = "#4fc3f7",
  bubbleCount = 18,
  showShafts = true,
}) => {
  // Randomised once per mount so the field does not reshuffle on every render.
  const bubbles = useMemo(
    () =>
      Array.from({ length: bubbleCount }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 8 + Math.random() * 42,
        duration: 13 + Math.random() * 14,
        delay: -Math.random() * 22,
        opacity: 0.25 + Math.random() * 0.45,
      })),
    [bubbleCount]
  );

  const t = Math.max(0, Math.min(1, depth));
  const top = mix([12, 60, 96], [2, 22, 44], t);
  const mid = mix([7, 40, 70], [1, 12, 26], t);
  const bottom = mix([3, 20, 38], [0, 5, 12], t);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgb(${top}) 0%, rgb(${mid}) 46%, rgb(${bottom}) 100%)`,
        }}
      />

      {showShafts && <div className="light-shafts animate-drift" />}
      <div className="caustics animate-caustic" />

      {/* Broad accent bloom tying the backdrop to the current biome. */}
      <div
        className="absolute -top-1/4 left-1/2 h-[70vh] w-[85vw] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: `${accent}14` }}
      />

      {bubbles.map((b) => (
        <span
          key={b.id}
          className="rising-bubble animate-rise"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.size,
            opacity: b.opacity,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}

      <div className="vignette" />
    </div>
  );
};

/** Interpolates between two RGB triples and returns an "r, g, b" string. */
function mix(a: number[], b: number[], t: number) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(", ");
}

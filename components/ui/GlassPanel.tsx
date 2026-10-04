/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

type Tone = "glass" | "solid";

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  glowColor?: string;
  children?: React.ReactNode;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({
  tone = "glass",
  glowColor,
  className = "",
  style,
  children,
  ...rest
}) => (
  <div
    className={`${tone === "glass" ? "glass" : "glass-solid"} rounded-4xl ${className}`}
    style={{
      ...(glowColor ? { borderColor: `${glowColor}55`, boxShadow: `0 0 34px ${glowColor}22` } : null),
      ...style,
    }}
    {...rest}
  >
    {children}
  </div>
);

/** Small label + value pair used across the HUD and result screens. */
export const StatBlock: React.FC<{
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  accent?: string;
  className?: string;
}> = ({ label, value, icon, accent = "#4fc3f7", className = "" }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    {icon && (
      <div
        className="grid place-items-center rounded-2xl p-2.5"
        style={{ background: `${accent}1f`, color: accent }}
      >
        {icon}
      </div>
    )}
    <div className="min-w-0">
      <p className="eyebrow truncate">{label}</p>
      <p className="numeric text-xl leading-tight text-white md:text-2xl">{value}</p>
    </div>
  </div>
);

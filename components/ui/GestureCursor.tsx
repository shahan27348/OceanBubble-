/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Point } from "../../types";

interface GestureCursorProps {
  position: Point | null;
  isPinching: boolean;
  /** 0..1 progress of the pinch-and-hold confirmation. */
  dwellProgress: number;
  visible: boolean;
}

const SIZE = 68;
const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A single cursor shared by every screen. Dwell progress lives here rather than
 * on each button, so the feedback is always exactly where the player is looking.
 */
export const GestureCursor: React.FC<GestureCursorProps> = ({
  position,
  isPinching,
  dwellProgress,
  visible,
}) => {
  if (!position || !visible) return null;

  const accent = isPinching ? "#26c6da" : "#9be7ff";

  return (
    <div
      className="gesture-cursor"
      style={{
        transform: `translate3d(${position.x - SIZE / 2}px, ${position.y - SIZE / 2}px, 0)`,
        width: SIZE,
        height: SIZE,
      }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={2}
        />
        {dwellProgress > 0 && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={accent}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - dwellProgress)}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ filter: `drop-shadow(0 0 6px ${accent})` }}
          />
        )}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={isPinching ? 5 : 8}
          fill={accent}
          style={{ filter: `drop-shadow(0 0 8px ${accent})`, transition: "r 120ms ease-out" }}
        />
      </svg>
    </div>
  );
};

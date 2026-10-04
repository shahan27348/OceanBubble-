/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Hand, MousePointer2, VideoOff } from "lucide-react";
import { InputMode } from "../../types";

interface CameraPipProps {
  /** The tracking loop paints the mirrored camera frame and skeleton here. */
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
  /** 0..1 tracking confidence; 0 when no hand is in frame. */
  quality: number;
  handDetected: boolean;
  inputMode: InputMode;
  cameraEnabled: boolean;
  compact?: boolean;
}

export const PIP_W = 208;
export const PIP_H = 117;

/**
 * The webcam used to fill the screen at 70% opacity behind the board, which made
 * both the video and the bubbles hard to read. Demoting it to a corner preview
 * keeps the tracking feedback while giving the play area a clean backdrop.
 */
export const CameraPip: React.FC<CameraPipProps> = ({
  overlayRef,
  quality,
  handDetected,
  inputMode,
  cameraEnabled,
  compact = false,
}) => {
  const status = !cameraEnabled
    ? { label: "Camera off", tone: "#94a3b8", Icon: VideoOff }
    : inputMode === "pointer"
    ? { label: "Mouse control", tone: "#ffab40", Icon: MousePointer2 }
    : handDetected
    ? { label: "Hand tracked", tone: "#26c6da", Icon: Hand }
    : { label: "Show your hand", tone: "#ff6b9d", Icon: Hand };

  return (
    <div
      className="glass overflow-hidden rounded-3xl"
      style={{ width: compact ? 150 : PIP_W }}
      data-testid="camera-pip"
    >
      <div
        className="relative bg-abyss-950"
        style={{ height: compact ? 84 : PIP_H }}
      >
        <canvas
          ref={overlayRef}
          width={PIP_W}
          height={PIP_H}
          className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${
            cameraEnabled ? "opacity-100" : "opacity-0"
          }`}
          aria-label="Camera preview with tracked hand"
        />

        {!cameraEnabled && (
          <div className="absolute inset-0 grid place-items-center">
            <VideoOff className="h-6 w-6 text-white/25" />
          </div>
        )}

        {/* Scanline sweep reads as "actively tracking". */}
        {cameraEnabled && handDetected && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="animate-shimmer-sweep h-full w-1/3 bg-gradient-to-r from-transparent via-glow-cyan/20 to-transparent" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2">
        <status.Icon className="h-3.5 w-3.5 shrink-0" style={{ color: status.tone }} />
        <p
          className="flex-1 truncate text-[10px] font-semibold"
          style={{ color: status.tone }}
        >
          {status.label}
        </p>
        <div className="h-1 w-10 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.round(quality * 100)}%`, background: status.tone }}
          />
        </div>
      </div>
    </div>
  );
};

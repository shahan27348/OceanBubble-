/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  Eye,
  Hand,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Video,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { GameSettings } from "../../types";
import { GESTURE } from "../../gameConfig";
import { PINCH_SENSITIVITY_RANGE } from "../../services/storageService";
import { GlassPanel } from "../ui/GlassPanel";
import { GestureButton } from "../ui/GestureControl";

interface SettingsScreenProps {
  settings: GameSettings;
  onChange: (patch: Partial<GameSettings>) => void;
  onBack: () => void;
  onResetProgress: () => void;
  /** Live pinch ratio so the sensitivity slider can be calibrated by feel. */
  livePinchRatio: number;
  handDetected: boolean;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  onChange,
  onBack,
  onResetProgress,
  livePinchRatio,
  handDetected,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);

  // An armed reset quietly disarms itself, so a stray second tap minutes
  // later can't wipe progress.
  useEffect(() => {
    if (!confirmReset) return;
    const timer = window.setTimeout(() => setConfirmReset(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmReset]);

  const threshold = GESTURE.pinchRatio * settings.pinchSensitivity;
  const pinchNow = livePinchRatio <= threshold;

  return (
    <div className="thin-scroll relative z-20 h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8 flex items-center gap-4">
          <GestureButton
            id="nav:back"
            aria-label="Back"
            onActivate={onBack}
            className="glass grid h-11 w-11 place-items-center rounded-2xl"
          >
            <ArrowLeft className="h-5 w-5 text-glow-cyan" />
          </GestureButton>
          <div>
            <p className="eyebrow">Preferences</p>
            <h2 className="display text-2xl text-white">Settings</h2>
          </div>
        </div>

        <div className="space-y-4">
          {/* ------------------------------------------------------- Audio */}
          <Section title="Audio" icon={<Volume2 className="h-4 w-4" />} accent="#4fc3f7">
            <SliderRow
              id="settings:volume"
              label="Master volume"
              value={settings.volume}
              display={`${Math.round(settings.volume * 100)}%`}
              onChange={(v) => onChange({ volume: v })}
              disabled={settings.muted}
            />
            <ToggleRow
              id="settings:muted"
              label="Mute everything"
              description="Silences effects and the ambient drone"
              checked={settings.muted}
              onChange={(v) => onChange({ muted: v })}
              icon={settings.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            />
          </Section>

          {/* ---------------------------------------------------- Tracking */}
          <Section title="Hand tracking" icon={<Hand className="h-4 w-4" />} accent="#26c6da">
            <div className="rounded-3xl bg-black/25 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold text-white/70">Pinch calibration</p>
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: !handDetected
                      ? "rgba(255,255,255,0.08)"
                      : pinchNow
                      ? "rgba(38,198,218,0.2)"
                      : "rgba(255,255,255,0.08)",
                    color: !handDetected ? "#94a3b8" : pinchNow ? "#26c6da" : "#94a3b8",
                  }}
                >
                  {!handDetected ? "No hand" : pinchNow ? "Pinch detected" : "Open"}
                </span>
              </div>

              {/* Live meter: the marker is your hand, the line is the trigger point. */}
              <div className="relative h-3 overflow-hidden rounded-full bg-abyss-950">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-100"
                  style={{
                    width: `${Math.min(100, livePinchRatio * 100)}%`,
                    background: pinchNow
                      ? "linear-gradient(90deg, #26c6da, #4fc3f7)"
                      : "rgba(255,255,255,0.18)",
                  }}
                />
                <div
                  className="absolute inset-y-0 w-0.5 bg-glow-coral"
                  style={{ left: `${Math.min(100, threshold * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-white/40">
                Raise sensitivity if pinches are missed, lower it if the slingshot
                fires on its own. The threshold scales with your hand size, so
                distance from the camera should not matter.
              </p>

              <div className="mt-3">
                <SliderRow
                  id="settings:sensitivity"
                  label="Sensitivity"
                  value={settings.pinchSensitivity}
                  min={PINCH_SENSITIVITY_RANGE.min}
                  max={PINCH_SENSITIVITY_RANGE.max}
                  step={0.05}
                  display={`${settings.pinchSensitivity.toFixed(2)}×`}
                  onChange={(v) => onChange({ pinchSensitivity: v })}
                />
              </div>
            </div>

            <ToggleRow
              id="settings:camera"
              label="Camera preview"
              description="Corner picture-in-picture with the hand skeleton"
              checked={settings.showCamera}
              onChange={(v) => onChange({ showCamera: v })}
              icon={<Video className="h-4 w-4" />}
            />
          </Section>

          {/* ---------------------------------------------------- Gameplay */}
          <Section title="Gameplay" icon={<Zap className="h-4 w-4" />} accent="#ffab40">
            <ToggleRow
              id="settings:trajectory"
              label="Trajectory preview"
              description="Show the predicted arc and landing spot while aiming"
              checked={settings.showTrajectory}
              onChange={(v) => onChange({ showTrajectory: v })}
              icon={<Sparkles className="h-4 w-4" />}
            />
          </Section>

          {/* ----------------------------------------------- Accessibility */}
          <Section title="Accessibility" icon={<Eye className="h-4 w-4" />} accent="#7e57c2">
            <ToggleRow
              id="settings:symbols"
              label="Shape symbols on bubbles"
              description="Adds a distinct glyph per colour so colour is not the only cue"
              checked={settings.colorBlindSymbols}
              onChange={(v) => onChange({ colorBlindSymbols: v })}
              icon={<Eye className="h-4 w-4" />}
            />
            <ToggleRow
              id="settings:motion"
              label="Reduce motion"
              description="Stops drifting bubbles, light shafts and caustics"
              checked={settings.reduceMotion}
              onChange={(v) => onChange({ reduceMotion: v })}
              icon={<RotateCcw className="h-4 w-4" />}
            />
          </Section>

          {/* -------------------------------------------------------- Data */}
          <Section title="Saved data" icon={<Trash2 className="h-4 w-4" />} accent="#ff6b9d">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-black/25 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white/85">Reset all progress</p>
                <p className="text-[11px] text-white/45">
                  Clears unlocked depths, stars, high score and your aquarium.
                </p>
              </div>
              <GestureButton
                id="settings:reset"
                onActivate={() => {
                  if (confirmReset) {
                    onResetProgress();
                    setConfirmReset(false);
                  } else {
                    setConfirmReset(true);
                  }
                }}
                className={`shrink-0 rounded-2xl px-4 py-2.5 text-xs font-bold transition-colors ${
                  confirmReset
                    ? "bg-glow-coral text-white"
                    : "border border-glow-coral/40 text-glow-coral hover:bg-glow-coral/10"
                }`}
              >
                {confirmReset ? "Confirm reset" : "Reset"}
              </GestureButton>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ Pieces  */

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  accent: string;
  children: React.ReactNode;
}> = ({ title, icon, accent, children }) => (
  <GlassPanel className="p-5">
    <div className="mb-4 flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: `${accent}1f`, color: accent }}>
        {icon}
      </span>
      <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-white/85">{title}</h3>
    </div>
    <div className="space-y-3">{children}</div>
  </GlassPanel>
);

const SliderRow: React.FC<{
  id: string;
  label: string;
  value: number;
  display: string;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}> = ({ id, label, value, display, onChange, min = 0, max = 1, step = 0.05, disabled }) => {
  // Snap to the step grid so repeated +/- presses don't accumulate float error.
  const nudge = (dir: 1 | -1) => {
    const next = Math.round((value + dir * step) / step) * step;
    onChange(Math.max(min, Math.min(max, Number(next.toFixed(4)))));
  };
  const inputId = `${id}-input`;

  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor={inputId} className="text-xs font-semibold text-white/70">
          {label}
        </label>
        <span className="numeric text-xs text-glow-cyan">{display}</span>
      </div>
      {/* +/- buttons make the slider usable by pinch, where dragging isn't. */}
      <div className="flex items-center gap-3">
        <GestureButton
          id={`${id}:down`}
          onActivate={() => nudge(-1)}
          disabled={disabled || value <= min}
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="glass grid h-9 w-9 shrink-0 place-items-center rounded-xl disabled:opacity-40"
        >
          <Minus className="h-4 w-4 text-glow-cyan" />
        </GestureButton>
        <input
          id={inputId}
          type="range"
          className="range-tide"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <GestureButton
          id={`${id}:up`}
          onActivate={() => nudge(1)}
          disabled={disabled || value >= max}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="glass grid h-9 w-9 shrink-0 place-items-center rounded-xl disabled:opacity-40"
        >
          <Plus className="h-4 w-4 text-glow-cyan" />
        </GestureButton>
      </div>
    </div>
  );
};

const ToggleRow: React.FC<{
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
}> = ({ id, label, description, checked, onChange, icon }) => (
  <GestureButton
    id={id}
    onActivate={() => onChange(!checked)}
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className="flex w-full items-center gap-3 rounded-3xl bg-black/25 p-4 text-left transition-colors hover:bg-black/35"
    activeClassName="ring-2 ring-white/70"
  >
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors"
      style={{
        background: checked ? "rgba(79,195,247,0.2)" : "rgba(255,255,255,0.06)",
        color: checked ? "#4fc3f7" : "rgba(255,255,255,0.4)",
      }}
    >
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-white/85">{label}</span>
      <span className="block text-[11px] leading-snug text-white/45">{description}</span>
    </span>
    <span
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200"
      style={{ background: checked ? "#4fc3f7" : "rgba(255,255,255,0.14)" }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200"
        style={{ left: checked ? 22 : 2 }}
      />
    </span>
  </GestureButton>
);

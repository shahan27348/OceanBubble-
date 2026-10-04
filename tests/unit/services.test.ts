import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TrackerStatus,
  classifyCameraError,
  describeStatus,
  isTrackerFailure,
  startHandTracking,
} from "../../services/handTracker";

const setSecure = (secure: boolean) =>
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: secure });

const setMediaDevices = (value: unknown) =>
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value });

afterEach(() => {
  setSecure(true);
  setMediaDevices(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).Hands;
});

describe("classifyCameraError", () => {
  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "no-camera"],
    ["OverconstrainedError", "no-camera"],
    ["NotReadableError", "camera-busy"],
    ["AbortError", "camera-busy"],
    ["SomethingElse", "error"],
  ])("%s → %s", (name, status) => {
    expect(classifyCameraError({ name })).toBe(status);
  });

  it("handles a non-error rejection", () => {
    expect(classifyCameraError(null)).toBe("error");
    expect(classifyCameraError("oops")).toBe("error");
  });
});

describe("tracker status copy", () => {
  const all: TrackerStatus[] = [
    "loading", "running", "denied", "no-camera", "camera-busy", "insecure", "unsupported", "error",
  ];
  it("has a message for every status", () => {
    for (const s of all) expect(describeStatus(s).length).toBeGreaterThan(5);
  });
  it("tells the player mouse/touch still works whenever tracking is unavailable", () => {
    for (const s of ["denied", "no-camera", "insecure", "unsupported"] as const) {
      expect(describeStatus(s)).toMatch(/mouse|touch/i);
    }
  });
  it("classifies failures", () => {
    expect(isTrackerFailure("loading")).toBe(false);
    expect(isTrackerFailure("running")).toBe(false);
    expect(isTrackerFailure("denied")).toBe(true);
  });
});

describe("startHandTracking", () => {
  const video = () => document.createElement("video");

  it("refuses to run on an insecure origin", () => {
    setSecure(false);
    const onStatus = vi.fn();
    startHandTracking(video(), { onHands: vi.fn(), onStatus });
    expect(onStatus).toHaveBeenCalledWith("insecure");
  });

  it("reports unsupported when there is no camera API", () => {
    setSecure(true);
    const onStatus = vi.fn();
    startHandTracking(video(), { onHands: vi.fn(), onStatus });
    expect(onStatus).toHaveBeenCalledWith("unsupported");
  });

  it("reports unsupported when MediaPipe failed to load", () => {
    setSecure(true);
    setMediaDevices({ getUserMedia: vi.fn() });
    const onStatus = vi.fn();
    startHandTracking(video(), { onHands: vi.fn(), onStatus });
    expect(onStatus).toHaveBeenCalledWith("unsupported");
  });

  it("reports a denied camera and never throws", async () => {
    setSecure(true);
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    setMediaDevices({ getUserMedia: vi.fn().mockRejectedValue(denied) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Hands = class {
      setOptions() {}
      onResults() {}
      send() {
        return Promise.resolve();
      }
    };
    const onStatus = vi.fn();
    const stop = startHandTracking(video(), { onHands: vi.fn(), onStatus });
    expect(onStatus).toHaveBeenCalledWith("loading");
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith("denied"));
    expect(() => stop()).not.toThrow();
  });

  it("releases the camera if stopped before permission resolves", async () => {
    setSecure(true);
    const trackStop = vi.fn();
    let resolve!: (s: MediaStream) => void;
    setMediaDevices({
      getUserMedia: vi.fn(() => new Promise<MediaStream>((r) => (resolve = r))),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Hands = class {
      setOptions() {}
      onResults() {}
      send() {
        return Promise.resolve();
      }
    };
    const onStatus = vi.fn();
    const stop = startHandTracking(video(), { onHands: vi.fn(), onStatus });
    stop();
    resolve({ getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream);
    await vi.waitFor(() => expect(trackStop).toHaveBeenCalled());
    // Nothing is reported after stop.
    expect(onStatus).toHaveBeenCalledTimes(1);
  });
});

describe("audioManager", () => {
  it("is silent but safe when Web Audio is unavailable", async () => {
    vi.resetModules();
    // jsdom has no AudioContext.
    const { audioManager } = await import("../../services/audioService");
    expect(() => {
      audioManager.unlock();
      audioManager.playShoot();
      audioManager.playPop(3);
      audioManager.startAmbient();
      audioManager.setMuted(true);
      audioManager.setMuted(false);
      audioManager.setVolume(2);
      audioManager.setHidden(true);
      audioManager.stopAmbient();
    }).not.toThrow();
  });

  it("brings the ambient drone back when unmuted mid-round", async () => {
    vi.resetModules();
    const started: string[] = [];
    const node = () => ({
      connect: vi.fn(),
      start: vi.fn(() => started.push("osc")),
      stop: vi.fn(),
      type: "sine",
      frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    });
    const gain = () => ({
      connect: vi.fn(),
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
    });
    class FakeCtx {
      state = "running";
      currentTime = 0;
      destination = {};
      createOscillator = node;
      createGain = gain;
      resume = () => Promise.resolve();
      suspend = () => Promise.resolve();
    }
    vi.stubGlobal("AudioContext", FakeCtx);
    try {
      const { audioManager } = await import("../../services/audioService");
      audioManager.setMuted(true);
      audioManager.startAmbient();
      expect(started).toHaveLength(0);
      audioManager.setMuted(false);
      expect(started.length).toBeGreaterThan(0);
      audioManager.stopAmbient();
      const count = started.length;
      audioManager.setMuted(true);
      audioManager.setMuted(false);
      expect(started).toHaveLength(count); // round over: no drone on unmute
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

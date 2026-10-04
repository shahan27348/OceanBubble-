/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Owns the webcam and the MediaPipe Hands model.
 *
 * The legacy MediaPipe solution can't be safely closed and re-created in the
 * same page (its WASM module is global), which React StrictMode and hot reload
 * both do. So the model is created once and kept; only the camera stream is
 * started and stopped with the component.
 */

import { Landmark } from "../game/gesture";

/** Must match the version of hands.js loaded in index.html. */
export const MEDIAPIPE_HANDS_VERSION = "0.4.1675469240";

export type TrackerStatus =
  | "loading"
  | "running"
  | "denied"
  | "no-camera"
  | "camera-busy"
  | "insecure"
  | "unsupported"
  | "error";

export interface TrackerCallbacks {
  onHands: (landmarks: Landmark[] | null) => void;
  onStatus: (status: TrackerStatus) => void;
}

interface HandsLike {
  setOptions(opts: Record<string, unknown>): void;
  onResults(cb: (results: { multiHandLandmarks?: Landmark[][] }) => void): void;
  send(input: { image: HTMLVideoElement }): Promise<void>;
}

let sharedHands: HandsLike | null = null;
let activeCallbacks: TrackerCallbacks | null = null;

const getHands = (): HandsLike => {
  if (sharedHands) return sharedHands;
  const hands: HandsLike = new window.Hands({
    locateFile: (file: string) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MEDIAPIPE_HANDS_VERSION}/${file}`,
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  // Results are routed to whichever component is currently mounted.
  hands.onResults((results) => {
    const first = results.multiHandLandmarks?.[0];
    activeCallbacks?.onHands(first && first.length ? first : null);
  });
  sharedHands = hands;
  return hands;
};

/** Maps getUserMedia failures to something we can explain to the player. */
export const classifyCameraError = (err: unknown): TrackerStatus => {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError")
    return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError")
    return "no-camera";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError")
    return "camera-busy";
  return "error";
};

/**
 * Starts the camera and feeds frames to the model. Returns a stop function.
 * Never throws: every failure is reported through `onStatus`.
 */
export const startHandTracking = (
  video: HTMLVideoElement,
  callbacks: TrackerCallbacks
): (() => void) => {
  let stopped = false;
  let stream: MediaStream | null = null;
  let raf = 0;
  let sending = false;
  let failures = 0;
  let reportedRunning = false;

  activeCallbacks = callbacks;
  const report = (status: TrackerStatus) => {
    if (!stopped) callbacks.onStatus(status);
  };

  if (typeof window === "undefined" || !window.isSecureContext) {
    report("insecure");
    return () => undefined;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    report("unsupported");
    return () => undefined;
  }
  if (typeof window.Hands !== "function") {
    // hands.js failed to load (offline, blocked CDN, ad blocker).
    report("unsupported");
    return () => undefined;
  }

  report("loading");

  let hands: HandsLike;
  try {
    hands = getHands();
  } catch {
    report("error");
    return () => undefined;
  }

  const pump = async () => {
    if (stopped) return;
    raf = requestAnimationFrame(pump);
    if (sending || video.readyState < 2 || video.videoWidth === 0) return;
    sending = true;
    try {
      await hands.send({ image: video });
      failures = 0;
      if (!reportedRunning) {
        reportedRunning = true;
        report("running");
      }
    } catch {
      // A few dropped frames are normal; a run of failures means the model
      // never loaded (usually the WASM/model download was blocked).
      failures += 1;
      if (failures > 30) {
        report("error");
        stop();
      }
    } finally {
      sending = false;
    }
  };

  navigator.mediaDevices
    .getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: "user" },
      audio: false,
    })
    .then(async (s) => {
      if (stopped) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      video.srcObject = s;
      video.muted = true;
      video.playsInline = true;
      try {
        await video.play();
      } catch {
        /* autoplay of a muted inline video is allowed; ignore transient aborts */
      }
      // If the camera is unplugged mid-game, say so instead of freezing.
      s.getVideoTracks().forEach((track) =>
        track.addEventListener("ended", () => {
          report("no-camera");
          stop();
        })
      );
      raf = requestAnimationFrame(pump);
    })
    .catch((err) => report(classifyCameraError(err)));

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video.srcObject) video.srcObject = null;
    if (activeCallbacks === callbacks) activeCallbacks = null;
  };
  return stop;
};

export const describeStatus = (status: TrackerStatus): string => {
  switch (status) {
    case "loading":
      return "Starting hand tracking…";
    case "running":
      return "Hand tracking ready";
    case "denied":
      return "Camera access was blocked. Allow it in the address bar to play by hand — mouse and touch still work.";
    case "no-camera":
      return "No camera found. You can play with a mouse or touch screen.";
    case "camera-busy":
      return "Your camera is in use by another app. Close it and reload to play by hand.";
    case "insecure":
      return "Hand tracking needs a secure (https) connection. Mouse and touch still work.";
    case "unsupported":
      return "Hand tracking couldn't load in this browser. Mouse and touch still work.";
    case "error":
      return "Hand tracking failed to start. Check your connection and reload.";
  }
};

/** True when the player should fall back to mouse/touch. */
export const isTrackerFailure = (status: TrackerStatus) =>
  status !== "loading" && status !== "running";

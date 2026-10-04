import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * jsdom has no canvas. A permissive stub lets the real render loop run in
 * component tests: every method is a no-op and gradients are chainable.
 */
const makeContextStub = () => {
  const gradient = { addColorStop: () => undefined };
  const target: Record<string | symbol, unknown> = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: () => ({ width: 0 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  return new Proxy(target, {
    get: (t, key) => (key in t ? t[key] : () => undefined),
    set: (t, key, value) => {
      t[key] = value;
      return true;
    },
  });
};

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: function getContext() {
    return makeContextStub();
  },
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

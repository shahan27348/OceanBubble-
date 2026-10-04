/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a render error shows a recoverable screen instead of a
 * blank page. Saved progress lives in localStorage, so reloading is safe.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Ocean Bubbles crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="grid h-full w-full place-items-center bg-abyss-950 p-6 text-center text-white"
      >
        <div className="max-w-sm">
          <p className="display text-3xl">Something sank</p>
          <p className="mt-3 text-sm text-white/60">
            The game hit an unexpected error. Your progress is saved — reloading
            should get you back in the water.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-3xl bg-glow-cyan px-6 py-3 font-bold text-abyss-950"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GestureButton, GestureProvider } from "../../components/ui/GestureControl";
import { SettingsScreen } from "../../components/screens/SettingsScreen";
import { LevelsScreen } from "../../components/screens/LevelsScreen";
import { HomeScreen } from "../../components/screens/HomeScreen";
import { ResultModal } from "../../components/game/ResultModal";
import { AmmoGauge, ColorSelector } from "../../components/game/GameHud";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { DEFAULT_SETTINGS, defaultState } from "../../services/storageService";
import { RoundResult } from "../../types";

afterEach(() => {
  vi.useRealTimers();
});

describe("GestureButton", () => {
  it("activates on click and registers a gesture handler under its id", async () => {
    const register = vi.fn(() => () => undefined);
    const onActivate = vi.fn();
    render(
      <GestureProvider value={{ hoveredId: null, dwellProgress: 0, register }}>
        <GestureButton id="x:1" onActivate={onActivate} title="Do it">
          Go
        </GestureButton>
      </GestureProvider>
    );
    const button = screen.getByRole("button", { name: "Do it" });
    expect(button).toHaveAttribute("data-gesture-id", "x:1");
    await userEvent.click(button);
    expect(onActivate).toHaveBeenCalledTimes(1);

    // The registered handler is what a pinch-dwell calls.
    expect(register).toHaveBeenCalledWith("x:1", expect.any(Function));
    const [, handler] = (register.mock.calls[0] as unknown) as [string, () => void];
    handler();
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("is unreachable by gesture and click while disabled", async () => {
    const register = vi.fn(() => () => undefined);
    const onActivate = vi.fn();
    render(
      <GestureProvider value={{ hoveredId: null, dwellProgress: 0, register }}>
        <GestureButton id="x:2" onActivate={onActivate} disabled>
          Locked
        </GestureButton>
      </GestureProvider>
    );
    const button = screen.getByRole("button", { name: "Locked" });
    expect(button).not.toHaveAttribute("data-gesture-id");
    await userEvent.click(button);
    expect(onActivate).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("shows the hover state when a hand points at it", () => {
    render(
      <GestureProvider value={{ hoveredId: "x:3", dwellProgress: 0.5, register: () => () => undefined }}>
        <GestureButton id="x:3" onActivate={() => undefined} activeClassName="is-hovered">
          Hover
        </GestureButton>
      </GestureProvider>
    );
    expect(screen.getByRole("button", { name: "Hover" })).toHaveClass("is-hovered");
  });
});

describe("SettingsScreen", () => {
  const setup = (overrides = {}) => {
    const props = {
      settings: { ...DEFAULT_SETTINGS },
      onChange: vi.fn(),
      onBack: vi.fn(),
      onResetProgress: vi.fn(),
      livePinchRatio: 1,
      handDetected: false,
      ...overrides,
    };
    render(<SettingsScreen {...props} />);
    return props;
  };

  it("exposes every toggle as a gesture-reachable switch", async () => {
    const props = setup();
    const toggles = screen.getAllByRole("switch");
    expect(toggles).toHaveLength(5);
    for (const t of toggles) expect(t).toHaveAttribute("data-gesture-id");

    await userEvent.click(screen.getByRole("switch", { name: "Trajectory preview" }));
    expect(props.onChange).toHaveBeenCalledWith({ showTrajectory: false });
    expect(screen.getByRole("switch", { name: "Mute everything" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("nudges sliders with +/- buttons, clamped to range", async () => {
    const props = setup({ settings: { ...DEFAULT_SETTINGS, volume: 0.95, pinchSensitivity: 0.6 } });
    await userEvent.click(screen.getByRole("button", { name: "Increase master volume" }));
    expect(props.onChange).toHaveBeenLastCalledWith({ volume: 1 });

    expect(screen.getByRole("button", { name: "Decrease sensitivity" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Increase sensitivity" }));
    expect(props.onChange).toHaveBeenLastCalledWith({ pinchSensitivity: 0.65 });
  });

  it("disables the volume controls while muted", () => {
    setup({ settings: { ...DEFAULT_SETTINGS, muted: true } });
    expect(screen.getByLabelText("Master volume")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase master volume" })).toBeDisabled();
  });

  it("needs two presses to reset progress, and disarms after a pause", () => {
    vi.useFakeTimers();
    const props = setup();
    const reset = screen.getByRole("button", { name: "Reset" });
    fireEvent.click(reset);
    expect(props.onResetProgress).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm reset" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reset" }));
    expect(props.onResetProgress).toHaveBeenCalledTimes(1);
  });

  it("shows live pinch feedback for calibration", () => {
    setup({ handDetected: true, livePinchRatio: 0.1 });
    expect(screen.getByText("Pinch detected")).toBeInTheDocument();
  });

  it("goes back", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(props.onBack).toHaveBeenCalled();
  });
});

describe("LevelsScreen", () => {
  it("only lets unlocked depths be chosen", async () => {
    const onSelect = vi.fn();
    const progress = defaultState().progress;
    progress[2] = { unlocked: true, stars: 2, bestScore: 1500 };
    render(<LevelsScreen progress={progress} onBack={vi.fn()} onSelect={onSelect} />);

    const buttons = screen.getAllByRole("button").filter((b) => b.dataset.gestureId?.startsWith("level:") || b.hasAttribute("disabled"));
    const level1 = buttons.find((b) => b.textContent?.includes("Coral Reef"))!;
    const level3 = buttons.find((b) => b.textContent?.includes("Kelp Forest"))!;
    expect(level3).toBeDisabled();

    await userEvent.click(level1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    await userEvent.click(level3);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByText("/ 30").previousElementSibling).toHaveTextContent("2"); // total stars
  });
});

describe("HomeScreen", () => {
  it("summarises saved progress", () => {
    const saved = defaultState();
    saved.highScore = 4321;
    saved.totalFishRescued = 7;
    saved.aquarium = { 1: 3 };
    saved.progress[1] = { unlocked: true, stars: 3, bestScore: 10 };
    render(<HomeScreen saved={saved} onQuickStart={vi.fn()} onLevels={vi.fn()} onSettings={vi.fn()} />);
    expect(screen.getByText("4,321")).toBeInTheDocument();
    expect(screen.getByText(/3\/30 stars/)).toBeInTheDocument();
    expect(screen.getByTitle("Clownfish ×3")).toBeInTheDocument();
  });

  it("shows an empty aquarium for a new player", () => {
    render(
      <HomeScreen saved={defaultState()} onQuickStart={vi.fn()} onLevels={vi.fn()} onSettings={vi.fn()} />
    );
    expect(screen.getByText(/Empty for now/)).toBeInTheDocument();
  });
});

describe("ResultModal", () => {
  const base: RoundResult = {
    outcome: "victory",
    score: 2500,
    fishFreed: 3,
    fishTarget: 3,
    ballsUsed: 6,
    stars: 2,
    bestCombo: 3,
    levelId: 1,
    isNewHighScore: true,
  };

  it("celebrates a win and offers the next depth", async () => {
    const onNext = vi.fn();
    render(<ResultModal result={base} hasNextLevel onRetry={vi.fn()} onNextLevel={onNext} onHome={vi.fn()} />);
    expect(screen.getByText("Depth Cleared")).toBeInTheDocument();
    expect(screen.getByText("New personal best")).toBeInTheDocument();
    expect(screen.getByText("2,500")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Descend deeper/ }));
    expect(onNext).toHaveBeenCalled();
  });

  it("offers a retry after a loss and hides 'next'", async () => {
    const onRetry = vi.fn();
    render(
      <ResultModal
        result={{ ...base, outcome: "defeat", stars: 0, fishFreed: 1, isNewHighScore: false }}
        hasNextLevel
        onRetry={onRetry}
        onNextLevel={vi.fn()}
        onHome={vi.fn()}
      />
    );
    expect(screen.getByText("Dive Over")).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 fish rescued/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Descend deeper/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("HUD pieces", () => {
  it("AmmoGauge reports what's left and hides in endless mode", () => {
    const { rerender } = render(<AmmoGauge remaining={4} limit={10} />);
    expect(screen.getByTestId("ammo")).toHaveAttribute("data-remaining", "4");
    expect(screen.getByRole("status", { name: "4 of 10 shots left" })).toBeInTheDocument();
    rerender(<AmmoGauge remaining={0} limit={null} />);
    expect(screen.queryByTestId("ammo")).not.toBeInTheDocument();
  });

  it("ColorSelector marks the loaded colour and switches on click", async () => {
    const onSelect = vi.fn();
    render(
      <ColorSelector pair={["red", "blue"]} selected="red" nextColor="green" showSymbols onSelect={onSelect} />
    );
    expect(screen.getByRole("button", { name: "Load Coral" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Load Ocean" }));
    expect(onSelect).toHaveBeenCalledWith("blue");
  });
});

describe("ErrorBoundary", () => {
  it("shows a recoverable screen instead of a blank page", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error("kaboom");
    };
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something sank");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    spy.mockRestore();
  });
});

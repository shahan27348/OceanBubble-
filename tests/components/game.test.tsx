/**
 * Integration tests: the whole game component, with the real render loop and
 * engine running under jsdom (canvas is stubbed in tests/setup.ts). jsdom has
 * no camera, so the game falls back to pointer input — the same path a player
 * without a webcam takes.
 */
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OceanBubbles from "../../components/OceanBubbles";
import { STORAGE_KEY, defaultState } from "../../services/storageService";
import { computeLayout } from "../../game/engine";

const mount = () => render(<OceanBubbles />);

/** Where the slingshot ball sits on screen, in CSS pixels. */
const anchorOnScreen = () => {
  const layout = computeLayout(window.innerWidth, window.innerHeight);
  return { x: layout.anchor.x * layout.scale, y: layout.anchor.y * layout.scale };
};

const nextFrames = (ms = 120) => act(() => new Promise((r) => setTimeout(r, ms)));

/** Pull the slingshot down by `pull` CSS pixels and let go. */
const shoot = async (pull = 110, sideways = 0) => {
  const canvas = screen.getByTestId("play-surface");
  const a = anchorOnScreen();
  fireEvent.pointerMove(window, { clientX: a.x, clientY: a.y });
  fireEvent.pointerDown(canvas, { clientX: a.x, clientY: a.y });
  await nextFrames(60);
  fireEvent.pointerMove(window, { clientX: a.x + sideways, clientY: a.y + pull });
  await nextFrames(80);
  fireEvent.pointerUp(window, { clientX: a.x + sideways, clientY: a.y + pull });
  await nextFrames(100);
};

describe("OceanBubbles", () => {
  it("boots straight to the menu and explains why hand tracking is unavailable", async () => {
    mount();
    expect(screen.getByRole("heading", { name: /Ocean\s*Bubbles/ })).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(/mouse|touch/i);
  });

  it("starts a Quick Dive and returns to the menu with Escape", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Quick Dive/ }));
    expect(screen.getByText("Endless Dive")).toBeInTheDocument();
    expect(screen.getByTestId("score")).toHaveAttribute("data-score", "0");
    expect(screen.getByText(/Drag from the bubble and release/)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: /Quick Dive/ })).toBeInTheDocument();
  });

  it("returns to the paused round after opening settings mid-game", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Expedition/ }));
    await userEvent.click(screen.getByRole("button", { name: /Coral Reef/ }));
    expect(screen.getByTestId("ammo")).toHaveAttribute("data-remaining", "10");

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByText("Coral Reef")).toBeInTheDocument();
    expect(screen.getByTestId("ammo")).toHaveAttribute("data-remaining", "10");
  });

  it("fires the slingshot with a mouse drag and spends a shot", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Expedition/ }));
    await userEvent.click(screen.getByRole("button", { name: /Coral Reef/ }));

    await shoot();
    await waitFor(() => expect(screen.getByTestId("ammo")).toHaveAttribute("data-remaining", "9"));
    expect(screen.queryByText(/Drag from the bubble and release/)).not.toBeInTheDocument();
  });

  it("ignores a tiny tug that doesn't reach firing stretch", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Expedition/ }));
    await userEvent.click(screen.getByRole("button", { name: /Coral Reef/ }));
    await shoot(10);
    await nextFrames(200);
    expect(screen.getByTestId("ammo")).toHaveAttribute("data-remaining", "10");
  });

  it("plays a level to the end, saves the result and allows a retry", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Expedition/ }));
    await userEvent.click(screen.getByRole("button", { name: /Coral Reef/ }));

    for (let i = 0; i < 10 && !screen.queryByText(/Depth Cleared|Dive Over/); i++) {
      await shoot(120, (i % 3) * 30 - 30);
      // Let the shot land before the next pull.
      await waitFor(
        () => {
          const left = Number(screen.queryByTestId("ammo")?.getAttribute("data-remaining") ?? 0);
          expect(left).toBeLessThanOrEqual(9 - i);
        },
        { timeout: 2000 }
      );
      await nextFrames(250);
    }

    const heading = await screen.findByText(/Depth Cleared|Dive Over/, undefined, { timeout: 4000 });
    expect(heading).toBeInTheDocument();

    const save = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(save.progress[1].unlocked).toBe(true);

    const dialog = heading.closest("div.glass-solid") as HTMLElement;
    await userEvent.click(within(dialog).getByRole("button", { name: /Try again|Replay/ }));
    expect(screen.queryByText(/Depth Cleared|Dive Over/)).not.toBeInTheDocument();
    expect(screen.getByTestId("ammo")).toHaveAttribute("data-remaining", "10");
  }, 30000);

  it("persists settings changes across reloads", async () => {
    const { unmount } = mount();
    await userEvent.click(screen.getAllByRole("button", { name: /Settings/ })[0]);
    await userEvent.click(screen.getByRole("switch", { name: "Shape symbols on bubbles" }));
    unmount();

    mount();
    await userEvent.click(screen.getAllByRole("button", { name: /Settings/ })[0]);
    expect(screen.getByRole("switch", { name: "Shape symbols on bubbles" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("loads a corrupted save without crashing", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultState(), settings: "nope", progress: 7 }));
    mount();
    expect(screen.getByRole("button", { name: /Quick Dive/ })).toBeInTheDocument();
  });

  it("keeps locked levels locked", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Expedition/ }));
    const kelp = screen.getAllByRole("button").find((b) => b.textContent?.includes("Kelp Forest"))!;
    expect(kelp).toBeDisabled();
  });
});

describe("OceanBubbles reset", () => {
  it("resetting progress keeps the player's settings", async () => {
    const saved = defaultState();
    saved.highScore = 999;
    saved.settings.muted = true;
    saved.settings.pinchSensitivity = 1.3;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<OceanBubbles />);
    await userEvent.click(screen.getAllByRole("button", { name: /Settings/ })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm reset" }));

    const after = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(after.highScore).toBe(0);
    expect(after.settings.muted).toBe(true);
    expect(after.settings.pinchSensitivity).toBe(1.3);
  });
});

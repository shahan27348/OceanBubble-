# 🌊 Ocean Bubbles — Gesture Bubble Shooter

An underwater bubble shooter you play with your hands. Pinch in front of your
webcam, pull back like a slingshot, and let go. Match three or more to pop them
and free the trapped fish.

No webcam? Mouse and touch work everywhere too.

## Features

- **Hand tracking** with MediaPipe Hands: pinch detection that works at any
  distance from the camera, smoothed with a one-euro filter, plus a release
  correction so opening your fingers doesn't knock the shot off line.
- **Fully gesture-driven UI**: every button, toggle and slider can be used by
  pinch-and-hold, with a progress ring on the cursor.
- **Expedition**: 10 levels with fish to rescue, a limited number of shots and
  up to 3 stars each. Progress is saved locally.
- **Quick Dive**: an endless mode where the reef creeps down every few shots.
- **Accurate aiming**: the trajectory preview runs the same physics as the
  real shot.
- **Accessibility**: shape symbols on bubbles for colour-blind players, reduce
  motion, keyboard focus rings, Escape to go back.
- **Fits any screen**: the board scales to fit and the canvas renders sharp on
  high-DPI displays.

## Quick start

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open http://localhost:3000 and allow camera access.

## How to play

| Step    | Hand                                         | Mouse / touch                  |
| ------- | -------------------------------------------- | ------------------------------ |
| Aim     | Pinch thumb and index finger near the bubble | Press on the bubble            |
| Pull    | Keep pinching and move down and away         | Drag down and away             |
| Fire    | Open your fingers                            | Release                        |
| Buttons | Point at it, then pinch and hold briefly     | Click / tap                    |

- Match 3 or more of the same colour to pop them. Bubbles left hanging drop
  for bonus points.
- Back-to-back pops build a combo multiplier, up to 5×.
- The round ends if bubbles cross the red dashed line, or you run out of shots
  in Expedition mode.
- Pinches being missed, or the slingshot firing by itself? Adjust **Settings →
  Hand tracking → Sensitivity**. A live meter shows what the camera sees.

## Scripts

| Command                 | What it does                                          |
| ----------------------- | ----------------------------------------------------- |
| `npm run dev`           | Dev server on port 3000                               |
| `npm run build`         | Typecheck, then production build into `dist/`         |
| `npm run preview`       | Serve the production build on port 4173               |
| `npm run typecheck`     | TypeScript in strict mode                             |
| `npm test`              | Unit and component tests (Vitest)                     |
| `npm run test:coverage` | The same, with a coverage report in `coverage/`       |
| `npm run test:e2e`      | End-to-end tests in a real browser (Playwright)       |
| `npm run check`         | Everything above, in order. Run this before shipping. |

## Testing

There are three layers of tests:

- **Unit tests** (`tests/unit`) cover the game rules, which live in pure
  functions: hex grid geometry, matching, orphan drops, scoring and combos,
  stars, win/lose conditions, colour dealing, physics, and checks that the
  trajectory preview lands exactly where the real shot does. They also cover
  the gesture maths (pinch hysteresis, filtering, mirroring, release aim),
  save-file validation and migration, camera error handling and audio.
- **Component tests** (`tests/components`) render the screens and the whole
  game in jsdom, with the real render loop running. They play a level from
  start to finish with simulated pointer input.
- **End-to-end tests** (`e2e`) run the production build in Chrome with a fake
  webcam. The MediaPipe model is swapped for a scripted hand, so the full
  gesture pipeline can be tested without a person in front of the camera:
  pinch-to-click, the slingshot, cursor tracking, hand loss mid-pull, and
  checks that a held pinch can't click through onto the next screen. Other
  specs cover mouse play, a blocked camera, a missing camera, a blocked CDN, a
  corrupted save, layout on phone and desktop, and (when the CDN is reachable)
  the real MediaPipe model starting on the fake webcam.

By default the E2E tests use your installed Chrome. To use Playwright's
bundled Chromium instead (as CI does):

```bash
npx playwright install chromium
PW_CHANNEL="" npm run test:e2e
```

## Deploying

`npm run build` produces a static site in `dist/` that can be hosted on any
static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3…).

- **Serve it over HTTPS.** Browsers only allow camera access on secure
  origins (`localhost` is the exception). Over plain HTTP the game shows a
  notice and falls back to mouse/touch.
- **Allow the MediaPipe CDN.** The hand-tracking script, WASM and model are
  loaded from `cdn.jsdelivr.net` (version pinned in `index.html` and
  `services/handTracker.ts`; keep the two in sync). If you set a Content
  Security Policy, allow that origin in `script-src` and `connect-src`, and
  allow `'wasm-unsafe-eval'`. Fonts come from Google Fonts.
- **No secrets are needed.** The app is fully client-side and has no API keys.
- The CI workflow in `.github/workflows/ci.yml` runs typecheck, tests, build
  and E2E on every push and pull request.

## Project layout

```
game/engine.ts          Pure game rules: grid, matching, scoring, physics, layout
game/gesture.ts         Pure hand maths: pinch detection, filtering, mapping
gameConfig.ts           Levels, palette and tuning constants
services/handTracker.ts Webcam + MediaPipe lifecycle and error reporting
services/storageService.ts  Validated localStorage save/load and progression
services/audioService.ts    Synthesised sound effects (Web Audio)
components/OceanBubbles.tsx Game shell: render loop, input, screens
components/screens/     Home, level select, settings
components/game/        HUD and result dialog
components/ui/          Gesture button/cursor, camera preview, panels
tests/                  Vitest unit + component tests
e2e/                    Playwright end-to-end tests
```

## Troubleshooting

- **"Camera access was blocked"**: click the camera icon in the address bar,
  allow access, and reload.
- **"Your camera is in use"**: close other apps using the webcam (video calls),
  then reload.
- **Hand not detected**: use good, even lighting and keep your whole hand in
  view of the camera.
- **Laggy tracking**: close other heavy tabs. Tracking runs on your device.

## Tech stack

React 19, TypeScript (strict), Vite, Tailwind CSS, MediaPipe Hands,
Canvas 2D, Web Audio. Tests use Vitest, Testing Library and Playwright.

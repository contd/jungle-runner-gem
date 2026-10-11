# Jungle Run — A Modern Retro Adventure Game

**Jungle Run** is an endless 2D platformer and retro adventure game inspired by the legendary 1982 Atari 2600 game *Pitfall!* by David Crane. Built with **Tauri v2**, **Phaser 3**, **TypeScript**, and **React 19**, it modernizes classic jungle exploration with fluid physics, procedural hazard generation, dynamic vine-swinging mechanics, synthesized retro-arcade audio, and local-first persistence.

---

## 1. Features & Mechanics

- **Classic Runner Platforming**: Fluid running, jumping over pits and crocodiles, sliding under thorny branches, and leaping past rolling boulders.
- **Pendulum Vine-Swinging**: Real-time harmonic swinging across bottomless chasms with momentum launch off the apex.
- **Swamp Crocodile Bouncing**: Land on a crocodile's closed mouth to bounce safely like in the Atari 2600 original, or dodge their snapping jaws when open.
- **Procedural World Generation**: Deterministic seeded chunk engine guaranteeing physically achievable hazard sequences with increasing difficulty tiers (Canopy, Swamp, Temple, Cavern).
- **Collectibles & Relics**: Gold coins, ancient jaguar idols, protective shields, and coin magnets.
- **Dynamic Combo Multiplier**: Chain consecutive hazard evasions and treasures for up to a 5x score multiplier.
- **Multiple Game Modes**:
  - **Endless Adventure**: The quintessential 3-life expedition to set high scores and distances.
  - **Practice Sanctuary**: Infinite lives and rewind mechanics to master jumps and vine timings.
  - **Seeded Expedition**: Enter custom numerical seeds to race identical obstacle patterns with friends.
- **Multiple Character Skins**:
  - *Adventurer Harry*: The classic fedora-wearing explorer.
  - *Explorer Maya*: Nimble ruins surveyor unlocked by gathering 50 gold coins.
  - *Ranger Leo*: Primeval wilderness scout unlocked by reaching 1,000 meters.
- **100% Offline Synthesized Audio**: Procedural Web Audio API engine producing authentic 8-bit/16-bit sound effects (jumps, slides, coin chimes, relic fanfares, crocodile snaps) and an interactive algorithmic pentatonic jungle adventure music loop.
- **Local-First Architecture**: Rust-owned native profile persistence and progression, with IndexedDB/LocalStorage for standalone browsers, career lifetime statistics, 11 achievements, and compatible JSON backup export/import.

---

## 2. Technology Stack & Architecture

```
├── src/
│   ├── app/                # Application entrypoint & styles
│   ├── assets/             # Environmental images & procedural textures
│   ├── data/               # Typed backend bridge and standalone-browser fallback
│   │   ├── types.ts                    # TypeScript data models
│   │   ├── native.ts                   # Typed Tauri IPC transport
│   │   ├── defaults.ts                 # Lightweight view of the shared Rust catalog
│   │   ├── storage.ts                  # Lazy legacy browser storage
│   │   ├── browserRepository.ts        # Lazy browser-only progression
│   │   ├── repository.ts               # Runtime routing, queue, and subscriptions
│   │   └── cloudSyncArchitecture.ts    # Boundary contracts & conflict reconciliation
│   ├── game/               # Phaser 3 game engine
│   │   ├── audio/          # Procedural Web Audio sound & music synthesizer
│   │   ├── input/          # Unified input manager (Keyboard, Touch, Gamepad)
│   │   ├── scenes/         # BootScene (textures) & GameScene (physics loop)
│   │   ├── systems/        # Async world bridge, contracts & lazy browser planner
│   │   └── PhaserGame.tsx  # React component wrapper
│   └── ui/                 # React game interface & overlays
│       ├── HUD.tsx                 # Score, distance, hearts, touch buttons
│       ├── MainMenu.tsx            # Hero splash, character & mode selector
│       ├── PauseModal.tsx          # In-game pause & audio adjustments
│       ├── GameOverModal.tsx       # Summary, personal bests, replay button
│       ├── StatsModal.tsx          # Lifetime career stats & run history
│       ├── AchievementsModal.tsx   # Achievements tracking
│       ├── SettingsModal.tsx       # Volumes, screen shake, export/import
│       └── CreditsModal.tsx        # Homage & asset attribution manifest
├── src-tauri/              # Tauri v2 native desktop & iOS shell configuration
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   └── src/                # Shared library, desktop entry point, and native backends
│       ├── data/           # Profile models, migration, persistence, progression, tests
│       └── game/           # World catalog, deterministic selection & terrain planning
└── tests/                  # Vitest automated test suites
```

---

## 3. Getting Started & Development

### Prerequisites
- **Node.js**: v20.19.0 or higher
- **npm**: v9.0.0 or higher
- **Rust & Cargo** (for Tauri native packaging): v1.77.2+

### Installation & Run

```bash
# 1. Install dependencies
npm install

# 2. Run development server (Vite on port 3000)
npm run dev

# 3. Run automated tests (Vitest)
npm run test

# 4. Compile and verify TypeScript
npm run lint

# 5. Production build
npm run build
```

---

## 4. Desktop & iOS Packaging (Tauri v2)

### Desktop Packaging (macOS / Windows / Linux)
```bash
# Run desktop app in development
npm run tauri -- dev

# Build production desktop installers (.dmg / .msi / .deb / AppImage)
npm run tauri -- build
```

### iOS Mobile Packaging
1. Ensure Xcode and Xcode Command Line Tools are installed:
   ```bash
   xcode-select --install
   rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
   ```
2. Initialize iOS project with Tauri v2:
   ```bash
   npm run tauri -- ios init
   ```
3. Run on iOS Simulator or Device:
   ```bash
   npm run tauri -- ios dev --open
   ```

---

## 5. Controls Guide

| Action | Desktop Keyboard | Touch / Mobile | Gamepad |
| :--- | :--- | :--- | :--- |
| **Move forward (hold)** | `Right Arrow` | Hold Move Button | Hold D-pad Right |
| **Jump** | `Space` / `W` / `Up Arrow` | Tap Jump Button or Swipe Up | Button A / D-pad Up |
| **Slide / Duck** | `S` / `Down Arrow` | Tap Slide Button or Swipe Down | Button B / D-pad Down |
| **Vine Latch / Release** | `E` / `Shift` / `Space` | Tap Jump or Vine area | Button A |
| **Pause / Resume** | `Esc` / `P` | Tap Pause Button (Top-Right) | Start / Options |

The adventurer starts stationary. Hold Right to run and release it to stop
horizontal movement, including in mid-air; jumping and gravity still work while
stationary. Left never moves backward. An attached vine continues its pendulum
motion; Jump detaches with forward movement only while Right is held.

---

## 6. Local-First & Future Cloud Synchronization

Jungle Run is strictly designed as a **local-first** application:
- No internet connection is ever required to play, level up, or record personal bests.
- Structured schema versioning (`schemaVersion: 1`) guarantees safe data migrations.
- `CloudSyncService` (`src/data/cloudSyncArchitecture.ts`) documents the future remote synchronization boundary:
  - Policy: `MERGE_MAX_PROGRESS` reconciles selected stat maxima and the union of unlocked character skins and achievements. This prospective service is not connected to native persistence or a backend.

### Native profile ownership and migration

In Tauri, [the Rust data backend](./src-tauri/src/data/mod.rs) owns:
profile loading/caching, schema/catalog migration, settings updates, character
selection, completed-run accumulation, all achievement/skin unlock rules, backup
JSON serialization/import validation, and reset. React keeps a snapshot and
subscription callbacks, not a second native data authority.

The native save is `player-profile-v1.json` beneath Tauri's platform-specific
application-data directory for `com.junglerun.retrogame` (for example, under
`~/Library/Application Support/` on macOS). Native requests run on Tauri's
blocking worker pool rather than the WebView/event-loop thread. One repository
mutex serializes read/modify/write work. Writes flush a unique sibling staging
file and rename it over the save before publishing the new cache snapshot.
Failed operations reject explicitly and do not publish speculative state.

On first native load only, a missing native file triggers a strict read of the
existing WebView-origin IndexedDB profile (or its LocalStorage mirror). Rust
normalizes and saves that aggregate. The original browser copy remains untouched
as a legacy backup. Once a native save exists, startup never rereads/reimports
browser storage, including after a reset. Corrupt or unreadable native data is
reported rather than treated as a new installation. Development and packaged
native builds share the app-data location; their legacy browser origins may differ.

Standalone `npm run dev` still uses the browser repository, dynamically loaded
outside Tauri. Native IPC failures never switch to browser storage. Both runtimes
use [one default catalog](./src-tauri/src/data/default-profile.json), preserving
the original goal thresholds, skin metadata, JSON field names, and 30-run
recording/50-run loading limits. Native imports fill missing older fields, merge
known catalog IDs, and reject future schemas, malformed records, invalid volume
preferences, unsafe numeric values, or locked/unknown selected explorers.

Loading/migration failures block gameplay with a retry action. Failed completed
run saves retain the final score/distance for retry or explicit discard. Settings,
import, export, and reset failures are shown rather than claiming a successful save.
The native backend preserves existing progression counting rules, including
death-code-based avoidance achievements; this migration does not redesign gameplay.

### Performance boundary and validation

No IPC is sent per animation frame. Native persistence, progression loops, and
backup JSON processing leave the WebView thread; profile reads use the Rust cache
and browser-only progression code is a separate lazy chunk. This reduces work
competing with rendering, but is not a measured FPS guarantee: the data operations
are infrequent and IPC/file-flush costs still exist.

### Native world planning

Tauri gameplay uses the Rust `native_world` blocking-worker command for Mulberry32
random generation, difficulty/biome filtering, repeat avoidance, and terrain-gap
expansion. The authoritative authored world catalog is
`src-tauri/src/game/chunk-catalog.json`; the lazy standalone-browser planner imports
the same catalog. The 400-meter biome cycle remains unchanged. A new safe-trail
recipe and shared `pacing.json` extend the introduction: hazard-free selection
before 100m, only safe trails/single logs before 300m, small pits and slide practice
from 300m, advanced hazards from 600m, temple hazards from 1200m, and gauntlets from
2200m. Speed stays at 290 pixels/second until 600m, then increases gradually.
Gap widths are constrained by shared jump tuning as well as the static spacing check.

Each request carries an unsigned random accumulator and previous chunk ID, and
returns scene-ready recipes, 64-pixel tile plans, and the next continuation.
The command supports batches of 1–64 actual selection-time distances. The scene
requests one segment when the camera approaches within 1600 pixels of the terrain
edge, rather than predicting future difficulty distances. Only one call is pending
at a time. The runner pauses before reaching unprepared terrain if the worker is
slow; failures pause and offer retry with the exact same distance/continuation.
Late replies from a destroyed/restarted scene are ignored. No mutable native run
session is retained.

Rendering, Canvas texture generation, Arcade Physics, collision feedback, vine
motion, input, Web Audio, and frame-local scoring stay in the WebView. Moving these
through ordinary IPC would add latency to every frame or browser-device event.
Completed-run progression already belongs to Rust. Native world work no longer
runs on the rendering thread, but this is not a measured FPS improvement; the small
catalog and IPC costs may limit gains. Seed determinism applies to selection, not
the independent visual vine/audio randomness. Actual asynchronous spawn timing
can differ from synchronous browser timing.

```bash
npm run lint
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Frontend tests cover native request shapes, one-time migration, load deduplication,
queued changes, failure propagation, and standalone-browser behavior. Rust tests
cover progression parity, validation, file reload/import/reset, failed-write
rollback, concurrent callers, and actual Tauri command dispatch using its mock
runtime. World tests compare both languages against shared fixed reference vectors,
exact tile boundaries/overlap precedence, batching, native failure/retry, and scene
lifecycle cancellation. The test backend uses isolated temporary directories,
never real saves.

---

## 7. Asset Attribution Manifest

- **Phaser 3 Engine**: Copyright (c) Richard Davey, Photon Storm Ltd. (MIT License).
- **Tauri v2**: Copyright (c) The Tauri Programme (MIT / Apache-2.0).
- **Characters**: Supplied `jungle-asset-pack` outlined artwork, using the same base
  character for Harry, Maya, and Leo with gold/green/red shirt variants. The pack's
  mockup includes an `@jesse2Art` credit; no license file was found in the supplied
  pack, so confirm its distribution terms before publishing the game/assets.
- **Hazards & Terrain**: Procedural vector textures synthesized using Canvas in `BootScene`.
- **Audio Synthesizer**: Pure Web Audio API procedural oscillator & noise synthesizer.
- **Icons**: Lucide Icons (ISC License).
- **Inspiration**: Homage to David Crane's *Pitfall!* (1982, Activision).

---

### Character asset preparation

Runtime PNG sheets live in `src/assets/characters`; originals remain untouched in
`jungle-asset-pack`. Run `node tools/prepare-character-assets.mjs` with ImageMagick 7
installed to regenerate them. Normal builds use the checked-in PNGs and do not
need ImageMagick or Aseprite.

GIF frames are coalesced, nearest-neighbor scaled 1.5x, bottom-aligned in fixed
48-by-64 cells, and packed horizontally. Run (8 frames), idle (12), mid-air (2),
and ledge-grab/swing (6) retain their original 10 FPS timing. Jump/landing are
single poses; landing is deliberately flattened into a 64-by-36 slide frame.
The scene plays run, falling, and swing animations, with a static jump/slide pose;
idle plays while grounded without Right held; the landing sheet remains available.
Collision body sizes, slide timing, vine logic, saved IDs and unlock rules
remain unchanged. Exact opaque teal shirt shades are replaced at boot; skin,
hair, outlines and transparency are preserved. No new hats or separate character
anatomy are invented by the palette variants.

### Higher jump and airborne boost

Ground jumping now launches at 800 pixels/second upward (previously 540).
A second distinct Jump press adds 720 pixels/second to upward motion once per
airborne interval (falling velocity is cancelled first). Holding Jump or keyboard
autorepeat does not consume the boost.
Only grounded landing restores it: vine grabs, crocodile bounces, and damage do
not grant extra boosts. Walking off a ledge also permits the one airborne boost.

`src-tauri/src/game/movement.json` is shared by scene physics and both planners.
At minimum running speed with combined gravity of 2400 pixels/second squared,
the single jump rises about 133 pixels and travels about 193 pixels at equal
height. After a 96-pixel takeoff/landing reserve, terrain limits every contiguous
pit/water span to 64 pixels (one terrain tile), without requiring the boost.
Vines and crocodiles no longer exempt larger gaps: a nearby helper alone does not
prove its moving tip or bounce route is reachable. They remain optional aids;
authored widths are narrowed before rendering. Quicksand has solid terrain below
it, so it slows the runner instead of acting as another unvalidated void.
This is a conservative geometric check, not a complete simulation of input
timing, vine motion, or hazards. Seeded sequences intentionally change with the
new opening recipe and eligibility rules; both planners use updated shared fixtures.

Vine sprites scale to their logical length. Attachment and player positioning use
the same rotated bottom-center as Phaser rendering, with the swing pose's hands
at that tip, rotating the character about its hand grip with the vine. Jump releases
the vine, restores the upright centered standing body at its
current visual position, and applies launch velocity. A 400 ms re-grab lockout
and exclusion of the released vine until leaving its 100-pixel vicinity prevent
automatic attachment from cancelling release. A fresh press is required, not a
held/repeated Jump notification.

## 8. Generated Developer Documentation

The TypeScript/TSX application and all test modules use TypeDoc comments
describing data contracts, units, state ownership, lifecycle, and edge cases.
Private class members are included. Component props, scene helper interfaces, and
screen-state types are exported as compile-time contracts so TypeDoc generates
their own reference pages; the storage adapter has a type-only export rather than
a new runtime class export. Comments on function-local variables and
test callbacks remain in the linked source; test module pages summarize each
suite's fixtures, assertions, and coverage limitations. CSS and binary images
are not parsed by TypeDoc; the stylesheet describes the global theme and the
boot/menu modules document how bundled images are used.

Rust uses native `//!` module and `///` item comments. TypeDoc cannot parse Rust,
so rustdoc generates a linked native reference within the same site.

### Generate and preview

The application keeps TypeScript 7. Documentation has a separate, locked
TypeDoc/TypeScript 6 installation in `tools/docs`, avoiding changes
to the application's compiler or unsupported TypeDoc/compiler combinations.
Both installations are required on a fresh checkout:

```bash
bun install --frozen-lockfile
npm run docs:install

# Build assets needed by the Tauri build-time context before generating rustdoc.
npm run build

# Generate TypeDoc and rustdoc together and verify module/native-page coverage.
RUSTDOCFLAGS="-D warnings" npm run docs

# Serve the generated site at http://localhost:4174.
npm run docs:preview
```

Generation writes HTML and TypeDoc reflection JSON to `./docs`, copies rustdoc
under `./docs/native`, and includes `.nojekyll` for GitHub Pages. The entire output
is ignored by Git: source comments/configuration and dependency lockfiles
are authoritative. TypeDoc clears its previous output before regeneration.
Generation fails on TypeDoc warnings, missing application/test modules or module
comments, missing native entry-point pages, and broken local HTML resource links.
Site assembly rebases TypeDoc's custom native navigation links for nested API pages.

### GitHub Pages

In the repository's **Settings > Pages > Build and deployment**, choose
**GitHub Actions** as the source. The [CI workflow](./.github/workflows/ci.yml)
generates and verifies `./docs` on macOS, uploads it as the Pages artifact, and
deploys only after all platform tests and builds succeed. Pushes to `main` or
manual runs on `main` deploy; pull requests and version tags validate the site
without deploying it. No generated files need to be committed and no `gh-pages`
branch is required.

The landing page's navigation links open the shared native library and desktop
entry-point references. All generated asset/native links are relative so the site
works under the repository's GitHub Pages path, not just at a domain root.

### Cross-platform CI artifacts

The workflow runs on pull requests, pushes to `main`, `v*` tags, and manual
dispatch. All three desktop OS test jobs must pass TypeScript checks, frontend
and version-hook tests, Rust library/IPC tests, rustfmt, and strict Clippy before
any distribution job starts. Frontend assets are prepared inside the test jobs
because native `generate_context!` tests require them.

Windows MSVC library test harnesses need Common Controls v6 but do not inherit
the production app's Tauri manifest. CI uses `tools/run-windows-tests.ps1` as
Cargo's test runner to embed `tools/windows-test.manifest` with the Windows SDK's
`mt.exe` before running each harness. This fixes the pre-test
`0xc0000139 / STATUS_ENTRYPOINT_NOT_FOUND` crash without removing native IPC
coverage or adding duplicate manifest resources to release builds. The runner
also excludes non-system PATH directories containing stale `api-ms-win-*.dll`
overlays, which can otherwise shadow Windows APIs. Harness arguments and failure
exit codes pass through unchanged.

For the same behavior locally, from the repository root in PowerShell:

```powershell
$runner = (Resolve-Path tools/run-windows-tests.ps1).Path
$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUNNER = "pwsh -NoProfile -File $runner"
cargo test --manifest-path src-tauri/Cargo.toml --locked --all-targets
Remove-Item Env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUNNER
```

This requires PowerShell 7 and the x64 Windows SDK tools installed by Visual
Studio's Desktop development with C++ workload. The runner is scoped to the
Windows test step; normal application builds and other platforms are unchanged.

Native IPC tests derive the request origin from the mock WebView's actual URL:
Windows uses `http://tauri.localhost`, while macOS/Linux use `tauri://localhost`.
Hardcoding the Unix URL on Windows makes Tauri classify the request as remote
and reject it before command dispatch. Both command tests also verify that an
untrusted remote origin remains rejected; no application permissions are relaxed.

Successful builds upload these downloadable Actions artifacts (not GitHub Releases):

| Platform | Runner | Output |
| :--- | :--- | :--- |
| Windows | `windows-latest` | Unsigned x64 NSIS installer |
| macOS | `macos-latest` | Unsigned host-architecture app ZIP and DMG |
| Linux | `ubuntu-22.04` | x64 DEB and AppImage |
| iOS | `macos-latest` | Unsigned ARM64 simulator app ZIP |
| Android | `ubuntu-22.04` | ARM64 debug APK, signed only with the generated debug keystore |

Mobile projects are generated from the current Tauri configuration in each CI
job; `src-tauri/gen/apple` and `src-tauri/gen/android` are ignored. The Android
job installs Java 17, SDK/build-tools 36, and NDK 28.2.13676358. The iOS job uses
the runner's Xcode and XcodeGen. No distribution signing secrets are needed.
The iOS artifact cannot be installed on a physical device or submitted to the
App Store; Android debug APKs are not Play Store releases. Desktop macOS builds
are not notarized. Signed distribution builds require a separate credentials setup.

### One application version

`package.json` is authoritative. Tauri's configuration reads `../package.json`
directly, and `tools/sync-version.mjs` updates only the native package version in
`src-tauri/Cargo.toml` and its matching `src-tauri/Cargo.lock` entry.

```bash
# On a clean worktree, npm bumps the version, runs the native sync hook,
# and includes the native files in its normal version commit/tag.
npm version patch
npm version minor
npm version major

# Update versions without creating a commit or tag.
npm version patch --no-git-tag-version

# Repair a manually edited package version, or validate synchronization.
npm run version:sync
npm run version:check
```

Do not use `--ignore-scripts` with `npm version`: it bypasses the sync hook.
Inside a Git checkout the hook stages the two native files, even when automatic
commit/tag creation is disabled; outside Git it only updates the files.
CI checks synchronization before tests and builds. The Bun dependency lockfile
does not store the root application version; no dependency update is needed
for a version bump. Generated mobile projects pick up the current version at
initialization/build time.

### Documentation describes current behavior

The comments distinguish implemented behavior from reserved functionality:
cloud synchronization is offline-only; catalog spacing is a static heuristic
rather than a physics proof; scoring tests are arithmetic fixtures rather than
scene-level regression tests; non-browser persistence tests do not demonstrate
IndexedDB durability. These descriptions intentionally do not change gameplay.

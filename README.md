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
- **Local-First Architecture**: Structured IndexedDB database with LocalStorage fallback, career lifetime statistics, 11 progression achievements, and JSON backup export/import.

---

## 2. Technology Stack & Architecture

```
├── src/
│   ├── app/                # Application entrypoint & styles
│   ├── assets/             # Environmental images & procedural textures
│   ├── data/               # Local-first persistence, types, and cloud sync boundary
│   │   ├── types.ts                    # TypeScript data models
│   │   ├── storage.ts                  # IndexedDB & LocalStorage fallback
│   │   ├── repository.ts               # LocalGameRepository & event bus
│   │   └── cloudSyncArchitecture.ts    # Boundary contracts & conflict reconciliation
│   ├── game/               # Phaser 3 game engine
│   │   ├── audio/          # Procedural Web Audio sound & music synthesizer
│   │   ├── input/          # Unified input manager (Keyboard, Touch, Gamepad)
│   │   ├── scenes/         # BootScene (textures) & GameScene (physics loop)
│   │   ├── systems/        # ProceduralWorldGenerator & SeededRNG
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
│   └── src/main.rs
└── tests/                  # Vitest automated test suites
```

---

## 3. Getting Started & Development

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Rust & Cargo** (for Tauri native packaging): v1.75+

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
npx @tauri-apps/cli dev

# Build production desktop installers (.dmg / .msi / .deb / AppImage)
npx @tauri-apps/cli build
```

### iOS Mobile Packaging
1. Ensure Xcode and Xcode Command Line Tools are installed:
   ```bash
   xcode-select --install
   rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
   ```
2. Initialize iOS project with Tauri v2:
   ```bash
   npx @tauri-apps/cli ios init
   ```
3. Run on iOS Simulator or Device:
   ```bash
   npx @tauri-apps/cli ios dev --open
   ```

---

## 5. Controls Guide

| Action | Desktop Keyboard | Touch / Mobile | Gamepad |
| :--- | :--- | :--- | :--- |
| **Jump** | `Space` / `W` / `Up Arrow` | Tap Jump Button or Swipe Up | Button A / D-pad Up |
| **Slide / Duck** | `S` / `Down Arrow` | Tap Slide Button or Swipe Down | Button B / D-pad Down |
| **Vine Latch / Release** | `E` / `Shift` / `Space` | Tap Jump or Vine area | Button A |
| **Pause / Resume** | `Esc` / `P` | Tap Pause Button (Top-Right) | Start / Options |

---

## 6. Local-First & Future Cloud Synchronization

Jungle Run is strictly designed as a **local-first** application:
- No internet connection is ever required to play, level up, or record personal bests.
- Structured schema versioning (`schemaVersion: 1`) guarantees safe data migrations.
- `CloudSyncService` (`src/data/cloudSyncArchitecture.ts`) documents the future remote synchronization boundary:
  - Policy: `MERGE_MAX_PROGRESS` reconciles conflicts by selecting peak high scores, longest distance, cumulative stats, and the union of unlocked character skins and achievements.

---

## 7. Asset Attribution Manifest

- **Phaser 3 Engine**: Copyright (c) Richard Davey, Photon Storm Ltd. (MIT License).
- **Tauri v2**: Copyright (c) The Tauri Programme (MIT / Apache-2.0).
- **Sprites & Hazards**: Procedural vector textures synthesized directly using HTML5 Canvas API in `BootScene`.
- **Audio Synthesizer**: Pure Web Audio API procedural oscillator & noise synthesizer.
- **Icons**: Lucide Icons (ISC License).
- **Inspiration**: Homage to David Crane's *Pitfall!* (1982, Activision).

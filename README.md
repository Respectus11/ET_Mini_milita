# ET Mini Militia

An original 2D jetpack shooter for mobile, inspired by the feel of classic
Mini Militia but built from scratch — original code, original procedural art,
original text. Built with **Cocos Creator 3.8**, the same engine family as the original game.

> Legal note: this project contains **nothing** extracted from Appsomniacs'
> Mini Militia. The `reference/` folder (git-ignored) is local-only study
> material about how the original is engineered; see `docs/FINDINGS.md`.

## Features

- Jetpack + dual-stick combat loop with custom AABB physics vs tile grids
- Weapons: Rifle, Shotgun, Sniper, Grenade Launcher, SMG, Magnum, Plasma Gun
- Tactical throwable grenades, dual-wielding, and explosive steel barrels
- Headshot criticals, killstreak announcements, and sniper laser sight
- Weapon crates scattered on every map grant a random full-magazine weapon
- Melee lunges, one-way platforms, drop-through floors, jetpack fuel economy
- Bot AI: patrol / chase / attack / retreat states with grenade/barrel awareness
- Four battlefields: Lalibela, Simien, Merkato, Danakil
- Modes: vs Bots, Two Players on the same device, and LAN multiplayer
- Frag-limit and timed matches, respawns, results screen, rematch flow

## Quick start

1. Install [Cocos Creator 3.8.x](https://www.cocos.com/en/creator-download)
   via Cocos Dashboard (not bundled with the repo).
2. Open this repo's `game/` folder as a project.
3. Open `assets/main.scene` — a GameRoot node is already wired up. Press Play.
4. Desktop preview uses WASD + mouse; touch devices get the dual-stick
   overlay automatically. Phones are the primary target — see
   [`BUILD.md`](BUILD.md) for the Android build and on-device LAN play.

## Type-checking without the editor

```
cd tools/tsc-check && npm install
..\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit
```

The harness ships a typed `cc` stub, so typos and missing fields in
gameplay classes are caught outside the editor.

## Controls (touch)

| Zone | Action |
|---|---|
| Left stick | Walk left/right, push up = jetpack thrust, pull down = drop through platform |
| Right stick | Aim in any direction; push past 30% to fire |
| `| |` button (top-left) | Pause / results |

## Project layout

```
docs/FINDINGS.md      reverse-engineering notes on the original's architecture
game/assets/scripts/
  GameRoot.ts         menu -> match -> results phase machine
  core/               tuning constants, event bus, pooling, utils
  data/               weapons, characters, maps, EN+AM strings
  world/              TileWorld: parsing, collision, raycasts, rendering
  gameplay/           Fighter, ProjectileSystem, WeaponCrate, MatchManager
  ai/                 bot FSM brain
  input/              dual-stick touch + desktop keyboard/mouse
  net/                LanClient for LAN rooms (relay protocol)
  ui/                 code-built main menu and HUD
tools/lan-relay.mjs   zero-dependency LAN room relay (node tools/lan-relay.mjs)
tools/tsc-check/      standalone TypeScript sanity harness (typed cc stub)
```

## Roadmap

- Hand-drawn sprite atlases replacing the procedural Graphics look
- Sound effects and music wired through the existing event bus
- Team modes, more bots per match, ranked scoring persistence

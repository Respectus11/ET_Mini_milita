# ET Mini Militia (ኢቲ ሚኒ ሚሊሻ)

An original 2D jetpack shooter for mobile, inspired by the feel of classic
Mini Militia but built from scratch — original code, original procedural art,
original text — with Ethiopian identity at its core. Built with **Cocos
Creator 3.8**, the same engine family as the original game.

> Legal note: this project contains **nothing** extracted from Appsomniacs'
> Mini Militia. The `reference/` folder (git-ignored) is local-only study
> material about how the original is engineered; see `docs/FINDINGS.md`.

## Features

- Jetpack + dual-stick combat loop with custom AABB physics vs tile grids
- Four weapons: Rifle, Shotgun, Sniper, Grenade Launcher (splash damage)
- Weapon crates scattered on every map grant a random full-magazine weapon
- Melee lunges, one-way platforms, drop-through floors, jetpack fuel economy
- Bot AI: patrol / chase / attack / retreat states with line-of-sight checks
- Four battlefields: ላሊበላ Lalibela, ስሜን Simien, መርካቶ Merkato, ዳናኪል Danakil
- Full **English / አማርኛ** interface toggle, persisted between sessions
- Modes: vs Bots, and Two Players on the same device (split touch zones)
- Frag-limit and timed matches, respawns, results screen, rematch flow

## Quick start

1. Install [Cocos Creator 3.8.x](https://www.cocos.com/en/creator-download)
   via Cocos Dashboard.
2. Open this repo's `game/` folder as a project.
3. Create an empty scene (`assets/main.scene`), select any node under the
   Canvas, and add the **GameRoot** component.
4. Press Play. Desktop testing uses WASD + mouse; touch devices get the
   dual-stick overlay automatically.

Full Android build instructions live in [`BUILD.md`](BUILD.md).

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
  ui/                 code-built main menu and HUD
tools/tsc-check/      standalone TypeScript sanity harness (cc module stubbed)
```

## Roadmap

- Hand-drawn sprite atlases replacing the procedural Graphics look
- LAN multiplayer rooms over WebSockets
- Team modes, more bots per match, persistent player profile
- Sound effects and music wired through the existing event bus

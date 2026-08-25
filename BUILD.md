# ET_Mini_Militia — Build & Run Guide

An original 2D jetpack shooter inspired by Mini Militia, built with Cocos Creator 3.8
(the same engine family as the original game) with Ethiopian identity.
All code, art (procedural), and text are original. Nothing is copied from Appsomniacs.

## What's implemented
- Jetpack + dual-stick combat core loop (custom AABB physics vs tile grid)
- 4 weapons: Rifle / Shotgun / Sniper / Grenade Launcher (splash damage)
- Weapon crates on the map grant a random full-magazine weapon
- Melee attack when close, jetpack fuel management, one-way platforms
- Bot AI: patrol → chase → attack → retreat, line-of-sight checks
- 4 maps: ላሊበላ Lalibela, ስሜን Simien, መርካቶ Merkato, ዳናኪል Danakil
- English / አማርኛ full UI toggle (persisted between sessions)
- Modes: vs Bot, Two Players on same device (split touch zones)
- Frag limit win condition + match timer + results screen

## Run it in the editor (2 minutes)
1. Install [Cocos Creator 3.8.x](https://www.cocos.com/en/creator-download)
   via Cocos Dashboard (the editor is NOT bundled in this repo anymore).
2. Dashboard ▸ Projects ▸ Add ▸ select this repo's `game/` folder.
3. First open imports scripts and generates `.meta` files — wait for it.
4. `assets/main.scene` already exists with a **GameRoot** node wired up;
   just double-click it and press ▶ Preview (browser).
5. Desktop preview supports WASD/Arrows + Space to fly, left-mouse to
   aim/fire, R to reload — but phones are the primary target.

## Test on an Android device (recommended)
1. Follow the APK build below and install it on your phone, OR use
   Creator's Preview ▸ scan-the-QRCode flow for on-device testing.
2. Touch controls activate automatically: left half = move/jetpack stick,
   right half = aim/fire stick.

## LAN multiplayer between two phones
1. On a PC (or any always-on device on the same Wi-Fi) run the zero-dependency
   relay from the repo root:
   ```
   node tools/lan-relay.mjs            # default port 9420
   ```
   It prints addresses like `ws://192.168.1.23:9420`.
2. Phone A: Menu ▸ አስተናጋጅ (LAN Host) → paste the address → CREATE ROOM →
   share the 4-letter code.
3. Phone B: Menu ▸ ተቀላቀል (LAN Join) → same address → enter the code.
4. Host picks map/characters and presses START MATCH. The host simulates;
   the guest mirrors snapshots (~15 Hz) and streams inputs (~30 Hz).

## Build the Android APK
1. Dashboard ▸ Installs ▸ install editor's Android build support if prompted;
   install Android Studio (SDK 33+, NDK r23+, JDK 17) and set paths in
   Preferences ▸ Native Develop.
2. Project ▸ Build: platform **android**, fill package name e.g. `com.et.mminimilitia`.
3. Build → the APK lands in `build/android/proj/build/outputs/apk/...`
   (debug-signed by default; use Keystore settings for release).

## Where things live
```
game/assets/scripts/
  GameRoot.ts            bootstraps menu→match→results state machine
  core/                  config constants, event bus, pooling, utils, storage
  data/                  weapons, characters, maps, EN/AM string tables
  world/TileWorld.ts     ASCII-map → collision grid + renderer + raycasts
  gameplay/              Fighter, ProjectileSystem, PickupItem, MatchManager
  ai/BotBrain.ts         bot FSM
  input/                 dual-stick touch + desktop keyboard/mouse
  net/LanClient.ts       WebSocket relay client for LAN rooms
  ui/                    MainMenu, GameHUD (all drawn via Graphics — no art files)
tools/lan-relay.mjs      zero-dependency LAN room relay server
tools/tsc-check/         standalone TypeScript sanity harness (typed cc stub)
```

## Adding content
- New map: add an entry to `data/Maps.ts` (ASCII grid, legend at top of file).
  Grid is 30×16 tiles of 64px = exactly one screen. Markers: spawns `P/Q/E`,
  weapon crate `W`, pickups `B` (buna speed) / `I` (injera heal) /
  `M` (mesob shield).
- New weapon: add to `WEAPONS` in `data/Weapons.ts` and reference from a crate.
- New character: add to `CHARACTERS` in `data/Characters.ts` with colors + name keys
  in both language tables.
- Amharic strings: edit the `am` table in `data/Strings.ts`.

## Roadmap (next phases)
- Real sprite art atlases replacing procedural Graphics rendering
- LAN multiplayer rooms (WebSocket relay or native sockets)
- More bots per match, team modes, ranked scoring persistence
- Sound effects + music (hook points already exist via bus events)

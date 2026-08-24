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
1. Open Cocos Dashboard → Projects → Add → select `C:\Projects\Games\ET_Mini_Milita\game`
   (or open `game/` directly with Creator 3.8.x).
2. First open will import scripts and generate `.meta` files — wait for it to finish.
3. Create a scene: File ▸ New Scene ▸ Empty, save as `assets/main.scene`.
4. In the Hierarchy select the Canvas node, then in Properties click
   **Add Component ▸ Custom Script ▸ GameRoot**.
5. Press ▶ Preview (browser). Desktop testing supports WASD/Arrows + Space to fly,
   mouse to aim/fire, R to reload.

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
  core/                  config constants, event bus, pooling, utils
  data/                  weapons, characters, maps, EN/AM string tables
  world/TileWorld.ts     ASCII-map → collision grid + renderer + raycasts
  gameplay/              Fighter, ProjectileSystem, PickupItem, MatchManager
  ai/BotBrain.ts         bot FSM
  input/                 dual-stick touch + desktop keyboard/mouse
  ui/                    MainMenu, GameHUD (all drawn via Graphics — no art files)
```

## Adding content
- New map: add an entry to `data/Maps.ts` (ASCII grid, legend at top of file).
  Grid is 30×16 tiles of 64px = exactly one screen.
- New weapon: add to `WEAPONS` in `data/Weapons.ts` and reference from a crate.
- New character: add to `CHARACTERS` in `data/Characters.ts` with colors + name keys
  in both language tables.
- Amharic strings: edit the `am` table in `data/Strings.ts`.

## Roadmap (next phases)
- Real sprite art atlases replacing procedural Graphics rendering
- LAN multiplayer rooms (WebSocket relay or native sockets)
- More bots per match, team modes, ranked scoring persistence
- Sound effects + music (hook points already exist via bus events)

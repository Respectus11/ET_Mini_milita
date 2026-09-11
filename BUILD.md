# ET_Mini_Militia — Build & Run Guide

An original 2D jetpack shooter inspired by Mini Militia, built with Cocos Creator 3.8
(the same engine family as the original game) with Ethiopian identity.
All code, art (procedural), and text are original. Nothing is copied from Appsomniacs.

## What's implemented
- Jetpack + dual-stick combat core loop (custom AABB physics vs tile grid)
- 8 weapons: Rifle, Shotgun, Sniper, Grenade Launcher, SMG, Magnum, Plasma Gun, Flamethrower
- Tactical throwable grenades, dual-wielding, and interactive explosive steel barrels
- Physical dropped weapons upon fighter death with despawn warning halos
- Wall-sliding physics, vertical wall-jumping, and out-of-combat HP regeneration
- Weapon crates on the map grant random full-magazine weapons
- Melee punch button, jetpack fuel management, one-way platforms, and drop-through floors
- Bot AI: Easy, Normal, and Hard difficulties with predictive lead aiming and smart item scavenging
- 5 maps: Lalibela, Simien, Merkato, Danakil, and Addis Arena (night urban tower)
- Roster of 6 customizable fighters (Abebe, Almaz, Desta, Hanna, Kebede, Mekdes)
- Full English interface
- Modes: vs Bots (1-6 opponents), Two Players on same device (split touch zones), LAN multiplayer
- Match Settings: configurable bot count, AI difficulty, frag limits, and match duration
- Procedural Web Audio synthesizer (weapons, flamethrower, wall slide, explosions, jetpack, hits, pickups, countdown, victory)
- Zero-asset juice engine: pooled VFX particles, floating damage/KO text, screen shake, squash & stretch
- Frag limit win condition + match timer + countdown sequence + results screen

## Run it in the editor (2 minutes)
1. Install [Cocos Creator 3.8.x](https://www.cocos.com/en/creator-download)
   via Cocos Dashboard (the editor is NOT bundled in this repo anymore).
2. Dashboard ▸ Projects ▸ Add ▸ select this repo's `game/` folder.
3. First open imports scripts and verifies `.meta` files.
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
2. Phone A: Menu ▸ LAN Host → paste the address → CREATE ROOM →
   share the 4-letter code.
3. Phone B: Menu ▸ LAN Join → same address → enter the code.
4. Host picks map/characters and presses START MATCH. The host simulates;
   the guest mirrors snapshots (~15 Hz) and streams inputs (~30 Hz).

## Build the Android APK
1. Dashboard ▸ Installs ▸ install editor's Android build support if prompted;
   install Android Studio (SDK 33+, NDK r23+, JDK 17) and set paths in
   Preferences ▸ Native Develop.
2. Project ▸ Build: platform **android**, fill package name e.g. `com.et.mminimilitia`.
3. Android platform options — get ALL THREE right or phones break:
   - **APP ABIs**: check *both* `armeabi-v7a` AND `arm64-v8a`. An arm64-only
     APK cannot run at all on 32-bit phones ("App not installed" / closes
     instantly) — older and budget devices are usually 32-bit.
   - **Render Backend**: keep GLES3 **and** GLES2 both checked. The engine
     prefers GLES3 and falls back at runtime on devices with buggy drivers.
     Never build GLES2-only on Creator 3.8.6 — that engine configuration
     fails to compile (`Quad.cpp` / `Profiler.cpp` errors).
   - **Debug**: leave unchecked for on-device testing. Debug builds boot
     very slowly on low-end phones (long black screen) and use far more
     RAM. Check it only when you need verbose on-device logging.
4. Build → the APK lands in `build/android/proj/build/outputs/apk/...`
   (debug-signed by default; use Keystore settings for release).

## Troubleshooting on phones

| Symptom | Likely cause & fix |
|---|---|
| "App not installed", or the app closes instantly on some phones | APK built with only `arm64-v8a` — rebuild with both ABIs checked (step 3 above). Verify a device with `adb shell getprop ro.product.cpu.abi`. |
| Opens into a permanent black screen | Rebuild in **release** (Debug unchecked) and test again; debug V8 + unoptimized engine takes very long on low-end devices. |
| Black screen, no information | Since this fix, any startup error paints its message on screen instead — rebuild, screenshot that text and report it. Script errors are tagged `[ETMM]` in the console/`adb logcat` output. |
| Blank/glitched world on one particular GPU | Keep the GLES2 runtime fallback enabled (Render Backend: GLES3 + GLES2 both checked). |
| Testing in a phone browser | Build platform **web-mobile** — `web-desktop` targets mouse/desktop layouts. |
| APK too big | Project Settings ▸ Physics ▸ **Physics Engine = Builtin**: the game uses its own AABB physics, this drops the bundled bullet/ammo wasm without affecting gameplay. |

## Where things live
```
game/assets/scripts/
  GameRoot.ts            bootstraps menu→match→results state machine + error trap
  core/                  config constants, event bus, pooling, utils, storage, Audio, Motion, Settings, Theme
  data/                  weapons, characters, maps, English string tables
  world/                 TileWorld, Effects (particle engine), ScreenShake
  gameplay/              Fighter, ProjectileSystem, PickupItem, WeaponCrate, MatchManager, GunArt
  ai/BotBrain.ts         bot FSM
  input/                 dual-stick touch + desktop keyboard/mouse
  net/LanClient.ts       WebSocket relay client for LAN rooms
  ui/                    MainMenu, GameHUD (all drawn via Graphics — zero art assets)
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
  in `data/Strings.ts`.

## Roadmap (next phases)
- Real sprite art atlases replacing procedural Graphics rendering
- More bots per match, team modes, ranked scoring persistence
- Background music tracks

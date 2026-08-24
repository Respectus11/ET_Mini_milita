# Mini Militia 5.6.0 — Reverse-Engineering Findings (Reference Study)

> Purpose: understand how the original is engineered so ET_Mini_Militia can be built
> with the same architecture but 100% original code/art/audio. Nothing from the
> original APK is copied into our game.

## Package facts
| Item | Value |
|---|---|
| Package | `com.appsomniacs.da2` |
| Version | 5.6.0 (versionCode 327) |
| Min SDK | 21 (Android 5.0) |
| Target SDK | 34 |
| Orientation | Landscape, locked (`singleTask`) |
| App class | `com.appsomniacs.da2.DA2Application` → activity `DA2Activity` |

## Engine stack (confirmed)
- **Cocos2d-x** — native gameplay in `lib/armeabi-v7a/libcocos2dcpp.so` (in `config.armeabi_v7a.apk` split)
- **Java layer is tiny** (~10 classes): `DA2Activity` (Cocos bridge, ads, lifecycle), `DA2Application`, `NotificationBuilder`, `Utils`. All gameplay logic lives in C++.
- **UI layouts**: `.ccbi` files = CocosBuilder binary interface (e.g. `Settings.ccbi`, `StoreMenu.ccbi`)
- **Maps**: Tiled format `.tmx` + tilesets `.tsx` — **64×64 px tiles, 2px spacing, 2px margin**
- **Sprites**: cocos2d plist texture-atlases paired with PNGs (e.g. `menuTexture.plist` + `menuTexture.png`)
- **Character/FX animation**: Spine skeletal animations (`.skel` + `.atlas` + `.png`)
- **Audio**: plain `.wav` SFX, `.mp3` music
- **Fonts**: bundled TTFs (`NotoSans-Regular.ttf`, `NotoColorEmoji.ttf`, `SF-Pro-Display-Semibold.ttf`)

## Asset delivery system
- All game content ships inside the APK under `assets/unpack/`
- Multi-resolution pack system (`resourcePacksConfig.json`):
  - 360p = base (scale 1, no suffix)
  - 540p = 1.5x, suffix `-540p`, falls back to 360p
  - 720p = 2x … up to 2160p = 6x, each level falls back to the one below
- Integrity via per-resolution checksum plists in `checksums/_checksums<res>.plist`
- Practical takeaway for our build: ship one high-res atlas set and downscale, or implement the same suffix+fallback scheme.

## Map list observed (naming convention only)
Map_SoLong, Map_Subdivision, Map_Survival, Map_Suspension, Map_Training,
Map_Underground, Map_Undermine, Map_Vantage + `survival_new.tmx`,
`training_new.tmx`, `tutorial.tmx`.

## Weapon sounds observed (feature scope reference only)
mp5, uzi, tec9, tavor, xm8, rg6, shotgun, rocket, sniper-family, melee/saw,
throw/thrust, ricochet, reload, silencer.

## Modding feasibility verdict
- Swapping PNG/WAV files inside `assets/unpack/` = feasible (checksums must be updated).
- Adding new maps/weapons/UI = not feasible without the original C++ source;
  logic is compiled into `libcocos2dcpp.so`.
- Redistribution of any modified build = copyright infringement. Personal study only.
- Conclusion: build ET_Mini_Militia from scratch on the same engine family (Cocos),
  replicating architecture: Tiled 64px maps, dual-stick jetpack combat, local MP.

## Architecture blueprint for ET_Mini_Militia (mirrors original patterns, original implementation)
```
game/
  assets/
    scripts/          # TypeScript gameplay modules (our own)
      core/           # game loop helpers, object pools, state machine
      player/         # jetpack controller, dual-stick touch input
      weapons/        # data-driven weapon defs + projectile pool
      ai/             # bot state machine (patrol/chase/shoot/retreat)
      i18n/           # EN/አማርኛ string tables, font manager
      net/            # LAN room host/join (WebSocket), same-device MP
      ui/             # HUD, menus, match results
    resources/
      maps/           # Tiled .tmx, 64px tiles (Lalibela/Simien/Merkato/Danakil)
      textures/       # original art atlases
      fonts/          # NotoSansEthiopic-Regular.ttf (OFL licensed - free)
      audio/          # original sfx/music
```

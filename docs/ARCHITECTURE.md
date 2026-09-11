# ET Mini Militia — Architecture & Subsystems Technical Guide

This document outlines the technical architecture, design patterns, and subsystem
implementations powering **ET Mini Militia**, built using **Cocos Creator 3.8** and TypeScript.

---

## 1. High-Level System Architecture

ET Mini Militia utilizes a component-based architecture decoupled through an internal event bus (`core/EventBus.ts`).
The entire game runs on custom lightweight 2D AABB physics, vector graphics, and procedural Web Audio.

```
┌────────────────────────────────────────────────────────────────────────┐
│                              GameRoot                                  │
│                 (Master Phase Machine: Menu ↔ Match ↔ Results)        │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
         ┌──────────▼──────────┐          ┌──────────▼──────────┐
         │      MainMenu       │          │    MatchManager     │
         │ (UI, Outfits, Match │          │ (Simulation Root &  │
         │  Settings, LAN Hub) │          │  Entity Lifecycle)  │
         └─────────────────────┘          └──────────┬──────────┘
                                                     │
       ┌───────────────────────────────┬─────────────┴─────────────────┬───────────────────────────────┐
       │                               │                               │                               │
┌──────▼──────┐                 ┌──────▼──────┐                 ┌──────▼──────┐                 ┌──────▼──────┐
│  TileWorld  │                 │   Fighter   │                 │ Projectiles │                 │  BotBrain   │
│ (AABB Grid, │                 │ (Kinematics,│                 │ & Explosions│                 │ (FSM & Lead │
│ Raycasting) │                 │ Wall-Slide) │                 │  (Pools)    │                 │ Predictive) │
└─────────────┘                 └─────────────┘                 └─────────────┘                 └─────────────┘
```

---

## 2. Locomotion & Physics Engine (`gameplay/Fighter.ts`, `world/TileWorld.ts`)

### Custom AABB Collision vs 64px Tile Grids
Rather than loading heavyweight third-party physics engines (e.g., Box2D or Bullet Wasm), the game employs a deterministic integer-tile spatial partitioning system:
- **World Coordinate Mapping**: World position `(x, y)` converts to tile indices via `Math.floor(x / 64)` and `Math.floor(y / 64)`.
- **One-Way Platforms (`-`)**: Detected during downward raycasts; downward stick deflection toggles a drop-through flag allowing fighters to fall to lower tiers.
- **Wall Sliding & Wall Kicking**:
  - Horizontal collision checks identify whether a falling combatant is pressed against a vertical boundary (`wallDir = -1` or `+1`).
  - Terminal fall velocity is clamped while sliding (`vy = Math.max(vy, -180)`), triggering procedural wall-scrape sound FX and dust particles.
  - Jumping while in a wall-slide initiates a directional wall-kick (`vx = -wallDir * 320, vy = 420`) enabling vertical shaft navigation.

---

## 3. Combat Mechanics & Ballistics (`gameplay/Projectile.ts`, `gameplay/DroppedWeapon.ts`)

### Weapon Definitions (`data/Weapons.ts`)
Weapons are data-driven structures specifying damage, pellet count, rate of fire, spread angle, muzzle speed, magazine capacity, and gravity scaling.
- **Flamethrower (`w_flamethrower`)**: High rof (18 rps) firing 3 expanding flame particles per burst with downward gravity arcs.
- **Sniper (`w_sniper`)**: High muzzle velocity (2400 px/s), piercing, and extended laser sight line (750 px).
- **Dual Wielding**: Equipping identical weapons enables simultaneous firing stances with increased horizontal weapon separation.

### Physical Dropped Weapons
When a fighter is eliminated in combat:
1. An on-death hook triggers in `MatchManager.ts`.
2. A `DroppedWeapon` entity is instantiated, receiving a random ejection impulse.
3. The weapon bounces against solid tile floors, draws an illuminated accent halo, and blinks before expiring after 18 seconds.
4. Any surviving fighter passing over the entity collects it automatically.

### Out-of-Combat Health Regeneration
Replicating the classic Mini Militia tactical pacing:
- Combat damage sets an out-of-combat cooldown (`regenDelay = 4.0s`).
- Once out of combat, the fighter recovers health at a continuous rate of 4 HP/sec until reaching max HP (100).
- The player HUD health bar pulses green while active regeneration occurs.

---

## 4. Artificial Intelligence Subsystem (`ai/BotBrain.ts`)

The bot AI utilizes a tactical Finite State Machine (FSM) executing at 30-60 Hz:

### FSM States:
- **PATROL**: Wanders the arena platforms, jumping or jetpacking over obstacles.
- **CHASE**: Closes distance toward the nearest enemy using line-of-sight raycasts.
- **ATTACK**: Engages enemies with weapons, tactical strafing, and elevation management.
- **RETREAT**: Flees when HP is low (<30%), drops defensive grenades behind, and seeks health items.

### Multi-Tier Difficulty Profiles:
- **Easy**: High aim error variance, delayed reaction times, no velocity prediction.
- **Normal**: Moderate accuracy, tactical melee lunges, basic cover usage.
- **Hard**:
  - **Predictive Aim**: Calculates bullet flight time `t = dist / bulletSpeed` and targets predicted enemy coordinates `(x + vx * t, y + vy * t + 18)`.
  - **Tactical Scavenging**: Proactively searches for Injera heals and weapon crates when depleted.
  - **Corner Grenade Tosses**: Detects when foes are boxed against walls and lofts grenades with arc compensation.

---

## 5. Procedural Graphics Pipeline (`core/FighterArt.ts`, `gameplay/GunArt.ts`)

To keep APK size minimal (~40MB) and load instantly:
- **Vector Fighter Rig**: Drawn entirely via `cc.Graphics` paths without raster sprites.
  - Authentic Mini Militia grimace ("++" stitch teeth, black outline).
  - Wrap-around jaw beard and expressive cartoon eyes with pupil catch-lights.
  - Tactical military helmet featuring the Ethiopian tricolor ribbon (Green, Yellow, Red).
  - Combat rocket boots with tread soles and layered plasma thrust plumes.
- **Dynamic Laser Sights**: Attached as a child node on the gun barrel, dynamically rotating and changing color based on weapon class (Green = Sniper, Cyan = Plasma, Red = Ballistic).

---

## 6. Procedural Audio Engine (`core/Audio.ts`)

Zero-asset sound synthesis powered by the Web Audio API:
- **Tone Generators**: Frequency modulators on sawtooth and square waves for laser/jetpack sounds.
- **Noise Buffers**: Filtered white noise bursts with custom bandpass cutoffs for explosions, gunfire, and wall sliding.
- **Audio Playback Throttling**: Sound events (e.g. wall scrape, jet thrust) are throttled via timestamp comparisons to prevent Web Audio buffer saturation.

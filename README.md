# ET Mini Militia

An original 2D jetpack shooter prototype for mobile, built with **Cocos Creator 3.8** and TypeScript. The project combines fast platform movement, arena combat, bot opponents, and local-network multiplayer with Ethiopian-inspired maps and characters.

The code, procedural graphics, and text in this repository are original. The project does not include extracted game assets or source code from Appsomniacs' Mini Militia.

## Features

### Combat and movement
- Jetpack movement with fuel management, wall sliding, and wall jumps
- Dual-stick aiming and firing, melee attacks, grenades, and dual-wielding
- Eight weapon types, weapon crates, physical weapon drops, and explosive barrels
- Headshot criticals, killstreak announcements, health regeneration, and respawns

### Game modes and content
- Matches against 1–6 bots, with Easy, Normal, and Hard difficulty settings
- Two players on one device and local-network multiplayer
- Match settings for bot count, AI difficulty, frag limit, and match duration
- Five maps: Lalibela, Simien, Merkato, Danakil, and Addis Arena
- Six selectable fighters: Abebe, Almaz, Desta, Hanna, Kebede, and Mekdes
- Match countdown, results screen, and rematch flow

### Technical highlights
- Custom 2D AABB collision and tile-grid world logic
- Bot AI with state-based behavior, predictive aiming, and item scavenging
- Procedural graphics and synthesized sound effects
- LAN room relay implemented in Node.js without third-party runtime dependencies
- Standalone TypeScript checking harness

## Requirements

- [Cocos Creator 3.8.x](https://www.cocos.com/en/creator-download)
- Node.js for the optional LAN relay and TypeScript check
- Android Studio, Android SDK/NDK, and JDK 17 when building a native Android package

## Run in Cocos Creator

1. Install Cocos Creator 3.8.x through the Cocos Dashboard.
2. Open the repository's `game/` directory as a project.
3. Open `assets/main.scene`.
4. Start the preview from the editor.

Desktop preview supports keyboard and mouse controls. Touch devices use the on-screen dual-stick controls. The game is primarily designed for phones.

## Controls

| Input | Action |
| --- | --- |
| Left movement stick | Move left or right |
| Push up on the left stick | Use the jetpack |
| Pull down on the left stick | Drop through a one-way platform |
| Right stick | Aim and fire |
| Fist button | Melee attack |
| Grenade button | Throw a grenade |
| Pause/settings button | Pause or configure the match |

For desktop preview, use WASD or arrow keys to move, Space to fly, the mouse to aim/fire, and R to reload.

## Local-network multiplayer

The relay pairs two game clients on the same local network. It is not a public matchmaking service.

1. Connect both phones and the computer running the relay to the same Wi-Fi network.
2. From the repository root, start the relay:

   ```bash
   node tools/lan-relay.mjs
   ```

   The default port is `9420`. To use a different port, pass it as an argument, for example `node tools/lan-relay.mjs 9500`.

3. Use one of the printed `ws://<local-ip>:9420` addresses on both devices.
4. On the first phone, choose **LAN Host** and create a room.
5. On the second phone, choose **LAN Join** and enter the room code.

Allow the selected port through the host computer's firewall if the devices cannot connect.

## Type-checking

The standalone harness can check the game's TypeScript files without opening the editor:

```bash
cd tools/tsc-check
npm install
npx tsc -p tsconfig.json --noEmit
```

## Project layout

```text
docs/
  ARCHITECTURE.md     System design and subsystem notes
  FINDINGS.md         Research and implementation notes
game/assets/
  main.scene          Main Cocos Creator scene
  scripts/
    GameRoot.ts       Main menu, match, and results flow
    ai/               Bot decision-making
    core/             Configuration, events, settings, audio, utilities
    data/             Weapon, character, map, and string definitions
    gameplay/         Fighters, weapons, projectiles, and match logic
    net/              LAN client
    ui/               Menu and in-game interface
    world/            Tile-based world and collision logic
tools/
  lan-relay.mjs       Local multiplayer room relay
  tsc-check/          Standalone type-checking harness
BUILD.md              Android build and device-testing instructions
```

## Build for Android

See [BUILD.md](BUILD.md) for the Android build configuration, device testing, and troubleshooting steps. Native builds require the Android build tools supported by your installed Cocos Creator version.

## Roadmap

The project is under active development. Potential next steps include improving the visual asset pipeline, expanding game modes, and refining LAN synchronization.

## License

A license file is not currently included in the repository. Confirm the intended license before redistributing the project.

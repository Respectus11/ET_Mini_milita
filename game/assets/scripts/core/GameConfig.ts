/**
 * GameConfig.ts
 * ---------------------------------------------------------------------------
 * Single source of truth for every gameplay tuning constant.
 *
 * All units are pixels / seconds in a 1920x1080 design space where one
 * tile is 64 px. Designers should feel free to tweak values here without
 * touching gameplay code — everything reads from CFG at runtime.
 */
export const CFG = {
    // --- virtual canvas ---------------------------------------------------
    DESIGN_W: 1920,          // design resolution width (px)
    DESIGN_H: 1080,          // design resolution height (px)
    TILE: 64,                // edge length of one map tile (px)

    // --- physics ----------------------------------------------------------
    GRAVITY: 2400,           // downward acceleration (px/s^2)
    MOVE_SPEED: 380,         // horizontal run speed (px/s)
    JETPACK_THRUST: 5000,    // upward acceleration while thrusting (px/s^2)
    JETPACK_MAX_FUEL: 100,   // fuel tank capacity (arbitrary units)
    JETPACK_DRAIN: 38,       // fuel burned per second while thrusting
    JETPACK_REGEN: 34,       // fuel regenerated per second while idle
    JETPACK_REGEN_DELAY: 0.5,// seconds after release before regen kicks in

    // --- fighter body -----------------------------------------------------
    PLAYER_W: 40,            // collision box width
    PLAYER_H: 62,            // collision box height

    // --- combat & match flow ---------------------------------------------
    MAX_HP: 100,             // full health of a fighter
    RESPAWN_TIME: 2.5,       // seconds dead before respawning
    INVULN_AFTER_SPAWN: 2.0, // blink-invulnerability window after spawn

    FRAG_LIMIT: 10,          // kills needed to win the match outright
    MATCH_TIME: 240,         // match duration in seconds (4 minutes)
    CRATE_RESPAWN: 15,       // seconds for a taken weapon crate to reappear

    // --- melee ------------------------------------------------------------
    MELEE_RANGE: 95,         // max reach of a melee swipe from body center (px)
    MELEE_DMG: 22,           // melee damage
    MELEE_CD: 0.55,          // cooldown between melee swipes (s)

    BOT_COUNT: 1,            // AI opponents spawned in solo mode
};

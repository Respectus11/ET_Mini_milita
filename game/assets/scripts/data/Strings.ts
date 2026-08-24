/**
 * Strings.ts
 * ---------------------------------------------------------------------------
 * Bilingual UI strings: English (en) and Amharic (am, አማርኛ).
 * The selected language persists via localStorage and every UI surface calls
 * t(key) at draw time, so toggling language instantly re-renders all labels.
 *
 * To add a string: put it in BOTH tables. Fallback order is current -> en.
 */
export type Lang = 'en' | 'am';

const en: Record<string, string> = {
    game_title: 'ET MINI MILITIA',
    play_bots: 'Play vs Bots',
    play_2p: 'Two Players (Same Device)',
    language: 'አማርኛ',
    map_select: 'Select Map',
    map_lalibela: 'Lalibela',
    map_simien: 'Simien Mountains',
    map_merkato: 'Merkato Rooftops',
    map_danakil: 'Danakil Salt Flats',
    frag_limit: 'Frag Limit',
    time_limit: 'Time Limit',
    start: 'START',
    back: 'Back',
    paused: 'Paused',
    resume: 'Resume',
    quit: 'Quit to Menu',
    you_win: 'Victory!',
    you_lose: 'Defeat!',
    p1_wins: 'Player 1 Wins!',
    p2_wins: 'Player 2 Wins!',
    rematch: 'Rematch',
    menu: 'Menu',
    w_rifle: 'Rifle',
    w_shotgun: 'Shotgun',
    w_sniper: 'Sniper',
    w_launcher: 'Grenade Launcher',
    fists: 'Fists',
    char_abebe: 'Abebe',
    char_almaz: 'Almaz',
    char_desta: 'Desta',
    char_hanna: 'Hanna',
    choose_char_p1: 'P1 Character',
    choose_char_p2: 'P2 Character',
    lan_host: 'LAN Host',
    lan_join: 'LAN Join',
    lan_title: 'LAN Multiplayer',
    relay_addr: 'Relay address',
    room_code: 'Room code',
    create_room: 'CREATE ROOM',
    join_room: 'JOIN ROOM',
    start_match: 'START MATCH',
    waiting_relay: 'Connecting to relay…',
    waiting_peer: 'Waiting for opponent…',
    peer_found: 'Opponent connected!',
    bad_code: 'Wrong room code',
    room_full: 'Room is full',
    connect_fail: 'Could not reach relay',
    opp_left: 'Opponent left!',
    relay_hint: 'Run:  node tools/lan-relay.mjs  then use a printed address, e.g. ws://192.168.1.10:9420',
};

const am: Record<string, string> = {
    game_title: 'ኢቲ ሚኒ ሚሊሻ',
    play_bots: 'ከሰው ሰራሽ ጋር ተጫወት',
    play_2p: 'ሁለት ተጫዋቾች (በአንድ ስልክ)',
    language: 'English',
    map_select: 'የጦርነት ስፍራ ይምረጡ',
    map_lalibela: 'ላሊበላ',
    map_simien: 'ስሜን ተራራማ',
    map_merkato: 'መርካቶ ጣ᪃ዎች',
    map_danakil: 'ዳናኪል ጨው ሜዳ',
    frag_limit: 'የድል ውጤት',
    time_limit: 'የጊዜ ገደብ',
    start: 'ጀምር',
    back: 'ተመለስ',
    paused: 'ለአፍታ ቆሟል',
    resume: 'ቀጥል',
    quit: 'ወደ ሜኑ ተመለስ',
    you_win: 'አሸነፍክ!',
    you_lose: 'ተሸንፈህ!',
    p1_wins: 'ተጫዋች 1 አሸነፈ!',
    p2_wins: 'ተጫዋች 2 አሸነፈ!',
    rematch: 'እንደገና ተጫወት',
    menu: 'ሜኑ',
    w_rifle: 'ሬፈል',
    w_shotgun: 'ሾትጋን',
    w_sniper: 'ስናይፐር',
    w_launcher: 'ቦምብ መወርወሪያ',
    fists: 'እጆች',
    char_abebe: 'አበበ',
    char_almaz: 'አልማዝ',
    char_desta: 'ደስታ',
    char_hanna: 'ሐና',
    choose_char_p1: 'የተጫዋች 1 ተውኔት',
    choose_char_p2: 'የተጫዋች 2 ተውኔት',
    lan_host: 'አስተናጋጅ (LAN)',
    lan_join: 'ተቀላቀል (LAN)',
    lan_title: 'የአውታረ መረብ ጨዋታ',
    relay_addr: 'የሪሌ አድራሻ',
    room_code: 'የክፍል ኮድ',
    create_room: 'ክፍል ፍጠር',
    join_room: 'ክፍል ተቀላቀል',
    start_match: 'ጨዋታ ጀምር',
    waiting_relay: 'ከሪሌ ጋር በመገናኘት ላይ…',
    waiting_peer: 'ለተጫዋች በመጠባበቅ ላይ…',
    peer_found: 'ተጫዋች ተገናኘ!',
    bad_code: 'ተሳሳተ ኮድ',
    room_full: 'ክፍሉ ሙሏል',
    connect_fail: 'ከሪሌ መገናኘት አልተቻለም',
    opp_left: 'ተጫዋቹ ወጥቷል!',
    relay_hint: 'ይሄን ያሂዱ፦  node tools/lan-relay.mjs  ከዚያ የታተመ አድራሻ ይጠቀሙ፣ ለምሳሌ ws://192.168.1.10:9420',
};

const tables: Record<Lang, Record<string, string>> = { en, am };

let current: Lang = 'en';

/** Restores the language saved by a previous session (safe on first run). */
export function loadLang() {
    const saved = localStorage.getItem('etmm_lang');
    if (saved === 'am' || saved === 'en') current = saved;
}

export function getLang(): Lang { return current; }

/** Switches language and remembers the choice across sessions. */
export function setLang(l: Lang) {
    current = l;
    try { localStorage.setItem('etmm_lang', l); } catch (e) { /* storage unavailable */ }
}

/** Translates a key with graceful fallback to the English table. */
export function t(key: string): string {
    return tables[current][key] ?? en[key] ?? key;
}

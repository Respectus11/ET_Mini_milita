/**
 * Maps.ts
 * ---------------------------------------------------------------------------
 * The four battlefields, authored as ASCII tile grids.
 *
 * Each grid is 30 columns x 16 rows of 64 px tiles = exactly 1920x1024,
 * i.e. one full screen — a deliberate v1 constraint that keeps local
 * same-device multiplayer fair (both players always see the whole arena).
 *
 * Legend:
 *   '#' solid block        '-' one-way platform (land from above only)
 *   'P' player-1 spawn     'Q' player-2 spawn
 *   'E' bot spawn point    'W' weapon crate (random weapon)
 *   'B' buna speed boost   'I' injera heal   'M' mesob shield
 */
import { Color } from 'cc';

export interface MapDef {
    id: string;
    nameKey: string;      // i18n key of the display name
    skyTop: Color;        // gradient top color
    skyBottom: Color;     // gradient bottom color
    tileFill: Color;      // terrain body color
    tileEdge: Color;      // terrain outline / platform color
    decoColor: Color;     // thin lip drawn on exposed tile tops
    rows: string[];
}

export const MAPS: MapDef[] = [
    // Rock-hewn corridors and pillars — tight vertical play around tunnels.
    {
        id: 'lalibela', nameKey: 'map_lalibela',
        skyTop: new Color(255, 236, 179),
        skyBottom: new Color(215, 164, 94),
        tileFill: new Color(146, 98, 57),
        tileEdge: new Color(104, 68, 38),
        decoColor: new Color(120, 78, 45),
        rows: [
            '..............................',
            '..E.......................E...',
            '####......####....###....####.',
            '......I..........M............',
            '...---..........----..........',
            '.P...........................Q',
            '#####..##...........##..######',
            '................W.............',
            '......---.........----........',
            '..#........................#..',
            '..#........................#..',
            '..#..#####...........######.#.',
            '..#........................#..',
            '....E.....B...........W....E..',
            '------------------------------',
            '##############################',
        ],
    },
    // Highland peaks and valleys — long sightlines reward the sniper.
    {
        id: 'simien', nameKey: 'map_simien',
        skyTop: new Color(144, 202, 249),
        skyBottom: new Color(197, 225, 165),
        tileFill: new Color(84, 110, 122),
        tileEdge: new Color(55, 71, 79),
        decoColor: new Color(46, 125, 50),
        rows: [
            '..............................',
            '..............W...............',
            '....E......########......E....',
            '...####................####...',
            '........---......---..........',
            '.P...........................Q',
            '#####.....##.....##.......####',
            '..............B.........W.....',
            '....##....--------....##......',
            '....M.........................',
            '..####..............######....',
            '............I.............E...',
            '.....----...####...----.......',
            '##############################',
            '##############################',
            '##############################',
        ],
    },
    // Rooftop market chaos — layered buildings with drop-through gaps.
    {
        id: 'merkato', nameKey: 'map_merkato',
        skyTop: new Color(255, 171, 145),
        skyBottom: new Color(255, 224, 178),
        tileFill: new Color(109, 76, 65),
        tileEdge: new Color(78, 52, 46),
        decoColor: new Color(216, 27, 96),
        rows: [
            '..............................',
            '....................B.........',
            '.P...........E..............Q.',
            '.....#########....#######.....',
            '.....#........W...............',
            '..W..#........................',
            '#####.................########',
            '#####...####......####...#####',
            '...I..........................',
            '...------......-------........',
            '.E........................E...',
            '######..##############...#####',
            '..............M...............',
            '..........................W...',
            '#############...##############',
            '#############...##############',
        ],
    },
    // Open salt flats — sparse cover, fast horizontal brawls.
    {
        id: 'danakil', nameKey: 'map_danakil',
        skyTop: new Color(255, 245, 157),
        skyBottom: new Color(255, 255, 255),
        tileFill: new Color(230, 214, 144),
        tileEdge: new Color(190, 170, 100),
        decoColor: new Color(0, 151, 167),
        rows: [
            '..............................',
            '..............................',
            '..E.......................E...',
            '................B.............',
            '....##..........W........##...',
            '.P...........................Q',
            '..............................',
            '......----.....----...........',
            '..........I...................',
            '....######........######......',
            '.W............................',
            '####......................####',
            '........................M.....',
            '.....E.................E......',
            '------------------------------',
            '##############################',
        ],
    },
];

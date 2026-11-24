// Fine border outlines redrawn from the visible Wild Rag repeats. The centre
// seed is charted directly because the inner curl needs individual stitches.
// Trace the upright photograph on its camel face. Studio paints the fig face
// first and mirrors the fabric when turning it over.
const camelDrop = [
  '..####...',
  '.#....#..',
  '#..##..#.',
  '#.#..#.#.',
  '.#.###.#.',
  '..#..#.#.',
  '...##..#.',
  '.....###.',
  '.......#.',
] as const;

export const seedDown = camelDrop.map((line) => [...line].reverse().join(''));
export const seedUp: readonly string[] = [...seedDown].reverse();

// Native size for the 846-course chart. Separate the flared tips with a
// one-stitch stem so the terminal pairs don't merge into bars when sampled.
export const borderCross = [
  '..###..',
  '...#...',
  '#..#..#',
  '#######',
  '#..#..#',
  '...#...',
  '..###..',
] as const;

export const diagonalBorderCross = [
  '.#.....#.',
  '###...###',
  '.#.#.#.#.',
  '....#....',
  '.#.#.#.#.',
  '###...###',
  '.#.....#.',
] as const;

// Coordinates follow the exposed camel slope in the supplied photograph,
// with the cloth edge below the leaves and the centre point to the right.
const longHook = `
  <path d="M229 72 Q222 60 234 53 C248 41 272 52 279 68 Q283 79 276 83
    C280 70 263 55 254 63 C245 69 249 82 254 90
    C262 105 289 99 310 111 C326 120 326 140 318 151
    C307 167 275 153 254 140 C236 128 224 100 226 81 Q226 76 229 72 Z"/>
  <path d="M233 77 C229 104 246 128 272 138 C288 145 304 146 310 137
    Q318 121 300 113 M255 64 Q267 57 269 72 Q267 78 263 74"/>
  <ellipse cx="284" cy="126" rx="6.5" ry="6"/>
  <path d="m232 100 -5 -1 m9 12 -6 -1 m12 12 -6 0 m17 11 -6 1
    m18 8 -5 3 m20 4 -4 4 m20 0 -3 4"/>
`;
const narrowHook = `
  <path d="M302 58 C312 50 331 55 344 61 C366 69 384 90 392 115
    C399 135 397 153 389 159 Q381 166 364 154 L349 147
    Q353 138 360 141 C367 124 351 104 336 100 L311 91
    Q293 86 295 72 Q295 63 302 58 Z"/>
  <path d="M315 88 Q302 80 307 71 C313 64 327 69 330 75 Q331 81 324 83
    Q317 84 315 77 M330 75 C352 76 373 99 382 128 Q388 145 380 153
    M361 141 Q371 151 374 135"/>
  <path d="m351 65 2 -4 m7 10 3 -4 m7 12 3 -4 m6 12 4 -3
    m2 13 5 -2 m0 14 5 -1 m-2 13 5 1 m-4 12 5 2"/>
`;
const inwardLeaf = `
  <path d="M405 64 Q417 52 433 58 Q445 62 448 77
    Q443 81 439 74 Q435 66 428 70 Q419 74 416 85
    C421 96 438 100 456 104 C480 109 487 122 481 139
    C475 155 456 156 439 148 C418 140 401 124 398 104
    Q393 81 405 64 Z"/>
  <path d="M415 78 C402 92 409 113 426 126 C444 141 466 144 470 129
    Q473 118 462 115 M400 76 Q393 67 384 65 Q380 65 379 70"/>
  <ellipse cx="451" cy="125" rx="6" ry="5.5"/>
  <path d="m405 63 0 -5 m8 2 2 -6 m7 5 3 -5 m5 7 4 -4 m-26 62 -5 0
    m14 9 -5 1 m14 7 -5 2 m15 5 -4 3"/>
`;
const uprightLeaf = `
  <path d="M537 43 C540 33 553 34 562 42 Q572 50 571 63
    C568 54 561 48 554 50 Q548 52 550 60 C551 70 561 82 563 97
    C566 113 571 132 569 150 Q563 167 542 164
    C523 164 499 154 490 143 Q478 130 489 117 C497 105 513 112 524 108
    Q534 104 529 90 C526 78 518 69 509 68 Q501 68 503 77
    Q507 82 513 77 Q511 86 502 85 C486 81 479 62 485 53
    C492 43 509 45 522 51 L536 59 Q531 52 537 43 Z"/>
  <path d="M496 57 C513 48 534 66 541 86 C548 105 551 128 551 143
    Q540 152 517 141 Q496 134 499 124"/>
  <ellipse cx="520" cy="127" rx="6.5" ry="5.5"/>
  <path d="m562 87 4 -3 m-1 14 5 -3 m-3 14 6 -3 m-4 13 6 -2 m-5 12 6 -1
    m-6 12 6 0 m-10 11 5 2 m-15 6 3 4"/>
`;
const slopeSprig = `
  <path d="M471 69 Q475 59 482 66 Q489 71 487 80 Q480 77 471 69 Z
    M486 84 Q476 82 474 94 Q481 99 488 90 Q495 102 503 96
    Q503 87 492 85 M490 81 Q496 75 491 69"/>
`;

export const slopeRepeat = `<g fill="none" stroke="white" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round">
  ${longHook}${narrowHook}
  ${inwardLeaf}${uprightLeaf}
  ${slopeSprig}
</g>`;

export const tieRepeat = `<g fill="none" stroke="white" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round">
  <g transform="translate(-166 0)">${inwardLeaf}${uprightLeaf}${slopeSprig}</g>
</g>`;

// Camel-face coordinates from the straight, unfolded portion of the repeat.
// The two outside leaves turn toward one another. Their small round eyes and
// the inward curls of the centre pair remain open in the size-6 chart.
const outerLeaf = `
  <path d="M29 44 C35 32 47 19 63 18 C80 16 96 29 100 43
    C106 62 94 78 84 71 C75 64 86 57 84 49
    C83 40 78 35 73 34 C59 31 48 45 48 65
    C47 86 60 102 78 111 C94 119 112 114 118 130
    C125 148 111 166 95 185 C85 198 75 200 61 193
    C36 184 18 156 11 129 C4 103 5 67 29 44 Z"/>
  <path d="M37 48 C26 68 20 92 25 116 C29 140 46 166 69 176
    Q77 180 85 172 C97 159 105 144 99 132 Q94 123 80 121"/>
  <ellipse cx="72" cy="132" rx="9.5" ry="12" fill="black"/>
  <path d="M29 44 Q19 29 13 39 M13 71 l-11 -4 5 10 Z M8 95 l-12 -2 7 9 Z
    M11 119 l-13 2 9 8 Z M19 144 l-13 4 10 5 Z M33 166 l-14 4 10 5 Z
    M50 184 l-12 5 12 3 Z"/>
`;

const sweptLeaf = `
  <path d="M108 68 C105 52 117 30 133 25 C148 20 166 30 176 40
    C194 55 201 81 198 104 C195 128 181 150 163 163
    C149 174 131 168 126 154 C120 138 130 124 143 125
    C156 125 163 140 155 148 C149 155 138 150 139 143 Q140 138 145 138"/>
  <path d="M163 151 C176 139 181 125 177 111 C174 97 163 86 151 82
    C139 78 128 88 117 82 Q109 79 108 68
    M119 66 C117 52 128 37 139 36 C154 35 169 46 178 61
    C191 82 192 109 182 129 M123 77 Q125 69 134 67
    M140 61 q7 -6 10 1 q2 6 -5 7"/>
  <path d="m176 40 7 -3 m1 13 8 -3 m-4 14 8 -2 m-5 15 9 -1
    m-6 15 9 1 m-10 13 8 2 m-12 12 8 4 m-14 8 6 5"/>
`;

const hookedLeaf = `
  <path d="M216 52 C213 39 210 27 218 28 Q225 27 234 45
    C244 45 250 28 265 26 C281 22 293 33 298 46
    C305 65 292 77 279 71 C267 66 268 51 279 49 Q289 47 289 57"/>
  <path d="M233 46 C227 50 227 56 231 62 C218 73 214 97 220 117 C226 137 242 147 253 162
    C264 177 275 185 291 179 C307 174 319 158 316 139
    C314 123 305 116 290 115 C277 115 268 111 261 100
    C249 83 246 67 255 52 Q265 36 280 44"/>
  <path d="M229 75 C220 97 231 121 248 133 C257 139 261 153 272 157
    C284 162 296 150 297 139 Q298 126 289 118
    M222 140 Q215 161 202 155 Q198 152 197 147"/>
  <ellipse cx="270" cy="123" rx="8" ry="10" fill="black"/>
`;

export const borderRepeat = `<g fill="none" stroke="white" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round">
  ${outerLeaf}${sweptLeaf}${hookedLeaf}
  <path d="M318 65 C307 56 310 40 315 26 Q330 45 323 63
    M316 73 C305 66 298 72 294 82 Q306 86 316 79
    M326 71 C337 63 348 70 352 80 Q340 86 329 80
    M322 83 Q327 94 319 100"/>
  <g transform="translate(443 -4) scale(-1 1)">${outerLeaf}</g>
</g>`;

// The exposed center of the dark scarf, turned upright. Chart one half at
// the cashmere gauge and reflect it around the center course pair.
const halfFinial = [
  '.................#...........',
  '...........#.....#...........',
  '...........#....#............',
  '......#...#########....#.....',
  '......#.###........##.#......',
  '......##.............##......',
  '.....#......#######....#.....',
  '....#.....##.......##...#....',
  '...#....##...........#...#...',
  '...#...#...##.........#..#...',
  '...#...#..#..#........#...#..',
  '..#...#...#.#..........#..#..',
  '..#...#................#..#..',
  '..#...#......######....#...#.',
  '..#....#...##......##...#..#.',
  '...#......#..........#..#..#.',
  '...#....##..............#..#.',
  '....####.........###...#..#..',
  '................#...#..#..#..',
  '...............#....#.#...#..',
  '...............#..##..#..#...',
  '...............#.........#...',
  '...............#........#...#',
  '................##....##...#.',
  '..................####.....#.',
  '..........................#..',
  '.........................#...',
  '..........................#..',
  '...........................#.',
  '............................#',
  '.............................',
  '.............................',
  '..................##.........',
  '.................#..##.......',
  '.................#..#.##.....',
  '.................#..#..######',
  '..................#.#.#...#..',
  '..................#...#..#...',
  '...................##....#...',
  '.....................###.....',
  '........................#####',
] as const;
export const pointOrnament = halfFinial.map(row => row + [...row].reverse().join(''));

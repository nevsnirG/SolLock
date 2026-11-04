// The SolLock mark: a padlock with an open shackle and two upward-tilted bars.
// The header logo (components/Logo.astro), the favicons (scripts/icons.mjs) and the
// Open Graph images (scripts/og.mjs) all draw it from here.

/** A square around the mark, in the coordinates the paths were drawn in. */
export const LOCK_BOX = { x: 187, y: 130, size: 910 } as const;

export const LOCK_PATHS = {
  shackle:
    'M405 395C405 263 507 159 642 159C778 159 887 260 887 392L887 445Q887 455 877 457L807 467Q798 468 798 460L798 392C798 307 732 246 642 246C557 246 495 308 495 392L495 486Q495 497 485 498L416 507Q405 508 405 498Z',
  upperBar:
    'M386 580L997 505Q1018 502 1027 519Q1032 531 1024 542L924 677Q915 689 897 693L295 773Q273 777 265 762Q260 753 269 739L359 601Q369 584 386 580Z',
  lowerBar:
    'M373 821L993 740Q1012 738 1020 753Q1025 764 1016 777L909 920Q900 933 882 937L276 1009Q255 1013 251 998Q249 990 257 978L349 840Q359 824 373 821Z',
} as const;

/** The colours it was drawn in: the light theme's ink, sun and brass. The bars keep theirs in both themes; only the shackle follows the ink. */
export const LOCK_COLOURS = { shackle: '#17130f', upperBar: '#f7a823', lowerBar: '#a8530a' } as const;

export const viewBox = ({ x, y, size }: { x: number; y: number; size: number }): string => `${x} ${y} ${size} ${size}`;

export interface LockSvgOptions {
  /** The shackle's fill; the bars keep their own colours. */
  shackle?: string;
  /** A dark edge around the shackle, in path units, so a light shackle still shows on a light tab bar. */
  edge?: number;
  /** A filled square behind the mark: its padding as a fraction of the mark's box, its corner radius as a fraction of its own side. */
  tile?: { fill: string; pad: number; radius?: number };
}

/** The mark as a standalone SVG document. */
export function lockSvg({ shackle = LOCK_COLOURS.shackle, edge, tile }: LockSvgOptions = {}): string {
  const pad = tile ? tile.pad * LOCK_BOX.size : 0;
  const box = { x: LOCK_BOX.x - pad, y: LOCK_BOX.y - pad, size: LOCK_BOX.size + 2 * pad };
  const edged = edge ? ` stroke="${LOCK_COLOURS.shackle}" stroke-width="${edge}" stroke-linejoin="round" paint-order="stroke"` : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox(box)}">`,
    tile && `<rect x="${box.x}" y="${box.y}" width="${box.size}" height="${box.size}" rx="${(tile.radius ?? 0) * box.size}" fill="${tile.fill}"/>`,
    `<path fill="${shackle}"${edged} d="${LOCK_PATHS.shackle}"/>`,
    `<path fill="${LOCK_COLOURS.upperBar}" d="${LOCK_PATHS.upperBar}"/>`,
    `<path fill="${LOCK_COLOURS.lowerBar}" d="${LOCK_PATHS.lowerBar}"/>`,
    '</svg>',
  ]
    .filter(Boolean)
    .join('\n');
}

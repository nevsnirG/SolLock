// The SolLock mark: a closed padlock with the sun rising inside its shackle, for "Sol" and "Lock".
// The header logo (components/Logo.astro), the favicons (scripts/icons.mjs) and the
// Open Graph images (scripts/og.mjs) all draw it from here.

/** The side of the square the mark is drawn in. */
export const MARK_SIZE = 32;

export const MARK = {
  body: { x: 4.5, y: 13.5, width: 23, height: 15, rx: 4.5 },
  /** Drawn as a stroke, so the opening keeps its width at every size. */
  shackle: 'M10.25 14.5V10.75a5.75 5.75 0 0 1 11.5 0V14.5',
  shackleWidth: 3,
  sun: 'M12.6 13.5a3.4 3.4 0 0 1 6.8 0z',
} as const;

/** From global.css: the ink, the paper and the sun. The sun keeps its colour in both themes. */
export const MARK_COLOURS = { ink: '#0b0b0a', paper: '#ffffff', sun: '#f7a823' } as const;

export const MARK_VIEW_BOX = `0 0 ${MARK_SIZE} ${MARK_SIZE}`;

export interface MarkSvgOptions {
  /** The padlock's colour; the sun keeps its own. */
  lock?: string;
  /** A filled square behind the mark: how much of it the mark fills, and its corner radius as a fraction of its side. */
  tile?: { fill: string; scale: number; radius?: number };
}

const lockShapes = (lock: string): string =>
  [
    `<rect x="${MARK.body.x}" y="${MARK.body.y}" width="${MARK.body.width}" height="${MARK.body.height}" rx="${MARK.body.rx}" fill="${lock}"/>`,
    `<path d="${MARK.shackle}" fill="none" stroke="${lock}" stroke-width="${MARK.shackleWidth}"/>`,
    `<path d="${MARK.sun}" fill="${MARK_COLOURS.sun}"/>`,
  ].join('');

/** The mark as a standalone SVG document. */
export function markSvg({ lock = MARK_COLOURS.ink, tile }: MarkSvgOptions = {}): string {
  const half = MARK_SIZE / 2;
  const shapes = lockShapes(lock);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEW_BOX}">`,
    tile && `<rect width="${MARK_SIZE}" height="${MARK_SIZE}" rx="${(tile.radius ?? 0) * MARK_SIZE}" fill="${tile.fill}"/>`,
    tile ? `<g transform="translate(${half} ${half}) scale(${tile.scale}) translate(${-half} ${-half})">${shapes}</g>` : shapes,
    '</svg>',
  ]
    .filter(Boolean)
    .join('\n');
}

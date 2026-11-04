// Mobile wallets, and Google's favicon service behind wallet popups, ask for /favicon.ico by name.
// Every file here is drawn from src/lib/lockIcon.ts, which the header logo uses too (Node strips the types itself).

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { lockSvg } from '../src/lib/lockIcon.ts';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pub = join(here, '../public');

// From global.css: the light theme's background and the dark theme's ink.
const BG = '#fbf8f3';
const INK_DARK = '#f6f1ea';

// The SVG favicon follows the system theme. The bitmaps cannot, so they sit on a light tile that reads on any tab bar or wallet card.
const favicon = lockSvg({ darkShackle: INK_DARK });
const tile = lockSvg({ tile: { fill: BG, pad: 0.1, radius: 0.22 } });
// iOS rounds the corners itself and turns transparency black, so the touch icon fills the whole square.
const touch = lockSvg({ tile: { fill: BG, pad: 0.12 } });

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

/** An .ico that holds PNG images rather than bitmaps. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size % 256, entry);
    header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

await initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));

const files = {
  'favicon.svg': `${favicon}\n`,
  'favicon.ico': ico([16, 32, 48].map((size) => ({ size, data: png(tile, size) }))),
  'icon-192.png': png(tile, 192),
  'apple-touch-icon.png': png(touch, 180),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(pub, name), data);
  console.log(name);
}

// Mobile wallets, and Google's favicon service behind wallet popups, ask for /favicon.ico by name.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pub = join(here, '../public');
const logo = readFileSync(join(pub, 'favicon.svg'), 'utf8');

// iOS rounds the corners itself and turns transparency black, so the touch icon fills the whole square.
const SUN = '#f7a823';
const tile = logo.replace('<circle cx="17" cy="17" r="16"', `<rect width="34" height="34" fill="${SUN}"/><circle cx="17" cy="17" r="16"`);

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
  'favicon.ico': ico([16, 32, 48].map((size) => ({ size, data: png(logo, size) }))),
  'icon-192.png': png(logo, 192),
  'apple-touch-icon.png': png(tile, 180),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(pub, name), data);
  console.log(name);
}

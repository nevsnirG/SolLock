// 1200×630 is the standard Open Graph image size.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import satori from 'satori';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const out = join(here, '../public/og');
const font = (pkg, file) => readFileSync(join(dirname(require.resolve(`${pkg}/package.json`)), 'files', file));

const fonts = [
  { name: 'Bricolage', data: font('@fontsource/bricolage-grotesque', 'bricolage-grotesque-latin-700-normal.woff'), weight: 700, style: 'normal' },
  { name: 'Figtree', data: font('@fontsource/figtree', 'figtree-latin-400-normal.woff'), weight: 400, style: 'normal' },
  { name: 'Figtree', data: font('@fontsource/figtree', 'figtree-latin-600-normal.woff'), weight: 600, style: 'normal' },
];

// The light theme's colours, copied from global.css.
const BG = '#fbf8f3';
const INK = '#17130f';
const INK_2 = '#463e36';
const SUN = '#f7a823';

const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.flat() } });

function sun(size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34">
    <circle cx="17" cy="17" r="16" fill="${SUN}"/>
    <line x1="17" y1="17" x2="17" y2="7.5" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
    <line x1="17" y1="17" x2="23.5" y2="20.5" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="17" cy="17" r="2.4" fill="${INK}"/>
  </svg>`;
  return { type: 'img', props: { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width: size, height: size } };
}

function card({ kicker, title, sub }) {
  return h(
    'div',
    {
      width: 1200 - 2 * 72,
      height: 630 - 2 * 60,
      boxSizing: 'content-box',
      background: BG,
      backgroundImage: 'radial-gradient(circle at 92% 18%, #fcd9a0 0%, rgba(251, 248, 243, 0) 46%)',
      padding: '60px 72px',
      flexDirection: 'column',
      justifyContent: 'space-between',
      fontFamily: 'Figtree',
      color: INK,
    },
    h('div', { alignItems: 'center', gap: 14 }, sun(48), h('div', { fontFamily: 'Bricolage', fontSize: 34, fontWeight: 700, letterSpacing: -1 }, 'SolLock')),
    h(
      'div',
      { flexDirection: 'column', gap: 18, maxWidth: 940 },
      h('div', { fontSize: 22, fontWeight: 600, color: INK_2, letterSpacing: 0.5 }, kicker),
      h('div', { fontFamily: 'Bricolage', fontSize: 74, fontWeight: 700, lineHeight: 1, letterSpacing: -2.5 }, title),
      h('div', { fontSize: 30, color: INK_2, lineHeight: 1.35 }, sub),
    ),
  );
}

async function png(node) {
  const svg = await satori(node, { width: 1200, height: 630, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}

await initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
mkdirSync(out, { recursive: true });

const images = {
  'default.png': card({
    kicker: 'A time lock for your own Solana',
    title: 'Imagine holding through the next cycle.',
    sub: 'Lock your Solana until a date you choose. Until then nobody can move it, not even you.',
  }),
  'custodian.png': card({
    kicker: 'Check it yourself',
    title: 'The custodian address nobody has a key for.',
    sub: 'Every SolLock lock names it. Here is how it is made.',
  }),
};
for (const [name, node] of Object.entries(images)) {
  writeFileSync(join(out, name), await png(node));
  console.log(`og/${name}`);
}

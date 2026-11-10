// 1200×630 is the standard Open Graph image size.

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import satori from 'satori';
import { MARK_COLOURS, markSvg } from '../src/lib/lockIcon.ts';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const out = join(here, '../public/og');
const font = (weight) => readFileSync(join(dirname(require.resolve('@fontsource/geist/package.json')), 'files', `geist-latin-${weight}-normal.woff`));

const fonts = [400, 500, 600].map((weight) => ({ name: 'Geist', data: font(weight), weight, style: 'normal' }));

// The dark theme's colours, copied from global.css: the cards match the home page's hero.
const BG = MARK_COLOURS.ink;
const INK = '#f6f6f3';
const INK_2 = '#c8c8c3';
const SUN = MARK_COLOURS.sun;

const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.flat() } });

function mark(size) {
  const svg = markSvg({ lock: MARK_COLOURS.paper });
  return { type: 'img', props: { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width: size, height: size } };
}

function card({ kicker, title, sub, titleSize = 76 }) {
  return h(
    'div',
    {
      width: 1200 - 2 * 72,
      height: 630 - 2 * 60,
      boxSizing: 'content-box',
      background: BG,
      backgroundImage: 'radial-gradient(circle at 86% 118%, rgba(247, 168, 35, 0.42) 0%, rgba(11, 11, 10, 0) 54%)',
      padding: '60px 72px',
      flexDirection: 'column',
      justifyContent: 'space-between',
      fontFamily: 'Geist',
      color: INK,
    },
    h('div', { alignItems: 'center', gap: 14 }, mark(52), h('div', { fontSize: 36, fontWeight: 600, letterSpacing: -1.2 }, 'SolLock')),
    h(
      'div',
      { flexDirection: 'column', gap: 20, maxWidth: 960 },
      h('div', { fontSize: 22, fontWeight: 500, color: SUN, letterSpacing: 0.2 }, kicker),
      h('div', { fontSize: titleSize, fontWeight: 600, lineHeight: 1.02, letterSpacing: (-3 * titleSize) / 76 }, title),
      sub ? h('div', { fontSize: 30, color: INK_2, lineHeight: 1.35 }, sub) : [],
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
  'learn.png': card({
    kicker: 'Guides',
    title: 'How a Solana time lock works.',
    sub: 'What a lock can do, what it cannot, and how to check one yourself.',
  }),
};
for (const [name, node] of Object.entries(images)) {
  writeFileSync(join(out, name), await png(node));
  console.log(`og/${name}`);
}

// One card per guide, carrying its heading, so a shared link shows which guide it is. A long heading is set smaller to stay within three lines.
const guides = join(here, '../src/content/learn');
rmSync(join(out, 'learn'), { recursive: true, force: true });
mkdirSync(join(out, 'learn'));
for (const file of readdirSync(guides).filter((name) => name.endsWith('.md'))) {
  const title = readFileSync(join(guides, file), 'utf8').match(/^title: "(.+)"$/m)?.[1];
  if (!title) throw new Error(`${file} has no title to put on its card.`);
  const titleSize = title.length <= 36 ? 76 : title.length <= 52 ? 68 : 60;
  writeFileSync(join(out, 'learn', `${file.slice(0, -3)}.png`), await png(card({ kicker: 'Guide', title, titleSize })));
}
console.log(`og/learn: ${readdirSync(join(out, 'learn')).length} guides`);

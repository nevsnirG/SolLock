import { describe, expect, it } from 'vitest';
import { GUIDE_SECTIONS, bySection } from '../src/lib/guideSections.ts';
import { breadcrumbs, faqPage } from '../src/lib/structured.ts';

describe('the FAQ as structured data', () => {
  it('gives every link in an answer its whole address', () => {
    const [question] = faqPage([{ question: 'Can I unlock early?', answer: ['No.', 'See <a href="/learn/can-you-unlock-solana-early">the guide</a> and <a href="https://solana.com/docs">the docs</a>.'] }]).mainEntity;
    expect(question!.name).toBe('Can I unlock early?');
    expect(question!.acceptedAnswer.text).toBe(
      '<p>No.</p><p>See <a href="https://sollock.io/learn/can-you-unlock-solana-early">the guide</a> and <a href="https://solana.com/docs">the docs</a>.</p>',
    );
  });
});

describe('breadcrumbs', () => {
  it('start at the home page and leave the address off the page itself', () => {
    const { itemListElement } = breadcrumbs([{ name: 'Learn', path: '/learn' }, { name: 'A guide' }]);
    expect(itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'SolLock', item: 'https://sollock.io/' },
      { '@type': 'ListItem', position: 2, name: 'Learn', item: 'https://sollock.io/learn' },
      { '@type': 'ListItem', position: 3, name: 'A guide' },
    ]);
  });
});

describe('the sections of the learn page', () => {
  const guide = (order: number, section: string) => ({ id: `guide-${order}`, data: { order, section } });

  it('list the guides in order, cut where the section changes', () => {
    const groups = bySection([guide(3, 'lock'), guide(1, 'start'), guide(2, 'start'), guide(4, 'details')]);
    expect(groups.map((group) => [group.section.id, group.guides.map((g) => g.id)])).toEqual([
      ['start', ['guide-1', 'guide-2']],
      ['lock', ['guide-3']],
      ['details', ['guide-4']],
    ]);
  });

  it('refuse a section whose guides do not follow each other, and a section that does not exist', () => {
    expect(() => bySection([guide(1, 'start'), guide(2, 'lock'), guide(3, 'start')])).toThrow(/do not follow each other/);
    expect(() => bySection([guide(1, 'elsewhere')])).toThrow(/not a section/);
  });

  it('have a title and a line of introduction each', () => {
    for (const section of GUIDE_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(3);
      expect(section.intro).toMatch(/\.$/);
    }
  });
});

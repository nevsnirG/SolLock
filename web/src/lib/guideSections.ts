/** The parts of the learn page, in the order they appear. Each guide names one in its frontmatter. */
export const GUIDE_SECTIONS = [
  { id: 'start', title: 'New to Solana', intro: 'Start here if crypto is new to you: what Solana is, how to buy it, and how to keep hold of it.' },
  { id: 'lock', title: 'How a lock works', intro: 'From making a lock to the day it opens, and why the date holds until then.' },
  { id: 'gifts', title: 'Gifts', intro: 'A lock that belongs to someone else from the start, to open on a day that matters to them.' },
  { id: 'details', title: 'Risks and details', intro: 'What can go wrong, the deposit every lock holds, and how other blockchains lock coins.' },
] as const;

export type GuideSection = (typeof GUIDE_SECTIONS)[number];

/**
 * Guides sorted by `order` and cut into their sections. A section whose guides do not follow each other
 * would show up twice on the page, so that is refused.
 */
export function bySection<Guide extends { data: { order: number; section: string } }>(guides: readonly Guide[]): { section: GuideSection; guides: Guide[] }[] {
  const groups: { section: GuideSection; guides: Guide[] }[] = [];
  for (const guide of [...guides].sort((a, b) => a.data.order - b.data.order)) {
    const last = groups.at(-1);
    if (last?.section.id === guide.data.section) {
      last.guides.push(guide);
      continue;
    }
    const section = GUIDE_SECTIONS.find((candidate) => candidate.id === guide.data.section);
    if (!section) throw new Error(`"${guide.data.section}" is not a section of the learn page.`);
    if (groups.some((group) => group.section.id === section.id)) throw new Error(`The guides of "${section.title}" do not follow each other in order.`);
    groups.push({ section, guides: [guide] });
  }
  return groups;
}

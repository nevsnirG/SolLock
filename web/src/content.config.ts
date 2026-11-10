import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { GUIDE_SECTIONS } from './lib/guideSections.ts';
import { DESCRIPTION_LIMIT, TITLE_LIMIT } from './lib/pageTitle.ts';

/** The guides under /learn. The file name is the slug. */
const learn = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/learn' }),
  schema: z.object({
    /** The heading on the page, in sentence case, following the site's words. */
    title: z.string(),
    /** The <title> for search engines; the one place "(SOL)" may appear. Short enough to show whole in a search result. */
    searchTitle: z.string().max(TITLE_LIMIT),
    description: z.string().max(DESCRIPTION_LIMIT),
    published: z.coerce.date(),
    updated: z.coerce.date().optional(),
    order: z.number().int().positive(),
    /** The part of the learn page the guide is listed under. The guides of one section follow each other in `order`. */
    section: z.enum(GUIDE_SECTIONS.map((section) => section.id) as [string, ...string[]]),
    /** Slugs of the guides offered under "Keep reading". */
    related: z.array(z.string()).min(1).max(3),
  }),
});

export const collections = { learn };

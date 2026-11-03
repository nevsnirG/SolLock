import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** The guides under /learn. The file name is the slug. */
const learn = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/learn' }),
  schema: z.object({
    /** The heading on the page, in sentence case, following the site's words. */
    title: z.string(),
    /** The <title> for search engines; the one place "(SOL)" may appear. */
    searchTitle: z.string(),
    description: z.string().max(200),
    published: z.coerce.date(),
    updated: z.coerce.date().optional(),
    order: z.number().int().positive(),
    /** Slugs of the guides offered under "Keep reading". */
    related: z.array(z.string()).min(1).max(3),
  }),
});

export const collections = { learn };

/** About as much of a title as a search result shows before it is cut off. */
export const TITLE_LIMIT = 60;

/** About as much of a description as a search result shows. */
export const DESCRIPTION_LIMIT = 160;

const SITE_NAME = ' · SolLock';

/**
 * The <title> of a page: its own title, followed by the site name when both fit in a search result.
 * A longer title goes without the site name, which search engines show above the result anyway.
 */
export function pageTitle(title: string): string {
  return title.length + SITE_NAME.length <= TITLE_LIMIT ? `${title}${SITE_NAME}` : title;
}

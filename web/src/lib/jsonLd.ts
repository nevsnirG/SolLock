/** U+2028 and U+2029 are line terminators to JavaScript but not to JSON, so they are escaped too. */
const LINE_SEPARATORS = String.fromCharCode(0x2028, 0x2029);
const UNSAFE_IN_SCRIPT = new RegExp(`[<>&${LINE_SEPARATORS}]`, 'g');
const BACKSLASH = String.fromCharCode(0x5c);

/**
 * JSON for a <script type="application/ld+json"> block. JSON.stringify leaves "<" alone, so a value containing
 * "</script>" would end the block early; these escapes keep every value inside it, and JSON.parse reads them back unchanged.
 */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(UNSAFE_IN_SCRIPT, (c) => `${BACKSLASH}u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

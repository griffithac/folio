export const MAX_PDF_TEXT_ITEMS_PER_PAGE = 100_000;
export const MAX_PDF_PAGE_TEXT_CHARACTERS = 1_000_000;

export function extractPageText(items: readonly unknown[], characterLimit = MAX_PDF_PAGE_TEXT_CHARACTERS) {
  if (items.length > MAX_PDF_TEXT_ITEMS_PER_PAGE) throw new Error('This PDF page has too many text fragments to inspect safely. Try a simpler or split PDF.');
  const parts: string[] = [];
  let characters = 0;
  for (const item of items) {
    if (typeof item !== 'object' || item === null || !('str' in item) || typeof item.str !== 'string') continue;
    const part = `${item.str}${'hasEOL' in item && item.hasEOL ? '\n' : ' '}`;
    characters += part.length;
    if (characters > Math.min(MAX_PDF_PAGE_TEXT_CHARACTERS, characterLimit)) {
      throw new Error('Full-source scanning reached its per-page or total text limit. Existing evidence and results are retained.');
    }
    parts.push(part);
  }
  return parts.join('').replace(/[ \t]+/g, ' ').trim();
}

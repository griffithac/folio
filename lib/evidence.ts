import type { Excerpt } from './catalog.ts';
export const SAMPLING_VERSION = 'distributed-pages-and-within-page-v1';
export function distributedExcerpt(text: string, limit = 1000) {
  if (text.length <= limit) return text;
  const separator = '\n[… excerpt gap …]\n';
  const width = Math.floor((limit - separator.length * 2) / 3);
  if (width < 1) return text.slice(0, limit);
  const middle = Math.floor((text.length - width) / 2);
  return [text.slice(0, width), text.slice(middle, middle + width), text.slice(-width)].join(separator);
}
export function budgetSamples(samples: Excerpt[]): Excerpt[] {
  const perPage = Math.floor(20000 / Math.max(1, samples.length));
  return samples.map(sample => {
    let low = 1, high = Math.min(1000, sample.text.length);
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (new TextEncoder().encode(distributedExcerpt(sample.text, middle)).length <= perPage) low = middle;
      else high = middle - 1;
    }
    return { page: sample.page, text: distributedExcerpt(sample.text, low) };
  });
}

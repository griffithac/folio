import { LEVELS, type Book } from './catalog.ts';
export const DIMENSIONS = ['detailedSubject', 'genre', 'subcategory', 'language', 'readingLevel', 'timePeriod'] as const;
export type Dimension = typeof DIMENSIONS[number];
export function prediction(book: Book, dimension: Dimension): string | undefined {
  if (dimension === 'detailedSubject') return book.detailedSubject?.code;
  if (!book.result) return undefined;
  if (dimension === 'subcategory') return book.result.subcategory?.code || 'Unspecified';
  return book.result[dimension]?.label;
}
export function evaluateReferences(books: Book[], status: 'verified' | 'provisional', split: 'all' | 'development' | 'holdout' = 'all') {
  return DIMENSIONS.map(dimension => {
    const pairs = books.filter(book => book.reference?.status === status && (split === 'all' || book.reference.split === split) && book.reference.labels[dimension] && prediction(book, dimension));
    const correct = pairs.filter(book => book.reference!.labels[dimension] === prediction(book, dimension)).length;
    const distances = dimension === 'readingLevel' ? pairs.map(book => Math.abs(LEVELS.findIndex(l => l.label === book.reference!.labels.readingLevel) - LEVELS.findIndex(l => l.label === prediction(book, dimension)))) : [];
    return { dimension, count: pairs.length, correct, accuracy: pairs.length ? correct / pairs.length : null, meanBandError: distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : null, adjacentBand: distances.filter(d => d <= 1).length };
  });
}

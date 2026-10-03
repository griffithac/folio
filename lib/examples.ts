import type { Book } from './catalog';
export const exampleBooks: Book[] = [
  { title: 'The Secret Garden', author: 'Frances Hodgson Burnett', genre: 'Children’s fiction', language: 'English', readingLevel: 'Middle school', range: 'Grades 6–8', pageCount: 244 },
  { title: 'Pride and Prejudice', author: 'Jane Austen', genre: 'Romance', language: 'English', readingLevel: 'High school', range: 'Grades 9–12', pageCount: 279 },
  { title: 'The Time Machine', author: 'H. G. Wells', genre: 'Science fiction', language: 'English', readingLevel: 'High school', range: 'Grades 9–12', pageCount: 118 },
  { title: 'Le Petit Prince', author: 'Antoine de Saint-Exupéry', genre: 'Fantasy', language: 'French', readingLevel: 'Middle school', range: 'Grades 6–8', pageCount: 96 },
].map((book, i) => ({
  id: `example-${i}`, hash: `example-${i}`, title: book.title, author: book.author,
  filename: `${book.title}.pdf`, pageCount: book.pageCount, size: 0,
  addedAt: '2026-10-03T12:00:00Z', samples: [], status: 'complete', example: true,
  result: {
    genre: { label: book.genre, confidence: 0.9, probabilities: { [book.genre]: 0.9, 'Other / uncertain': 0.1 } },
    language: { label: book.language, confidence: 0.96, probabilities: { [book.language]: 0.96, 'Other / uncertain': 0.04 } },
    readingLevel: { label: book.readingLevel, range: book.range, score: book.readingLevel === 'Middle school' ? 2.1 : 3.2, confidence: 0.82, probabilities: { [book.readingLevel === 'Middle school' ? '2' : '3']: 0.9, '4': 0.1 } },
    model: 'Illustrative example', reviewed: false,
  },
}));

import type { Book } from './catalog.ts';
import { hasIndependentReview, referenceSchema } from './references.ts';
import { QUALIFIER_FAMILIES, qualifierAncestors, qualifierNode, type QualifierFamily } from './qualifier-catalog.ts';
import type { EvaluationSplit, ReferenceStatus } from './validation.ts';

type Counts = { tp: number; fp: number; fn: number };
const emptyCounts = (): Counts => ({ tp: 0, fp: 0, fn: 0 });
const unique = (codes: string[]) => [...new Set(codes)].sort();
const rates = ({ tp, fp, fn }: Counts) => ({ precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, f1: 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : null });
function comparison(expected: string[], actual: string[]) {
  return { expected, actual, matched: actual.filter(code => expected.includes(code)), missing: expected.filter(code => !actual.includes(code)), extras: actual.filter(code => !expected.includes(code)) };
}
const totals = (rows: { matched: string[]; missing: string[]; extras: string[] }[]) => rows.reduce((c, row) => ({ tp: c.tp + row.matched.length, fp: c.fp + row.extras.length, fn: c.fn + row.missing.length }), emptyCounts());
const ancestor = (parent: string, child: string) => parent !== child && qualifierAncestors(child).includes(parent);

export function qualifierPredictions(book: Book): string[] {
  // An interrupted run is not an explicit no-qualifier judgment. Its retained
  // candidates are diagnostics, not assignments, even if an old record lists one.
  return book.qualifiers?.status === 'complete' ? unique(book.qualifiers.qualifiers.filter(c => c.status === 'supported').map(c => c.code)) : [];
}

export function evaluateQualifiers(books: Book[], status: ReferenceStatus, split: EvaluationSplit = 'all') {
  const selected = books.flatMap(book => {
    if (!book.reference?.qualifierReference || book.reference.status !== status || (split !== 'all' && book.reference.split !== split)) return [];
    const parsed = referenceSchema.safeParse(book.reference);
    if (!parsed.success || (status === 'verified' && (!hasIndependentReview(parsed.data) || parsed.data.scope !== 'edition'))) return [];
    return [{ book, reference: parsed.data.qualifierReference! }];
  });
  const rows = selected.flatMap(({ book, reference }) => QUALIFIER_FAMILIES.flatMap(family => {
    const dimension = reference.dimensions[family]; if (!dimension) return [];
    const actual = qualifierPredictions(book).filter(code => code[0] === family);
    const compared = comparison(unique(dimension.codes), actual);
    return [{ id: book.id, title: book.title, family, coverage: dimension.coverage, ...compared,
      predictionStatus: book.qualifiers?.status || 'missing', model: book.qualifiers?.model || null, evidenceMethod: book.qualifiers?.evidenceMethod || null,
      needsReview: Boolean(book.qualifiers && !book.qualifiers.reviewed),
      exact: book.qualifiers?.status === 'complete' && !compared.missing.length && !compared.extras.length,
      broader: compared.extras.flatMap(predicted => compared.missing.filter(gold => ancestor(predicted, gold)).map(gold => ({ predicted, reference: gold }))),
      narrower: compared.extras.flatMap(predicted => compared.missing.filter(gold => ancestor(gold, predicted)).map(gold => ({ predicted, reference: gold }))),
    }];
  }));
  const complete = rows.filter(row => row.coverage === 'complete'), partial = rows.filter(row => row.coverage === 'partial');
  const counts = totals(complete);
  const labels = new Map<string, Counts>();
  for (const row of complete) for (const code of new Set([...row.expected, ...row.actual])) {
    const value = labels.get(code) || emptyCounts();
    if (row.matched.includes(code)) value.tp++; else if (row.extras.includes(code)) value.fp++; else value.fn++;
    labels.set(code, value);
  }
  const perLabel = [...labels].sort(([a], [b]) => a.localeCompare(b)).map(([code, value]) => ({ code, heading: qualifierNode(code)!.CodeDescription, ...value, support: value.tp + value.fn, predictions: value.tp + value.fp, ...rates(value) }));
  const perFamily = QUALIFIER_FAMILIES.map(family => {
    const judged = complete.filter(row => row.family === family), known = partial.filter(row => row.family === family), c = totals(judged);
    return { family, heading: qualifierNode(family)!.CodeDescription, complete: judged.length, partial: known.length, ...c, ...rates(c), exact: judged.filter(row => row.exact).length, exactAgreement: judged.length ? judged.filter(row => row.exact).length / judged.length : null };
  });
  const full = selected.filter(({ reference }) => QUALIFIER_FAMILIES.every(family => reference.dimensions[family]?.coverage === 'complete'));
  const exactBooks = full.filter(({ book }) => book.qualifiers?.status === 'complete' && rows.filter(row => row.id === book.id).every(row => row.exact)).length;
  const partialKnown = partial.reduce((n, row) => n + row.expected.length, 0), partialMatches = partial.reduce((n, row) => n + row.matched.length, 0);
  // Relationships are judged only for qualifiers whose links were supplied.
  // Complete code coverage alone does not attest which subject each code refines.
  const linkRows = selected.flatMap(({ book, reference }) => QUALIFIER_FAMILIES.flatMap(family => (reference.dimensions[family]?.links || []).map(link => {
    const assigned = book.qualifiers?.status === 'complete' ? book.qualifiers.qualifiers.find(c => c.code === link.code && c.status === 'supported') : undefined;
    const compared = comparison(unique(link.subjectCodes), unique(assigned?.appliesTo || []));
    return { id: book.id, title: book.title, family, code: link.code, coverage: link.coverage, ...compared, predictionStatus: book.qualifiers?.status || 'missing',
      exact: Boolean(assigned) && !compared.missing.length && !compared.extras.length };
  })));
  const completeLinks = linkRows.filter(row => row.coverage === 'complete'), partialLinks = linkRows.filter(row => row.coverage === 'partial'), linkCounts = totals(completeLinks);
  const partialLinkKnown = partialLinks.reduce((n, row) => n + row.expected.length, 0), partialLinkMatches = partialLinks.reduce((n, row) => n + row.matched.length, 0);
  return {
    count: selected.length, complete: complete.length, partial: partial.length, fullyReferenced: full.length, exactBooks,
    exactAgreement: full.length ? exactBooks / full.length : null,
    exactDimensions: complete.filter(row => row.exact).length, dimensionAgreement: complete.length ? complete.filter(row => row.exact).length / complete.length : null,
    micro: { ...counts, ...rates(counts) }, macroF1: perLabel.length ? perLabel.reduce((n, label) => n + (label.f1 ?? 0), 0) / perLabel.length : null,
    perLabel, perFamily, rows, partialKnown, partialMatches, partialKnownRecall: partialKnown ? partialMatches / partialKnown : null,
    runs: { complete: selected.filter(({ book }) => book.qualifiers?.status === 'complete').length, partial: selected.filter(({ book }) => book.qualifiers?.status === 'partial').length, unavailable: selected.filter(({ book }) => book.qualifiers?.status === 'unavailable').length, missing: selected.filter(({ book }) => !book.qualifiers).length },
    models: unique(selected.flatMap(({ book }) => book.qualifiers?.model ? [book.qualifiers.model] : [])),
    evidenceMethods: unique(selected.flatMap(({ book }) => book.qualifiers ? [book.qualifiers.evidenceMethod || 'unassisted-v1'] : [])),
    links: { complete: completeLinks.length, partial: partialLinks.length, micro: { ...linkCounts, ...rates(linkCounts) }, exact: completeLinks.filter(row => row.exact).length,
      exactAgreement: completeLinks.length ? completeLinks.filter(row => row.exact).length / completeLinks.length : null,
      partialKnown: partialLinkKnown, partialMatches: partialLinkMatches, partialKnownRecall: partialLinkKnown ? partialLinkMatches / partialLinkKnown : null, rows: linkRows },
  };
}

import { z } from 'zod';
import { GENRES, LANGUAGES, LEVELS, TIME_PERIODS, type ReferenceLabels } from './catalog.ts';
import { subjectNode } from './hierarchy.ts';
import { SUBCATEGORIES } from './subcategories.ts';
import { themaForLabel } from './standards.ts';
import { QUALIFIER_FAMILIES, qualifierAncestors, qualifierAssignable } from './qualifier-catalog.ts';
import { qualifierSubjectAllowed } from './qualifier-search.ts';

const webUrl = z.string().url().max(2000).refine(s => /^https?:\/\//.test(s));
const optionalLabel = (keys: string[]) => z.string().refine(s => keys.includes(s)).optional();
export const referenceSubjectCode = z.string().max(6).refine(code => code.length > 1 && Boolean(subjectNode(code)), 'Use an official assignable Thema 1.6 subject code.');
const referenceQualifierCode = z.string().max(14).refine(qualifierAssignable, 'Use an official assignable Thema 1.6 qualifier code.');
export const qualifierReferenceSchema = z.object({
  taxonomyVersion: z.literal('Thema 1.6'),
  dimensions: z.record(z.enum(QUALIFIER_FAMILIES), z.object({
    codes: z.array(referenceQualifierCode).max(48), coverage: z.enum(['complete', 'partial']),
    links: z.array(z.object({ code: referenceQualifierCode, subjectCodes: z.array(referenceSubjectCode).min(1).max(12), coverage: z.enum(['complete', 'partial']) }).strict()).max(48).optional(),
  }).strict()),
}).strict().superRefine((reference, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (!Object.keys(reference.dimensions).length) issue('Choose at least one qualifier dimension to review.');
  for (const [family, dimension] of Object.entries(reference.dimensions)) {
    if (!dimension) continue;
    if (dimension.codes.some(code => code[0] !== family)) issue('Qualifier codes must belong to their reference dimension.');
    if (new Set(dimension.codes).size !== dimension.codes.length) issue('Reference qualifier codes must be unique within a dimension.');
    if (dimension.coverage === 'partial' && !dimension.codes.length) issue('A partial qualifier reference needs at least one known code.');
    if (dimension.codes.some(code => dimension.codes.some(other => other !== code && qualifierAssignable(other) && qualifierAncestors(other).includes(code)))) issue('Choose a specific qualifier without also assigning its ancestor.');
    if (family === '5' && dimension.codes.filter(code => code.startsWith('5A') && !['5AR', '5AX', '5AZ', '5AV'].includes(code)).length > 1) issue('Choose only one base interest age.');
    if (new Set(dimension.links?.map(link => link.code)).size !== (dimension.links?.length || 0)) issue('Reference qualifier relationships must be unique.');
    for (const link of dimension.links || []) {
      if (!dimension.codes.includes(link.code)) issue('A relationship must describe a supplied reference qualifier.');
      if (new Set(link.subjectCodes).size !== link.subjectCodes.length) issue('Reference relationship subjects must be unique.');
      if (link.subjectCodes.some(code => !qualifierSubjectAllowed(link.code, code))) issue('This qualifier is not allowed with the reference subject.');
      if (link.subjectCodes.some(code => link.subjectCodes.some(other => isSubjectAncestor(code, other)))) issue('Choose specific relationship subjects without redundant ancestors.');
    }
  }
});

// Follow the official tree: code prefixes are not a substitute for ancestry.
export function subjectAncestors(code: string): string[] {
  const ancestors: string[] = [];
  let parent = subjectNode(code)?.CodeParent;
  while (parent && !ancestors.includes(parent)) {
    ancestors.push(parent);
    parent = subjectNode(parent)?.CodeParent;
  }
  return ancestors;
}
export const isSubjectAncestor = (parent: string, child: string) => subjectAncestors(child).includes(parent);

export const referenceSchema = z.object({
  status: z.enum(['provisional', 'verified']), sourceName: z.string().trim().min(1).max(200), sourceUrl: webUrl,
  scope: z.enum(['work', 'edition']), edition: z.string().max(240), notes: z.string().max(4000),
  labels: z.object({
    detailedSubject: referenceSubjectCode.optional(), genre: optionalLabel(Object.keys(GENRES)),
    subcategory: z.string().max(12).optional(), language: optionalLabel(Object.keys(LANGUAGES)),
    readingLevel: optionalLabel(LEVELS.map(l => l.label)), timePeriod: optionalLabel(Object.keys(TIME_PERIODS)),
  }).strict(),
  subjectReference: z.object({
    codes: z.array(referenceSubjectCode).max(12), coverage: z.enum(['complete', 'partial']), taxonomyVersion: z.literal('Thema 1.6'),
  }).strict().superRefine((subjects, ctx) => {
    if (new Set(subjects.codes).size !== subjects.codes.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Reference subject codes must be unique.' });
    if (subjects.coverage === 'partial' && !subjects.codes.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A partial reference needs at least one known subject.' });
    if (subjects.codes.some(code => subjects.codes.some(other => isSubjectAncestor(code, other)))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose the supported specific subject; do not also assign its ancestor.' });
  }).optional(),
  qualifierReference: qualifierReferenceSchema.optional(),
  review: z.object({
    reviewer: z.string().trim().min(1, 'Enter the independent reviewer’s name.').max(160), reviewerRole: z.string().trim().min(1, 'Enter the reviewer’s role or relevant expertise.').max(200),
    method: z.enum(['publisher-metadata', 'catalog-metadata', 'expert-review']), reviewedAt: z.string().datetime(),
    independent: z.boolean(), editionMatched: z.boolean(), modelBlind: z.boolean(),
  }).strict().optional(),
  workKey: z.string().trim().min(1).max(200).optional(),
  readingMeasure: z.object({ system: z.enum(['ATOS', 'Lexile']), value: z.string().min(1).max(20), sourceUrl: webUrl, edition: z.string().min(1).max(240) }).optional(),
  split: z.enum(['development', 'holdout']), updatedAt: z.string().datetime(),
}).strict().superRefine((r, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (!Object.values(r.labels).some(Boolean) && !r.readingMeasure && !r.subjectReference && !r.qualifierReference) issue('Add at least one reference label, subject set, qualifier dimension or measure.');
  if (r.labels.subcategory && r.labels.subcategory !== 'Unspecified' && !SUBCATEGORIES[themaForLabel(r.labels.genre || '')?.code || '']?.some(item => item.code === r.labels.subcategory)) issue('Reference subcategory must belong to the reference genre.');
  if (r.labels.detailedSubject && r.subjectReference && !r.subjectReference.codes.includes(r.labels.detailedSubject)) issue('The primary reference subject must be included in its subject set.');
  if (r.subjectReference?.coverage === 'complete' && Object.values(r.qualifierReference?.dimensions || {}).some(dimension => dimension?.links?.some(link => link.subjectCodes.some(code => !r.subjectReference!.codes.includes(code))))) issue('Qualifier relationship subjects must belong to the complete reference subject set.');
  if (r.scope === 'edition' && !r.edition.trim()) issue('Identify the reference edition or translation.');
  if (r.status === 'verified') {
    if (!r.review?.independent) issue('Verified references require a named independent reviewer and review record.');
    if (r.scope === 'edition' && !r.review?.editionMatched) issue('The reviewer must check the edition or translation match.');
    if ((r.labels.language || r.labels.readingLevel) && r.scope !== 'edition') issue('Verified language and reading-band labels must describe this edition or translation.');
    if (r.qualifierReference && r.scope !== 'edition') issue('Verified qualifier references must describe this uploaded edition or adaptation.');
  }
});

// Old verified flags without provenance remain readable but are not verified evidence.
export function hasIndependentReview(reference: ReferenceLabels): boolean {
  const review = reference.review;
  return Boolean(reference.status === 'verified' && review?.independent && review.reviewer.trim() && review.reviewerRole.trim()
    && Number.isFinite(Date.parse(review.reviewedAt))
    && (reference.scope !== 'edition' || (review.editionMatched && reference.edition.trim())));
}

import { z } from 'zod';
import type { BookState } from './classification.ts';
import { sourcePassages } from './subject-search.ts';
import { qualifierFacts } from './qualifier-facts.ts';
import { QUALIFIER_FAMILIES, QUALIFIER_NONE, QUALIFIER_VERSION, qualifierAncestors, qualifierAssignable, qualifierNode, qualifierQuestionGroups, parseQualifierChoice, qualifierChoiceSchema } from './qualifier-catalog.ts';
import { QUALIFIER_POLICY, QUALIFIER_NO_PASSAGE, qualifierState, qualifierSubjectAllowed, type DetailedQualifiers } from './qualifier-search.ts';
const probability = z.number().finite().min(0).max(1);
const code = z.string().min(2).max(14).refine(qualifierAssignable);
const calendarYear = z.object({ year: z.number().int().min(1).max(999999), era: z.enum(['BCE', 'CE']) }).strict();
const factsSchema = z.object({ method: z.literal('source-facts-v1'), range: z.object({ start: calendarYear, end: calendarYear }).strict().optional(), matches: z.array(z.object({ kind: z.enum(['year', 'name']), page: z.number().int().min(1).max(20000), start: z.number().int().min(0), end: z.number().int().min(1), text: z.string().min(1).max(500), year: z.number().int().min(1).max(999999).optional(), era: z.enum(['BCE', 'CE']).optional(), eraBasis: z.enum(['explicit', 'shared-range', 'unmarked']).optional(), alias: z.string().max(1000).optional() }).strict()).max(12), matchCount: z.number().int().min(0).max(50000), truncated: z.boolean() }).strict();
const candidate = z.object({
  code, heading: z.string().max(1000), family: z.enum(QUALIFIER_FAMILIES),
  path: z.array(z.object({ code: z.string().min(2).max(14), heading: z.string().max(1000), decisionId: z.string().max(80) }).strict()).min(1).max(9),
  rankingScore: probability, supportProbability: probability, subjectLinks: z.record(probability), appliesTo: z.array(z.string().max(6)).max(6),
  status: z.enum(['supported', 'insufficient-support', 'no-passage', 'unchecked']), passageSelection: qualifierChoiceSchema.optional(),
  explicitPurposeProbability: probability.optional(),
  sourceFacts: factsSchema.optional(),
  citation: z.object({ page: z.number().int().min(1).max(20000), start: z.number().int().min(0), end: z.number().int().min(1), text: z.string().min(1).max(480), supportProbability: probability }).strict().optional(),
}).strict();
export const detailedQualifiersSchema = z.object({
  method: z.literal('qualifier-beam-and-source-check-v1'), version: z.literal(QUALIFIER_VERSION), model: z.string().max(100), models: z.array(z.string().min(1).max(100)).max(2),
  evidenceMethod: z.literal('source-facts-v1').optional(),
  requests: z.number().int().min(0).max(QUALIFIER_POLICY.maxRequests), status: z.enum(['complete', 'partial', 'unavailable']), needsReview: z.boolean(), reviewed: z.boolean().optional(), stoppedReason: z.string().min(1).max(400),
  subjectCodes: z.array(z.string().min(2).max(6)).min(1).max(6), applicability: z.record(z.enum(QUALIFIER_FAMILIES), probability),
  routing: z.array(qualifierChoiceSchema.extend({ id: z.string().max(80), parent: z.string().min(1).max(14), group: z.number().int().min(0).max(254) }).strict()).max(512),
  candidates: z.array(candidate).max(QUALIFIER_POLICY.maxCandidates), qualifiers: z.array(candidate).max(QUALIFIER_POLICY.maxQualifiers),
  search: z.object({ beamWidth: z.literal(QUALIFIER_POLICY.beamWidth), maxDepth: z.literal(QUALIFIER_POLICY.maxDepth), pruned: z.boolean(), exploredParents: z.array(z.string().min(1).max(14)).max(216), supportThreshold: z.literal(QUALIFIER_POLICY.supportThreshold) }).strict(),
}).strict();
export function validateQualifiers(raw: unknown, state: Pick<BookState, 'samples' | 'pageCount'>, subjects: string[]): asserts raw is DetailedQualifiers {
  const detail = detailedQualifiersSchema.parse(raw);
  const fail = (message: string): never => { throw new Error(message); };
  if (JSON.stringify(detail.subjectCodes) !== JSON.stringify(subjects) || new Set(subjects).size !== subjects.length) fail('Qualifiers require the same supported subjects.');
  if (new Set(detail.models).size !== detail.models.length || (detail.model && !detail.models.includes(detail.model)) || (detail.status === 'complete' && (!detail.model || detail.models.length !== 1 || !detail.requests))) fail('Invalid qualifier model provenance.');
  if (!detail.needsReview || (detail.status !== 'complete' && (detail.qualifiers.length || detail.reviewed))) fail('Partial qualifiers require review and cannot be assigned.');
  if (detail.status === 'complete' && QUALIFIER_FAMILIES.some(f => !Object.hasOwn(detail.applicability, f))) fail('All qualifier families must be checked.');
  if (new Set(detail.search.exploredParents).size !== detail.search.exploredParents.length || detail.search.exploredParents.some(p => !qualifierNode(p))) fail('Invalid explored qualifier parents.');
  const questionState = qualifierState(state, subjects);
  const ledger = new Map(detail.routing.map(d => [d.id, d]));
  if (ledger.size !== detail.routing.length) fail('Duplicate qualifier decisions.');
  for (const decision of detail.routing) {
    const group = qualifierQuestionGroups(decision.parent, questionState).find(g => g.group === decision.group);
    if (!group || group.id !== decision.id || !detail.search.exploredParents.includes(decision.parent)) fail('Invalid qualifier routing group.');
    parseQualifierChoice(decision, Object.keys(group!.question.criteria));
    if ((detail.applicability[decision.parent[0] as typeof QUALIFIER_FAMILIES[number]] ?? 0) < QUALIFIER_POLICY.applicabilityThreshold) fail('An inapplicable family cannot be searched.');
  }
  const passages = sourcePassages({ title: 'Source evidence', ...state });
  const passageKeys = [...passages.map(p => p.id), QUALIFIER_NO_PASSAGE];
  if (new Set(detail.candidates.map(c => c.code)).size !== detail.candidates.length) fail('Duplicate qualifier candidates.');
  for (const c of detail.candidates) {
    if (detail.evidenceMethod && !c.sourceFacts) fail('Source facts are required for the assisted evidence method.');
    if (c.sourceFacts && JSON.stringify(c.sourceFacts) !== JSON.stringify(qualifierFacts(c.code, state.samples))) fail('Source facts must exactly match code-computed source spans and official ranges.');
    if (c.heading !== qualifierNode(c.code)?.CodeDescription || c.family !== c.code[0] || c.path.at(-1)?.code !== c.code) fail('Invalid qualifier heading or path.');
    const ancestors = qualifierAncestors(c.code).slice(1);
    if (JSON.stringify(c.path.map(p => p.code)) !== JSON.stringify(ancestors)) fail('Qualifier path must follow official parent relationships.');
    for (let i = 0; i < c.path.length; i++) {
      const step = c.path[i], decision = ledger.get(step.decisionId);
      if (step.heading !== qualifierNode(step.code)?.CodeDescription || !decision || decision.parent !== (i ? c.path[i - 1].code : c.family) || (decision.probabilities[step.code] ?? 0) < QUALIFIER_POLICY.minimumEdge || step.code === QUALIFIER_NONE) fail('Qualifier path must match its recorded decisions.');
    }
    if (Object.keys(c.subjectLinks).some(s => !subjects.includes(s)) || new Set(c.appliesTo).size !== c.appliesTo.length) fail('Invalid qualifier subject links.');
    const expectedLinks = subjects.filter(s => qualifierSubjectAllowed(c.code, s) && (c.subjectLinks[s] ?? 0) >= QUALIFIER_POLICY.supportThreshold);
    if (JSON.stringify(c.appliesTo) !== JSON.stringify(expectedLinks)) fail('Qualifier relationships must pass their scope and support checks.');
    if (c.passageSelection) parseQualifierChoice(c.passageSelection, passageKeys);
    if (c.citation) {
      const passage = passages.find(p => p.id === c.passageSelection?.choice);
      if (!passage || c.citation.page !== passage.page || c.citation.start !== passage.start || c.citation.end !== passage.end || c.citation.text !== passage.text) fail('Qualifier quotation must match the exact selected source passage.');
    } else if (c.passageSelection && c.passageSelection.choice !== QUALIFIER_NO_PASSAGE) fail('A selected qualifier passage needs its quotation.');
    if (c.status !== 'unchecked' && (!c.passageSelection || subjects.some(s => !Object.hasOwn(c.subjectLinks, s)))) fail('Checked qualifiers need complete raw judgments.');
    const supported = Boolean(c.citation && c.supportProbability >= QUALIFIER_POLICY.supportThreshold && c.citation.supportProbability >= QUALIFIER_POLICY.supportThreshold && c.appliesTo.length && (c.family !== '4' || (c.explicitPurposeProbability ?? 0) >= QUALIFIER_POLICY.supportThreshold));
    if (c.status === 'supported' && !supported) fail('Assigned qualifiers need source, passage and subject support.');
    if (c.status === 'no-passage' && (c.citation || c.passageSelection?.choice !== QUALIFIER_NO_PASSAGE)) fail('Invalid missing-passage qualifier.');
    if (detail.status === 'complete' && (c.status === 'unchecked' || (supported && c.status !== 'supported'))) fail('Incomplete qualifier verification.');
  }
  if (new Set(detail.qualifiers.map(c => c.code)).size !== detail.qualifiers.length || detail.qualifiers.some(c => c.status !== 'supported' || !detail.candidates.some(d => JSON.stringify(d) === JSON.stringify(c)))) fail('Assigned qualifiers must be unique supported candidates.');
  if (detail.qualifiers.some(c => detail.qualifiers.some(d => d.code !== c.code && qualifierAncestors(d.code).includes(c.code)))) fail('Redundant ancestor qualifiers cannot be assigned.');
  if (detail.qualifiers.filter(c => c.code.startsWith('5A') && !['5AR', '5AX', '5AZ', '5AV'].includes(c.code)).length > 1) fail('Use one base interest age.');
}

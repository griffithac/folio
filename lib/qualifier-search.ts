import { choice, noul, type EntryType, type Question } from '@typesafe-ai/sdk';
import { z } from 'zod';
import type { BookState } from './classification.ts';
import { subjectNode } from './hierarchy.ts';
import { sourcePassages, type SubjectEvaluator } from './subject-search.ts';
import { QUALIFIER_FAMILIES, QUALIFIER_NONE, QUALIFIER_RULES, QUALIFIER_SOURCE_RULE, QUALIFIER_VERSION, qualifierAncestors, qualifierAssignable, qualifierChildren, qualifierNode, qualifierQuestionGroups, qualifierScope, parseQualifierChoice, type QualifierChoice, type QualifierFamily } from './qualifier-catalog.ts';

// Pilot search and review policies; these are not calibrated accuracy guarantees.
export const QUALIFIER_POLICY = { beamWidth: 4, maxDepth: 10, maxRequests: 36, minimumEdge: .08, applicabilityThreshold: .35, supportThreshold: .8 } as const;
export type QualifierStep = { code: string; heading: string; decisionId: string };
export type QualifierDecision = QualifierChoice & { id: string; parent: string; group: number };
export type QualifierCandidate = {
  code: string; heading: string; family: QualifierFamily; path: QualifierStep[];
  rankingScore: number; supportProbability: number; subjectLinks: Record<string, number>; appliesTo: string[];
  status: 'supported' | 'insufficient-support' | 'no-passage' | 'unchecked';
  explicitPurposeProbability?: number;
  passageSelection?: QualifierChoice;
  citation?: { page: number; start: number; end: number; text: string; supportProbability: number };
};
export type DetailedQualifiers = {
  method: 'qualifier-beam-and-source-check-v1'; version: typeof QUALIFIER_VERSION;
  model: string; models: string[]; requests: number; status: 'complete' | 'partial' | 'unavailable';
  needsReview: boolean; reviewed?: boolean; stoppedReason: string;
  subjectCodes: string[]; applicability: Partial<Record<QualifierFamily, number>>;
  routing: QualifierDecision[]; candidates: QualifierCandidate[]; qualifiers: QualifierCandidate[];
  search: { beamWidth: number; maxDepth: number; pruned: boolean; exploredParents: string[]; supportThreshold: number };
};
type Path = { code: string; family: QualifierFamily; path: QualifierStep[]; logSum: number; count: number; terminal: boolean };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const rank = (path: Path) => Math.exp(path.logSum / path.count);
const yes = (raw: unknown) => z.object({ type: z.literal('noul'), noul: z.number().finite().min(0).max(1) }).parse(raw).noul;
export const QUALIFIER_NO_PASSAGE = 'No supporting passage';
export function qualifierState(state: Pick<BookState, 'samples' | 'pageCount'>, subjects: string[]): EntryType {
  return { pageCount: state.pageCount, samples: state.samples, subjects: subjects.map(code => ({ code, heading: subjectNode(code)!.CodeDescription })) };
}
// These exact restrictions are code-owned. Other conditional scope notes are
// supplied in full to the subject-relationship and source-support judgments.
export function qualifierSubjectAllowed(code: string, subject: string) {
  if (!subjectNode(subject) || !qualifierAssignable(code)) return false;
  if (code === '5AV') return !subject.startsWith('Y');
  if (code.startsWith('5A') && !['5AR', '5AX', '5AZ'].includes(code)) return subject.startsWith('Y') || subject.startsWith('X');
  return true;
}
export function qualifierBatches(state: EntryType, questions: Record<string, Question>) {
  const batches: { state: EntryType; questions: Record<string, Question> }[] = [];
  let pending: Record<string, Question> = {};
  for (const [id, question] of Object.entries(questions)) {
    if (bytes(state) + bytes(question) > 30000) throw new Error('A qualifier question exceeds the context budget.');
    const next = { ...pending, [id]: question };
    if (bytes({ state, questions: next }) > 60000) { batches.push({ state, questions: pending }); pending = { [id]: question }; }
    else pending = next;
  }
  if (Object.keys(pending).length) batches.push({ state, questions: pending });
  return batches;
}

export async function refineQualifiers(state: BookState, subjects: string[], evaluate: SubjectEvaluator, reserve: () => Promise<boolean> = async () => true): Promise<DetailedQualifiers> {
  if (!subjects.length || subjects.length > 6 || new Set(subjects).size !== subjects.length || subjects.some(code => !subjectNode(code) || code.length < 2)) throw new Error('Supported canonical subjects are required for qualifiers.');
  const result: DetailedQualifiers = { method: 'qualifier-beam-and-source-check-v1', version: QUALIFIER_VERSION, model: '', models: [], requests: 0, status: 'complete', needsReview: true, stoppedReason: '', subjectCodes: subjects,
    applicability: {}, routing: [], candidates: [], qualifiers: [], search: { beamWidth: QUALIFIER_POLICY.beamWidth, maxDepth: QUALIFIER_POLICY.maxDepth, pruned: false, exploredParents: [], supportThreshold: QUALIFIER_POLICY.supportThreshold } };
  const bookState = qualifierState(state, subjects);
  async function ask(questionState: EntryType, questions: Record<string, Question>) {
    const answers: Record<string, unknown> = {};
    for (const payload of qualifierBatches(questionState, questions)) {
      if (result.requests >= QUALIFIER_POLICY.maxRequests) throw new Error('Qualifier request budget exhausted.');
      if (!await reserve()) throw new Error('Daily qualifier quota exhausted. Retry tomorrow.');
      result.requests++; // Includes failed upstream attempts, excludes rejected quota reservations.
      const response = await evaluate(payload);
      if (response.model && !result.models.includes(response.model)) result.models.push(response.model);
      if (!response.model || (result.model && response.model !== result.model)) throw new Error('Qualifier model version changed during evaluation.');
      result.model = response.model;
      for (const id of Object.keys(payload.questions)) {
        if (!Object.hasOwn(response.answers, id)) throw new Error('Incomplete qualifier response.');
        answers[id] = response.answers[id];
      }
    }
    return answers;
  }
  function prune(paths: Path[]) {
    return QUALIFIER_FAMILIES.flatMap(family => {
      const group = paths.filter(p => p.family === family).sort((a, b) => rank(b) - rank(a));
      if (group.length > QUALIFIER_POLICY.beamWidth) result.search.pruned = true;
      return group.slice(0, QUALIFIER_POLICY.beamWidth);
    });
  }
  try {
    const roots = await ask(bookState, Object.fromEntries(QUALIFIER_FAMILIES.map(family => [`family_${family}`, noul({
      question: `Does at least one assignable qualifier in Thema ${family}: ${qualifierNode(family)!.CodeDescription} meaningfully refine at least one supplied subject of this book? Several dimensions may apply.`, scope: qualifierScope(family), rule: QUALIFIER_RULES[family], sourceRule: QUALIFIER_SOURCE_RULE,
    })])));
    let beam: Path[] = QUALIFIER_FAMILIES.flatMap(family => {
      const p = yes(roots[`family_${family}`]); result.applicability[family] = p;
      return p >= QUALIFIER_POLICY.applicabilityThreshold ? [{ code: family, family, path: [], logSum: Math.log(Math.max(p, 1e-12)), count: 1, terminal: false }] : [];
    });
    for (let depth = 1; depth < QUALIFIER_POLICY.maxDepth; depth++) {
      const active = beam.filter(p => !p.terminal && qualifierChildren(p.code).length);
      if (!active.length) break;
      const groups = active.flatMap(p => qualifierQuestionGroups(p.code, bookState));
      const answers = await ask(bookState, Object.fromEntries(groups.map(g => [g.id, g.question])));
      const next = beam.filter(p => p.terminal);
      for (const path of active) {
        result.search.exploredParents.push(path.code);
        let hasChild = false; const noneProbabilities: number[] = [];
        for (const group of groups.filter(g => g.parent === path.code)) {
          const answer = parseQualifierChoice(answers[group.id], Object.keys(group.question.criteria));
          result.routing.push({ ...answer, id: group.id, parent: group.parent, group: group.group });
          noneProbabilities.push(answer.probabilities[QUALIFIER_NONE]);
          for (const [code, p] of Object.entries(answer.probabilities)) {
            if (code === QUALIFIER_NONE || p < QUALIFIER_POLICY.minimumEdge) continue;
            hasChild = true;
            next.push({ code, family: path.family, terminal: !qualifierChildren(code).length, path: [...path.path, { code, heading: qualifierNode(code)!.CodeDescription, decisionId: group.id }], logSum: path.logSum + Math.log(p), count: path.count + 1 });
          }
        }
        // No-match is local to each partition. Retain a supported broader route
        // when all partitions give it material support, alongside narrower
        // candidates. Never assign routing placeholders.
        if (qualifierAssignable(path.code) && (!hasChild || noneProbabilities.every(p => p >= QUALIFIER_POLICY.minimumEdge))) next.push({ ...path, terminal: true, logSum: path.logSum + Math.log(Math.max(Math.min(...noneProbabilities), 1e-12)), count: path.count + 1 });
      }
      beam = prune(next);
    }
    if (beam.some(p => !p.terminal && qualifierChildren(p.code).length)) throw new Error('Qualifier depth budget exhausted.');
    const passages = sourcePassages(state);
    const passageKeys = [...passages.map(p => p.id), QUALIFIER_NO_PASSAGE];
    if (passageKeys.length > 255) throw new Error('Qualifier evidence options exceed the context budget.');
    const evidence: EntryType = { passages: Object.fromEntries(passages.map(p => [p.id, { page: p.page, text: p.text }])), subjects: subjects.map(code => ({ code, heading: subjectNode(code)!.CodeDescription })) };
    const paths = beam.filter(p => qualifierAssignable(p.code));
    async function checkPaths(paths: Path[]) {
    const candidates: QualifierCandidate[] = paths.map(p => ({ code: p.code, heading: qualifierNode(p.code)!.CodeDescription, family: p.family, path: p.path, rankingScore: rank(p), supportProbability: 0, subjectLinks: {}, appliesTo: [], status: 'unchecked' }));
    result.candidates.push(...candidates);
    const questions: Record<string, Question> = {};
    for (const candidate of candidates) {
      const common = { scope: qualifierScope(candidate.code), rule: QUALIFIER_RULES[candidate.family], sourceRule: QUALIFIER_SOURCE_RULE };
      questions[`support_${candidate.code}`] = noul({ question: `Does a substantial part of the supplied book content establish Thema qualifier ${candidate.code}: ${candidate.heading}? This is an independent, nonexclusive qualifier: other substantial parts may concern different places, periods, languages or courses. The qualifier need not describe the entire book. Mere mentions, metadata and outside knowledge are insufficient.`, ...common });
      questions[`passage_${candidate.code}`] = choice({ question: `Which exact passage directly supports Thema qualifier ${candidate.code}: ${candidate.heading}? Select ${QUALIFIER_NO_PASSAGE} if none establishes it.`, ...common }, Object.fromEntries([...passages.map(p => [p.id, `PDF page ${p.page}, offset ${p.start}`]), [QUALIFIER_NO_PASSAGE, 'No passage directly establishes this qualifier.']]));
      for (const subject of subjects) questions[`link_${candidate.code}_${subject}`] = noul({ question: `Does Thema qualifier ${candidate.code}: ${candidate.heading} meaningfully refine a substantial part of this book's content classified as subject ${subject}: ${subjectNode(subject)!.CodeDescription}? Other substantial parts may have different qualifiers; this need not be the only qualifier. Respect usage restrictions; an unrelated topic or incidental mention does not refine this subject.`, subjectScope: String(subjectNode(subject)!.CodeNotes || ''), ...common });
    }
    const checks = await ask(evidence, questions);
    for (const candidate of candidates) {
      candidate.supportProbability = yes(checks[`support_${candidate.code}`]);
      candidate.passageSelection = parseQualifierChoice(checks[`passage_${candidate.code}`], passageKeys);
      for (const subject of subjects) candidate.subjectLinks[subject] = yes(checks[`link_${candidate.code}_${subject}`]);
      candidate.appliesTo = subjects.filter(subject => qualifierSubjectAllowed(candidate.code, subject) && candidate.subjectLinks[subject] >= QUALIFIER_POLICY.supportThreshold);
      const passage = passages.find(p => p.id === candidate.passageSelection!.choice);
      candidate.citation = passage ? { page: passage.page, start: passage.start, end: passage.end, text: passage.text, supportProbability: 0 } : undefined;
      candidate.status = passage ? 'insufficient-support' : 'no-passage';
    }
    const quoteState: Record<string, EntryType> = {}, quoteQuestions: Record<string, Question> = {};
    for (const candidate of candidates.filter(c => c.citation)) {
      quoteState[candidate.code] = { text: candidate.citation!.text, page: candidate.citation!.page };
      quoteQuestions[`quote_${candidate.code}`] = noul({ question: `Does a substantive statement or narrated event in the source quotation at \`${candidate.code}.text\` provide direct textual evidence for Thema qualifier ${candidate.code}: ${candidate.heading}? This is nonexclusive: other statements may describe different places, periods, languages or courses. Evaluate only this quotation, without other passages or outside knowledge.${candidate.family === '4' ? ' The quotation must establish this particular educational purpose, examination, curriculum or level. Generic course instruction, a teacher or a student does not by itself establish a particular age, level or curriculum.' : ''}`, scope: qualifierScope(candidate.code), rule: QUALIFIER_RULES[candidate.family], sourceRule: QUALIFIER_SOURCE_RULE });
      if (candidate.family === '4') quoteQuestions[`purpose_${candidate.code}`] = noul({ question: `Does the quoted text at \`${candidate.code}.text\` EXPLICITLY identify its educational purpose as ${candidate.heading}? This tests what the text says, not what a course usually implies. If the heading names an age group, educational level, country-specific curriculum, institution or examination, the quotation must explicitly name or unambiguously state that particular purpose. Generic learners, students, teachers, courses and prose difficulty are insufficient to establish an unstated level or curriculum.`, sourceRule: QUALIFIER_SOURCE_RULE }, { true: 'The quotation explicitly states the particular educational purpose or names this examination/curriculum/level, or an unambiguous equivalent.', false: 'This specific purpose is not stated. It would have to be assumed from generic instruction, learner roles, prose difficulty or external knowledge.' });
    }
    const quotes = await ask(quoteState, quoteQuestions);
    for (const candidate of candidates) {
      if (!candidate.citation) continue;
      candidate.citation.supportProbability = yes(quotes[`quote_${candidate.code}`]);
      if (candidate.family === '4') candidate.explicitPurposeProbability = yes(quotes[`purpose_${candidate.code}`]);
      if (candidate.supportProbability >= QUALIFIER_POLICY.supportThreshold && candidate.citation.supportProbability >= QUALIFIER_POLICY.supportThreshold && candidate.appliesTo.length && (candidate.family !== '4' || candidate.explicitPurposeProbability! >= QUALIFIER_POLICY.supportThreshold)) candidate.status = 'supported';
    }
    }
    await checkPaths(paths);
    // Failed specificity must not erase a supported broader fact. Independently
    // check actual ancestors without lowering any source or relationship gate.
    for (let round = 0; round < 2; round++) {
      const fallback: Path[] = [];
      for (const c of result.candidates.filter(c => c.status !== 'supported')) {
        const path = c.path.slice(0, -1), code = path.at(-1)?.code;
        if (!code || !qualifierAssignable(code) || result.candidates.some(d => d.code === code) || fallback.some(p => p.code === code) || result.candidates.some(d => d.status === 'supported' && qualifierAncestors(d.code).includes(code))) continue;
        const probabilities = path.map(step => result.routing.find(d => d.id === step.decisionId)!.probabilities[step.code]);
        const p = result.applicability[c.family]!;
        fallback.push({ code, family: c.family, path, logSum: Math.log(p) + probabilities.reduce((sum, value) => sum + Math.log(value), 0), count: path.length + 1, terminal: true });
      }
      if (!fallback.length) break;
      await checkPaths(prune(fallback));
    }
    result.qualifiers = result.candidates.filter(c => c.status === 'supported' && !result.candidates.some(d => d.status === 'supported' && d.code !== c.code && qualifierAncestors(d.code).includes(c.code)));
    // Thema asks for one base interest age, not competing starting-age claims.
    const baseAges = result.qualifiers.filter(c => c.code.startsWith('5A') && !['5AR', '5AX', '5AZ', '5AV'].includes(c.code)).sort((a, b) => b.rankingScore - a.rankingScore);
    if (baseAges.length > 1) { result.qualifiers = result.qualifiers.filter(c => !baseAges.slice(1).includes(c)); result.search.pruned = true; }
    result.stoppedReason = result.qualifiers.length ? 'Source-backed qualifier suggestions are ready for review.' : 'No qualifier passed the source and subject-relationship checks in the supplied text.';
  } catch (error) {
    // Completed initial labels and subjects remain intact. Failure never becomes
    // a claim that the book has no qualifiers or a partially verified assignment.
    result.status = result.requests ? 'partial' : 'unavailable'; result.qualifiers = [];
    for (const candidate of result.candidates) if (candidate.status === 'supported') candidate.status = 'unchecked';
    const message = (error as Error).message;
    result.stoppedReason = /budget|quota|context|Incomplete|model version/i.test(message) ? message : 'Qualifier service interrupted. Existing book results are saved; retry this stage.';
  }
  return result;
}

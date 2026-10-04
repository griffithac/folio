import { choice, type EntryType } from '@typesafe-ai/sdk';
import { z } from 'zod';
import { LANGUAGE_CATALOG, LANGUAGE_METHOD, LANGUAGE_GROUPS, LANGUAGE_NONE, LANGUAGE_INSTRUCTION, languageByCode, languageCriteria } from './language-catalog.ts';
import type { Judgment, Classification } from './catalog.ts';

const probability = z.number().finite().min(0).max(1);
export const languageChoiceSchema = z.object({ type: z.literal('choice'), choice: z.string().max(4), confidence: probability, probabilities: z.record(probability) });
export type LanguageChoice = z.infer<typeof languageChoiceSchema>;
export type LanguageAnalysis = {
  method: typeof LANGUAGE_METHOD; catalog: typeof LANGUAGE_CATALOG; model: string;
  groups: (LanguageChoice & { id: string })[]; candidates: string[];
  status: 'resolved' | 'unassigned' | 'conflict' | 'arbitrated' | 'arbitration-failed';
  basis: 'group' | 'arbitration' | 'fallback'; selectedGroup?: string;
  requests: 1 | 2; needsReview: boolean; reason: string;
  arbitration?: LanguageChoice & { model: string };
};
export function parseLanguageChoice(raw: unknown, criteria: Record<string, string>): LanguageChoice {
  const answer = languageChoiceSchema.parse(raw); const keys = Object.keys(criteria);
  if (!keys.includes(answer.choice) || keys.some(key => !Object.hasOwn(answer.probabilities, key)) || Object.keys(answer.probabilities).some(key => !keys.includes(key)) || Math.abs(Object.values(answer.probabilities).reduce((a, b) => a + b, 0) - 1) >= 0.06) throw new Error('Invalid language distribution.');
  return answer;
}
export function languageQuestions() {
  return Object.fromEntries(LANGUAGE_GROUPS.map(group => [group.id, choice(LANGUAGE_INSTRUCTION, group.criteria)]));
}
function judgment(answer?: LanguageChoice): Classification['language'] {
  const item = languageByCode(answer?.choice || 'und')!;
  return { label: item.label, iso639_1: item.iso639_1, iso639_2: item.iso639_2,
    confidence: answer?.confidence ?? 0,
    // Map only this actual question's distribution. Never combine partitions
    // as though their independently normalized probabilities were comparable.
    probabilities: answer ? Object.fromEntries(Object.entries(answer.probabilities).map(([code, p]) => [code === LANGUAGE_NONE ? 'Outside this language group / uncertain' : languageByCode(code)!.label, p])) : {},
  };
}
export function normalizeLanguages(answers: Record<string, unknown>, model: string): { language: Classification['language']; languageAnalysis: LanguageAnalysis } {
  const groups = LANGUAGE_GROUPS.map(group => ({ ...parseLanguageChoice(answers[group.id], group.criteria), id: group.id }));
  const candidates = [...new Set(groups.map(group => group.choice).filter(code => code !== LANGUAGE_NONE))].sort();
  const selected = candidates.length === 1 ? groups.filter(group => group.choice === candidates[0]).sort((a, b) => a.confidence - b.confidence || a.id.localeCompare(b.id))[0] : undefined;
  const collective = Boolean(selected && languageByCode(selected.choice)?.collective);
  return { language: judgment(selected), languageAnalysis: {
    method: LANGUAGE_METHOD, catalog: LANGUAGE_CATALOG, model, groups, candidates,
    status: selected ? 'resolved' : candidates.length ? 'conflict' : 'unassigned',
    basis: selected ? 'group' : 'fallback', ...(selected ? { selectedGroup: selected.id } : {}), requests: 1,
    needsReview: !selected || collective || groups.some(group => group.confidence < 0.7),
    reason: selected ? collective ? 'A collective language grouping was selected; review for a more specific language.' : 'The independent language groups selected one consistent candidate.' : candidates.length ? 'Language groups disagree; a comparison is required.' : 'No group identified a language. Undetermined is a code fallback, not a Jev confidence judgment.',
  } };
}
export function languageArbitrationRequest(state: EntryType, analysis: LanguageAnalysis) {
  if (analysis.status !== 'conflict' || analysis.candidates.length < 2) throw new Error('No language conflict to compare.');
  return { state, questions: { language_resolution: choice({
    question: 'Which candidate best describes the dominant natural prose language? Decide from samples[].text, not prior answers. Prefer a specific language to a collective. Use mul only when no prose language dominates, zxx only with no natural linguistic content, und when none fits. Ignore programming/markup languages, mentions and incidental quotations.', sourceRule: 'Apply evidencePolicy.',
  }, languageCriteria(analysis.candidates)) } };
}
export async function resolveLanguageConflict(result: Classification, state: EntryType, evaluate: (payload: ReturnType<typeof languageArbitrationRequest>) => Promise<unknown>, reserve: () => Promise<boolean> = async () => true): Promise<Classification> {
  const analysis = result.languageAnalysis;
  if (!analysis || analysis.status !== 'conflict') return result;
  const next = { ...analysis }; let reserved = false;
  try {
    const payload = languageArbitrationRequest(state, analysis);
    if (!await reserve()) throw new Error('quota');
    reserved = true; next.requests = 2;
    const raw = z.object({ model: z.string().min(1), answers: z.object({ language_resolution: languageChoiceSchema }) }).parse(await evaluate(payload));
    const answer = parseLanguageChoice(raw.answers.language_resolution, languageCriteria(analysis.candidates));
    // Keep a valid response even on model drift for audit, but never use it.
    next.arbitration = { ...answer, model: raw.model };
    if (raw.model !== analysis.model) throw new Error('model-drift');
    next.status = 'arbitrated'; next.basis = 'arbitration';
    next.needsReview = answer.choice === 'und' || answer.confidence < 0.7 || Boolean(languageByCode(answer.choice)?.collective);
    next.reason = answer.choice === 'und' ? 'The comparison could not determine a language.' : 'A separate comparison resolved conflicting language-group answers; its distribution is preserved.';
    return { ...result, language: judgment(answer), languageAnalysis: next };
  } catch (error) {
    next.status = 'arbitration-failed'; next.needsReview = true;
    next.reason = !reserved ? 'The extra comparison could not reserve quota. Language remains undetermined; other classification results are retained.' : error instanceof Error && error.message === 'model-drift' ? 'The model changed during comparison. Language remains undetermined; both model IDs are retained.' : 'The comparison failed or returned invalid output. Language remains undetermined; other classification results are retained.';
    return { ...result, languageAnalysis: next };
  }
}

const groupSchema = languageChoiceSchema.extend({ id: z.string().max(20) });
export const languageAnalysisSchema = z.object({
  method: z.literal(LANGUAGE_METHOD), catalog: z.object({ version: z.literal(LANGUAGE_CATALOG.version), source: z.literal(LANGUAGE_CATALOG.source), sha256: z.literal(LANGUAGE_CATALOG.sha256) }).strict(),
  model: z.string().min(1).max(100), groups: z.array(groupSchema).length(3), candidates: z.array(z.string().max(3)).max(3),
  status: z.enum(['resolved', 'unassigned', 'conflict', 'arbitrated', 'arbitration-failed']), basis: z.enum(['group', 'arbitration', 'fallback']), selectedGroup: z.string().max(20).optional(),
  requests: z.union([z.literal(1), z.literal(2)]), needsReview: z.boolean(), reason: z.string().min(1).max(400),
  arbitration: languageChoiceSchema.extend({ model: z.string().min(1).max(100) }).optional(),
}).strict().superRefine((analysis, ctx) => {
  try { validateLanguageAnalysis(analysis); } catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid language analysis provenance.' }); }
});
export function validateLanguageAnalysis(analysis: LanguageAnalysis, language?: Judgment & { iso639_1?: string | null; iso639_2?: string }, model?: string) {
  if (analysis.groups.some((group, i) => group.id !== LANGUAGE_GROUPS[i].id)) throw new Error('Invalid groups.');
  const base = normalizeLanguages(Object.fromEntries(analysis.groups.map(group => [group.id, group])), analysis.model);
  if (JSON.stringify(base.languageAnalysis.candidates) !== JSON.stringify(analysis.candidates) || (model && model !== analysis.model)) throw new Error('Invalid candidates or model.');
  let expected = base.language;
  if (analysis.status === 'arbitrated') {
    if (base.languageAnalysis.status !== 'conflict' || !analysis.arbitration || analysis.arbitration.model !== analysis.model || analysis.requests !== 2 || analysis.basis !== 'arbitration' || analysis.selectedGroup) throw new Error('Invalid comparison.');
    const answer = parseLanguageChoice(analysis.arbitration, languageCriteria(analysis.candidates)); expected = judgment(answer);
    if ((answer.choice === 'und' || answer.confidence < .7 || languageByCode(answer.choice)?.collective) && !analysis.needsReview) throw new Error('Missing review.');
  } else if (analysis.status === 'arbitration-failed') {
    if (base.languageAnalysis.status !== 'conflict' || analysis.basis !== 'fallback' || !analysis.needsReview || analysis.selectedGroup) throw new Error('Invalid failure.');
    if (analysis.arbitration) {
      parseLanguageChoice(analysis.arbitration, languageCriteria(analysis.candidates));
      if (analysis.requests !== 2 || analysis.arbitration.model === analysis.model) throw new Error('Invalid rejected comparison.');
    }
  } else {
    if (analysis.status !== base.languageAnalysis.status || analysis.basis !== base.languageAnalysis.basis || analysis.requests !== 1 || analysis.arbitration || analysis.selectedGroup !== base.languageAnalysis.selectedGroup || (base.languageAnalysis.needsReview && !analysis.needsReview)) throw new Error('Invalid outcome.');
  }
  if (language && (language.label !== expected.label || language.iso639_2 !== expected.iso639_2 || language.iso639_1 !== expected.iso639_1 || language.confidence !== expected.confidence || Object.keys(language.probabilities).length !== Object.keys(expected.probabilities).length || Object.entries(expected.probabilities).some(([key, p]) => language.probabilities[key] !== p))) throw new Error('Language does not match its source judgments.');
}

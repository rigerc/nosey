#!/usr/bin/env node
import {z} from 'zod';
import {
  errorCode,
  jsonObjectSchema,
  type JsonObject,
  type JsonValue,
  isString,
} from '../src/lib/values.ts';

/**
 * Propose mappings for previously unmapped skills in build-skills-catalog output.
 * This is a read-only proposal tool: it NEVER changes skills-map.ts or installs skills.
 *
 * Run on Node 22.9+ with --experimental-strip-types. No added npm dependencies.
 */
import {createHash} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

import {
  COMBO_SKILLS_MAP,
  SKILLS_MAP,
  type ComboSkill,
  type Technology,
} from '../src/data/skills-map.ts';

import {
  RemoteSource,
  rawSkillUrl,
  readFrontmatter,
  type Catalogue,
  type SkillRecord,
} from './build-skills-catalog.ts';

const MAX_TEXT = 12_000;
const DEFAULT_OUTPUT = 'out/skill-mapping/proposals.json';
const QUESTION_SPEC_VERSION = 2;
const OUTPUT_SCHEMA_VERSION = 2;

export interface MapperOptions {
  input: string;
  output: string;
  reviewOutput: string | null;
  url: string;
  model: string;
  batchSize: number;
  limit: number;
  noModel: boolean;
  fetchDocs: boolean;
  restart: boolean;
}

export type Candidate = {id: string; name: string};

export type ComboCandidate = Candidate & {requires: string[]};

export type Judgment = Candidate & {
  probability: number | null;
  band: 'strong' | 'review' | 'weak' | 'not_evaluated';
};

export type ComboJudgment = Judgment & {requires: string[]};

type Question = {
  type: 'noul' | 'choice';
  instructions: string;
  criteria?: Record<string, string>;
};

export interface QuestionSet {
  [key: string]: Question;
}

export type CandidateSet = {
  technologies: Candidate[];
  combinations: ComboCandidate[];
};

export function parseOptions(argv: string[]): MapperOptions {
  const options: MapperOptions = {
    input: 'skills-catalog.json',
    output: DEFAULT_OUTPUT,
    reviewOutput: null,
    url: process.env['KEV_BASE_URL'] || 'http://127.0.0.1:8009',
    model: process.env['KEV_MODEL'] || 'kev-latest',
    batchSize: 24,
    limit: 0,
    noModel: false,
    fetchDocs: false,
    restart: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];

    if (flag === undefined) continue;

    if (flag === '--no-model') {
      options.noModel = true;
      continue;
    }

    if (flag === '--fetch-docs') {
      options.fetchDocs = true;
      continue;
    }

    if (flag === '--restart') {
      options.restart = true;
      continue;
    }

    if (
      ![
        '--input',
        '--output',
        '--review-output',
        '--url',
        '--model',
        '--batch-size',
        '--limit',
      ].includes(flag)
    ) {
      throw new Error('Unknown option: ' + flag);
    }

    const value = argv[++i];

    if (!value) throw new Error('Missing value for ' + flag);

    switch (flag) {
      case '--input':
        options.input = value;
        break;
      case '--output':
        options.output = value;
        break;
      case '--review-output':
        options.reviewOutput = value;
        break;
      case '--url':
        options.url = value;
        break;
      case '--model':
        options.model = value;
        break;
      case '--batch-size':
        options.batchSize = Number(value);
        break;
      case '--limit':
        options.limit = Number(value);
        break;
    }
  }

  if (
    !Number.isSafeInteger(options.batchSize) ||
    options.batchSize < 1 ||
    options.batchSize > 64 ||
    !Number.isSafeInteger(options.limit) ||
    options.limit < 0 ||
    !/^https?:\/\/[^/]+/i.test(options.url)
  ) {
    throw new Error('Invalid options: batch-size 1..64, limit >= 0, and HTTP(S) URL required');
  }

  validateOutputPaths(options);

  return options;
}

function validateOutputPaths(options: Pick<MapperOptions, 'input' | 'output' | 'reviewOutput'>) {
  if (resolve(options.input) === resolve(options.output)) {
    throw new Error('Input and proposal output paths must differ');
  }

  if (options.reviewOutput) {
    if (resolve(options.reviewOutput) === resolve(options.input)) {
      throw new Error('Input and review output paths must differ');
    }

    if (resolve(options.reviewOutput) === resolve(options.output)) {
      throw new Error('Review and proposal output paths must differ');
    }
  }
}

const strings = (values: (string | null | undefined)[]) =>
  values.filter((item): item is string => isString(item) && Boolean(item.trim()));

const sha256 = (content: string) => createHash('sha256').update(content).digest('hex');

export function skillText(skill: SkillRecord, document = ''): string {
  return strings([
    skill.name,
    skill.description,
    skill.category,
    ...(skill.tags || []),
    skill.officialskills?.overview,
    ...(skill.officialskills?.when_to_use || []),
    document,
  ])
    .join('\n')
    .slice(0, MAX_TEXT);
}

/**
 * No lexical retrieval gate: every canonical technology and existing combination
 * is independently evaluated, even when the name is absent from SKILL.md.
 */
export function allCandidates(
  technologies: Technology[] = SKILLS_MAP,
  combinations: ComboSkill[] = COMBO_SKILLS_MAP,
): CandidateSet {
  return {
    technologies: technologies.map(({id, name}) => ({id, name})),
    combinations: combinations
      .values()
      .filter((combo) => combo.requires.length > 1)
      .map((combo) => ({
        id: combo.id,
        name: combo.name,
        requires: [...combo.requires],
      }))
      .toArray(),
  };
}

export function isVerified(skill: SkillRecord): boolean {
  const check = skill.skill_md;

  return Boolean(
    check?.exists &&
    check.has_frontmatter &&
    !check.name_mismatch &&
    check.source_cache !== 'stale' &&
    !['invalid', 'unresolved', 'error', 'missing', 'name-mismatch'].includes(check.reason),
  );
}

/**
 * Fetch SKILL.md only from catalog-verified paths; fresh-check its frontmatter again.
 * SKILL.md is untrusted data and is never executed or used as model instructions.
 */
export async function fetchSkillDocument(
  skill: SkillRecord,
  source: RemoteSource,
): Promise<string> {
  if (!isVerified(skill) || !skill.skill_md?.path || !skill.repository) return '';

  const resource = await source.resource(
    rawSkillUrl(skill.repository, skill.skill_md.path),
    'text/plain',
  );

  if (!resource.ok || resource.cache === 'stale') return '';
  const frontmatter = readFrontmatter(resource.body);
  const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = [skill.name, skill.id.split('/').at(-1) || '', skill.officialskills?.name || ''];

  if (
    !frontmatter.has_frontmatter ||
    !frontmatter.name ||
    !aliases.some((alias) => key(alias) === key(frontmatter.name!)) ||
    (skill.skill_md?.sha256 && sha256(resource.body) !== skill.skill_md.sha256)
  )
    return '';

  return resource.body.slice(0, MAX_TEXT);
}

export function buildQuestions(candidates: CandidateSet): QuestionSet {
  const questions: QuestionSet = {};
  candidates.technologies.forEach((technology, i) => {
    questions['technology_' + i] = {
      type: 'noul',
      instructions:
        'Does this skill provide actionable guidance directly applicable to ' +
        technology.name +
        '? Do not infer support solely because technologies are related.',
      criteria: {
        true: 'The documented skill is directly applicable to ' + technology.name,
        false: 'The documentation does not establish direct applicability',
      },
    };
  });
  candidates.combinations.forEach((combo, i) => {
    questions['combination_' + i] = {
      type: 'noul',
      instructions:
        'Does this skill specifically require the combination ' +
        combo.name +
        ' (' +
        combo.requires.join(', ') +
        '), rather than merely supporting one of its technologies?',
      criteria: {
        true: 'The joint technology requirement is supported by the documentation',
        false: 'The combination is not required or has insufficient support',
      },
    };
  });

  return questions;
}

export function scopeQuestion(): Question {
  return {
    type: 'choice',
    instructions:
      'Classify the documented primary use of this AI agent skill, not incidental technology mentions.',
    criteria: {
      technology_specific: 'Broadly useful whenever its primary technology is used',
      combination_specific: 'Requires multiple named technologies together',
      task_specific: 'Applicable only for a particular task, such as migration or troubleshooting',
      general: 'Useful across projects without a specific technology requirement',
      unclear: 'Insufficient documentation to determine applicability',
    },
  };
}

export function band(probability: number | null): Judgment['band'] {
  if (probability === null) return 'not_evaluated';

  if (probability >= 0.9) return 'strong';

  if (probability >= 0.55) return 'review';

  return 'weak';
}

const probabilitySchema = z.object({noul: z.number().min(0).max(1)});
const choiceSchema = z.object({choice: z.string()});

const scopeSchema = z.object({
  choice: z.enum([
    'technology_specific',
    'combination_specific',
    'task_specific',
    'general',
    'unclear',
  ]),
});

function probabilityOf(value: JsonValue): number | null {
  const parsed = probabilitySchema.safeParse(value);

  return parsed.success ? parsed.data.noul : null;
}

export function interpretAnswers(candidates: CandidateSet, answers: JsonObject | null) {
  const judgment = (candidate: Candidate, key: string) => {
    const probability = answers ? probabilityOf(answers[key]) : null;

    return {...candidate, probability, band: band(probability)};
  };

  const technologies = candidates.technologies.map((candidate, i) =>
    judgment(candidate, 'technology_' + i),
  );

  const combinations = candidates.combinations.map((candidate, i) => ({
    ...judgment(candidate, 'combination_' + i),
    requires: candidate.requires,
  }));

  const parsedScope = scopeSchema.safeParse(answers?.['scope']);
  const scope = parsedScope.success ? parsedScope.data.choice : null;

  return {technologies, combinations, scope};
}

export async function askKev(
  state: JsonObject,
  questions: QuestionSet,
  options: Pick<MapperOptions, 'url' | 'model'>,
  fetcher: typeof fetch = fetch,
): Promise<JsonObject> {
  const headers = new Headers({'content-type': 'application/json'});

  if (process.env['KEV_API_KEY'])
    headers.set('authorization', 'Bearer ' + process.env['KEV_API_KEY']);

  const response = await fetcher(options.url.replace(/\/+$/, '') + '/v1/systemone', {
    method: 'POST',
    headers,
    body: JSON.stringify({model: options.model, state, questions}),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) throw new Error('Kev HTTP ' + response.status);
  const responseSchema = z.object({answers: jsonObjectSchema});
  const parsed = responseSchema.safeParse(await response.json());

  if (!parsed.success) throw new Error('Invalid System One response: missing answers');
  const answers = parsed.data.answers;

  for (const [key, question] of Object.entries(questions)) {
    if (question.type === 'noul' && probabilityOf(answers[key]) === null)
      throw new Error('Invalid System One noul answer: ' + key);

    if (question.type === 'choice' && !choiceSchema.safeParse(answers[key]).success)
      throw new Error('Invalid System One choice answer: ' + key);
  }

  return answers;
}

async function writeAtomic<T>(path: string, value: T): Promise<void> {
  await mkdir(dirname(resolve(path)), {recursive: true});
  const temporary = path + '.' + process.pid + '.tmp';
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await rename(temporary, path);
}

export type EvaluationError = {
  skill_id: string;
  stage: string;
  chunk: number;
  error: string;
};

export function skillFingerprint(
  skill: SkillRecord,
  registrySha: string,
  options: MapperOptions,
): string {
  const check = skill.skill_md;

  return sha256(
    JSON.stringify({
      question_spec: QUESTION_SPEC_VERSION,
      registry: registrySha,
      model: options.noModel ? null : options.model,
      endpoint: options.noModel ? null : options.url.replace(/\/+$/, ''),
      fetch_docs: options.fetchDocs,
      batch_size: options.batchSize,
      skill: {
        id: skill.id,
        name: skill.name,
        repository: skill.repository,
        description: skill.description,
        category: skill.category,
        tags: skill.tags,
        officialskills: skill.officialskills,
        skill_md: check && {
          sha256: check.sha256,
          path: check.path,
          reason: check.reason,
          has_frontmatter: check.has_frontmatter,
          name_mismatch: check.name_mismatch,
        },
      },
    }),
  );
}

export async function evaluateSkill(
  skill: SkillRecord,
  document: string,
  options: MapperOptions,
  fetcher: typeof fetch = fetch,
) {
  const candidates = allCandidates();

  const state = {
    skill: {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      tags: skill.tags,
      overview: skill.officialskills?.overview,
      when_to_use: skill.officialskills?.when_to_use,
      skill_md_excerpt: document,
    },
  };

  const errors: EvaluationError[] = [];
  const technologies: Judgment[] = [];
  const combinations: ComboJudgment[] = [];
  let successfulBatches = 0;

  const evaluateGroup = async (kind: 'technologies' | 'combinations') => {
    const entries = candidates[kind];

    for (let start = 0; start < entries.length; start += options.batchSize) {
      const chunk = entries.slice(start, start + options.batchSize);

      const subset: CandidateSet = {
        technologies: kind === 'technologies' ? chunk : [],
        combinations:
          kind === 'combinations'
            ? chunk.filter((item): item is ComboCandidate => 'requires' in item)
            : [],
      };

      let answers: JsonObject | null = null;

      if (!options.noModel) {
        try {
          answers = await askKev(state, buildQuestions(subset), options, fetcher);
          successfulBatches++;
        } catch (error) {
          errors.push({
            skill_id: skill.id,
            stage: kind,
            chunk: Math.floor(start / options.batchSize),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const interpretation = interpretAnswers(subset, answers);

      if (kind === 'technologies') technologies.push(...interpretation.technologies);
      else combinations.push(...interpretation.combinations);
    }
  };

  // The second pass assesses all existing combinations, not just those whose
  // requirements received high probabilities. No retrieval can suppress a match.
  await evaluateGroup('technologies');
  await evaluateGroup('combinations');
  let scope: string | null = null;

  if (!options.noModel) {
    try {
      const answers = await askKev(
        {
          ...state,
          likely_technologies: technologies
            .values()
            .filter((item) => (item.probability ?? 0) >= 0.55)
            .map((item) => ({id: item.id, name: item.name}))
            .toArray(),
        },
        {scope: scopeQuestion()},
        options,
        fetcher,
      );

      const outcome = interpretAnswers({technologies: [], combinations: []}, answers);
      scope = outcome.scope;

      if (scope === null) throw new Error('Unexpected scope choice');
      successfulBatches++;
    } catch (error) {
      errors.push({
        skill_id: skill.id,
        stage: 'scope',
        chunk: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const evaluation = options.noModel
    ? 'not_evaluated'
    : errors.length === 0
      ? 'evaluated'
      : successfulBatches > 0
        ? 'partial'
        : 'failed';

  return {technologies, combinations, scope, evaluation, errors};
}

export async function run(options: MapperOptions, fetcher: typeof fetch = fetch) {
  validateOutputPaths(options);

  if (options.reviewOutput) {
    try {
      await readFile(options.reviewOutput, 'utf8');
      throw new Error(
        'Review file already exists; preserve decisions before generating a new one: ' +
          options.reviewOutput,
      );
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        throw error;
      }
    }
  }

  const catalog: Catalogue = JSON.parse(await readFile(options.input, 'utf8'));

  if (!Array.isArray(catalog.skills)) throw new Error('Input does not contain a skills array');

  const source = new RemoteSource({
    cacheDir: 'out/cache/skills-catalog',
    fetcher,
  });

  const skills = options.limit ? catalog.skills.slice(0, options.limit) : catalog.skills;

  const registrySha = sha256(
    JSON.stringify({technologies: SKILLS_MAP, combinations: COMBO_SKILLS_MAP}, (_key, value) =>
      value instanceof RegExp ? value.toString() : value,
    ),
  );

  const common = {
    schema_version: OUTPUT_SCHEMA_VERSION,
    question_spec_version: QUESTION_SPEC_VERSION,
    catalog_generated_at: catalog.generated_at,
    registry_sha256: registrySha,
    model: options.noModel ? null : options.model,
    endpoint: options.noModel ? null : options.url.replace(/\/+$/, ''),
    batch_size: options.batchSize,
    fetch_docs: options.fetchDocs,
    thresholds: {strong: 0.9, review: 0.55},
  };

  type Proposal = Awaited<ReturnType<typeof evaluateSkill>> & {
    skill_id: string;
    repository: string;
    skill_md_sha256: string | null;
    document_sha256: string;
    verified: boolean;
    document_status: string;
    fingerprint: string;
  };

  const prior = new Map<string, Proposal>();

  if (!options.restart) {
    try {
      const previous = JSON.parse(await readFile(options.output, 'utf8'));

      if (
        previous.schema_version === common.schema_version &&
        previous.question_spec_version === common.question_spec_version &&
        previous.registry_sha256 === common.registry_sha256 &&
        previous.model === common.model &&
        previous.endpoint === common.endpoint &&
        previous.batch_size === common.batch_size &&
        previous.fetch_docs === common.fetch_docs &&
        Array.isArray(previous.proposals)
      ) {
        for (const proposal of previous.proposals) {
          if (proposal && isString(proposal.skill_id)) prior.set(proposal.skill_id, proposal);
        }
      }
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        throw error;
      }
    }
  }

  const proposals: Proposal[] = [];
  let reused = 0;

  const snapshot = () => ({
    ...common,
    generated_at: new Date().toISOString(),
    completed: proposals.length,
    total: skills.length,
    reused,
    proposals,
    errors: proposals.flatMap((proposal) => proposal.errors),
  });

  for (const skill of skills) {
    const fingerprint = skillFingerprint(skill, registrySha, options);
    const previous = prior.get(skill.id);

    const documentRequired =
      options.fetchDocs && isVerified(skill) && Boolean(skill.skill_md?.path && skill.repository);

    if (
      previous &&
      previous.fingerprint === fingerprint &&
      (!documentRequired || previous.document_status === 'fetched') &&
      (previous.evaluation === 'evaluated' ||
        (options.noModel && previous.evaluation === 'not_evaluated'))
    ) {
      proposals.push(previous);
      reused++;
      await writeAtomic(options.output, snapshot());
      continue;
    }

    let document = '';
    let documentStatus = 'not_requested';

    if (options.fetchDocs) {
      try {
        document = await fetchSkillDocument(skill, source);
        documentStatus = document ? 'fetched' : 'unavailable';
      } catch {
        documentStatus = 'fetch_error';
      }
    }

    const assessed = await evaluateSkill(skill, document, options, fetcher);
    proposals.push({
      skill_id: skill.id,
      repository: skill.repository,
      skill_md_sha256: skill.skill_md?.sha256 || null,
      document_sha256: sha256(skillText(skill, document)),
      verified: isVerified(skill),
      document_status: documentStatus,
      fingerprint,
      ...assessed,
    });
    // A checkpoint after each skill makes interrupts recoverable. Partial
    // or failed skills are re-run on resume rather than silently accepted.
    await writeAtomic(options.output, snapshot());
  }

  const result = snapshot();
  await writeAtomic(options.output, result);

  if (options.reviewOutput) {
    await writeAtomic(options.reviewOutput, {
      notice: 'Review manually; this file never updates skills-map.ts automatically.',
      proposal_file: options.output,
      decisions: proposals.map((proposal) => ({
        skill_id: proposal.skill_id,
        accept_technologies: [],
        accept_combinations: [],
        disposition: 'pending',
        notes: '',
      })),
    });
  }

  return result;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const result = await run(options);
  console.log('Wrote ' + result.proposals.length + ' mapping proposals to ' + options.output);
  console.log('Kev evaluation errors: ' + result.errors.length);
  console.log('Reused completed skills: ' + result.reused);

  if (result.errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

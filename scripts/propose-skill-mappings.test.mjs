import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {COMBO_SKILLS_MAP, SKILLS_MAP} from '../src/data/skills-map.ts';
import {RemoteSource} from './build-skills-catalog.ts';
import {
	allCandidates,
	askKev,
	band,
	buildQuestions,
	evaluateSkill,
	fetchSkillDocument,
	interpretAnswers,
	isVerified,
	parseOptions,
	run,
	scopeQuestion,
} from './propose-skill-mappings.ts';

const fixture = (name = 'React performance', extra = {}) => ({
	id: 'example/skills/react-performance',
	name,
	repository: 'example/skills',
	description: 'Optimize React rendering.',
	category: 'development',
	tags: ['React'],
	sources: ['gold-basket'],
	...extra,
});
const fakeResponse =
	(calls, options = {}) =>
	async (_url, request) => {
		const body = JSON.parse(request.body);
		calls.push(body);
		if (options.failCall && calls.length === options.failCall)
			return new Response('bad gateway', {status: 503});
		const answers = Object.fromEntries(
			Object.entries(body.questions).map(([key, question]) => [
				key,
				question.type === 'noul'
					? {type: 'noul', noul: key.endsWith('_0') ? 0.96 : 0.05}
					: {type: 'choice', choice: 'technology_specific'},
			]),
		);
		return new Response(JSON.stringify({answers}), {status: 200});
	};

test('validates batch-size, restart and other CLI options', () => {
	const options = parseOptions([
		'--no-model',
		'--batch-size',
		'5',
		'--limit',
		'2',
		'--restart',
	]);
	assert.equal(options.noModel, true);
	assert.equal(options.batchSize, 5);
	assert.equal(options.limit, 2);
	assert.equal(options.restart, true);
	assert.throws(() => parseOptions(['--top-k', '12']), /Unknown option/);
	assert.throws(() => parseOptions(['--batch-size', '0']), /Invalid options/);
	assert.throws(() => parseOptions(['--batch-size', '65']), /Invalid options/);
	assert.throws(() => parseOptions(['--limit', '-1']), /Invalid options/);
	assert.throws(
		() => parseOptions(['--output', 'a', '--review-output', 'a']),
		/must differ/,
	);
});

test('exhaustive candidates include technologies never mentioned by a skill', () => {
	const c = allCandidates(
		[
			{id: 'react', name: 'React', detect: {}, skills: []},
			{id: 'vue', name: 'Vue', detect: {}, skills: []},
			{id: 'rust', name: 'Rust', detect: {}, skills: []},
		],
		[
			{
				id: 'react-rust',
				name: 'React + Rust',
				requires: ['react', 'rust'],
				skills: [],
			},
			{id: 'rust-only', name: 'Rust only', requires: ['rust'], skills: []},
		],
	);
	assert.deepEqual(
		c.technologies.map(x => x.id),
		['react', 'vue', 'rust'],
	);
	assert.deepEqual(
		c.combinations.map(x => x.id),
		['react-rust'],
	);
	const questions = buildQuestions(c);
	assert.equal(Object.keys(questions).length, 4);
	assert.match(questions.technology_1.instructions, /Vue/);
	assert.match(questions.technology_2.instructions, /Rust/);
	assert.match(questions.combination_0.instructions, /React \+ Rust/);
	assert.equal(scopeQuestion().type, 'choice');
});

test('full registry has one independent question per technology and combination', () => {
	const all = allCandidates();
	assert.equal(all.technologies.length, SKILLS_MAP.length);
	assert.equal(
		all.combinations.length,
		COMBO_SKILLS_MAP.filter(combo => combo.requires.length > 1).length,
	);
	assert.equal(
		Object.keys(buildQuestions(all)).length,
		all.technologies.length + all.combinations.length,
	);
	assert.ok(all.technologies.some(technology => technology.id === 'react'));
	assert.ok(all.technologies.some(technology => technology.id === 'aws'));
});

test('noul is probability of yes, not generic confidence', () => {
	const c = allCandidates(
		[{id: 'react', name: 'React', detect: {}, skills: []}],
		[],
	);
	const result = interpretAnswers(c, {
		technology_0: {type: 'noul', noul: 0.02},
	});
	assert.equal(result.technologies[0].probability, 0.02);
	assert.equal(result.technologies[0].band, 'weak');
	assert.equal(band(0.94), 'strong');
	assert.equal(band(null), 'not_evaluated');
});

test('System One uses typed questions and rejects malformed probabilities', async () => {
	const c = allCandidates(
		[{id: 'react', name: 'React', detect: {}, skills: []}],
		[],
	);
	const calls = [];
	const answers = await askKev(
		{skill: {name: 'React performance'}},
		buildQuestions(c),
		{
			url: 'http://127.0.0.1:8009',
			model: 'kev-latest',
		},
		fakeResponse(calls),
	);
	assert.equal(calls[0].model, 'kev-latest');
	assert.equal(calls[0].questions.technology_0.type, 'noul');
	assert.equal(answers.technology_0.noul, 0.96);
	await assert.rejects(
		() =>
			askKev(
				{},
				buildQuestions(c),
				{
					url: 'http://127.0.0.1:8009',
					model: 'kev-latest',
				},
				async () =>
					new Response(
						JSON.stringify({
							answers: {
								technology_0: {noul: 2},
							},
						}),
						{status: 200},
					),
			),
		/Invalid System One noul/,
	);
});

test('one skill evaluates all technologies and combinations in bounded batches', async () => {
	const calls = [];
	const opts = parseOptions(['--batch-size', '17']);
	const result = await evaluateSkill(fixture(), '', opts, fakeResponse(calls));
	assert.equal(result.evaluation, 'evaluated');
	assert.equal(result.errors.length, 0);
	assert.equal(result.technologies.length, SKILLS_MAP.length);
	assert.equal(
		result.combinations.length,
		COMBO_SKILLS_MAP.filter(c => c.requires.length > 1).length,
	);
	assert.equal(result.scope, 'technology_specific');
	assert.equal(
		calls.length,
		Math.ceil(SKILLS_MAP.length / 17) +
			Math.ceil(result.combinations.length / 17) +
			1,
	);
	const allButScope = calls.slice(0, -1);
	assert.ok(allButScope.every(req => Object.keys(req.questions).length <= 17));
	assert.ok(
		allButScope.every(
			req => JSON.stringify(req.state) === JSON.stringify(allButScope[0].state),
		),
	);
	assert.deepEqual(Object.keys(calls.at(-1).questions), ['scope']);
});

test('failed batch marks only its chunk unscored and never silently accepts partial results', async () => {
	const calls = [];
	const result = await evaluateSkill(
		fixture(),
		'',
		parseOptions(['--batch-size', '4']),
		fakeResponse(calls, {failCall: 2}),
	);
	assert.equal(result.evaluation, 'partial');
	assert.equal(result.errors.length, 1);
	assert.equal(result.errors[0].stage, 'technologies');
	assert.equal(result.errors[0].chunk, 1);
	assert.equal(result.technologies.length, SKILLS_MAP.length);
	assert.equal(result.technologies[4].probability, null);
	assert.equal(result.technologies[4].band, 'not_evaluated');
	assert.equal(result.technologies[0].probability, 0.96);
});

test('document enrichment requires verified identity and matching content hash', async () => {
	const document =
		'---\nname: React performance\ndescription: improves React\n---\nExamples';
	const sha256 = createHash('sha256').update(document).digest('hex');
	const check = {
		exists: true,
		has_frontmatter: true,
		name_mismatch: false,
		reason: 'ok',
		source_cache: 'miss',
		path: 'skills/react-performance/SKILL.md',
		sha256,
	};
	const skill = fixture('React performance', {skill_md: check});
	const url =
		'https://raw.githubusercontent.com/example/skills/HEAD/skills/react-performance/SKILL.md';
	const source = new RemoteSource({
		cacheDir: null,
		fetcher: async requestUrl =>
			new Response(requestUrl === url ? document : '', {
				status: requestUrl === url ? 200 : 404,
			}),
	});
	assert.equal(isVerified(skill), true);
	assert.equal(await fetchSkillDocument(skill, source), document);
	assert.equal(
		await fetchSkillDocument(
			fixture('React performance', {
				skill_md: {...check, sha256: 'outdated-hash'},
			}),
			source,
		),
		'',
	);
	assert.equal(
		isVerified(fixture('Other', {skill_md: {...check, source_cache: 'stale'}})),
		false,
	);
	assert.equal(
		isVerified(fixture('Other', {skill_md: {...check, reason: 'unresolved'}})),
		false,
	);
});

test('offline run writes all technology decisions as unscored, plus manual review template', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'skills-map-'));
	try {
		const input = join(dir, 'catalog.json');
		const output = join(dir, 'proposals.json');
		const review = join(dir, 'review.json');
		await writeFile(
			input,
			JSON.stringify({generated_at: '2026-01-01', skills: [fixture()]}),
		);
		const opts = parseOptions([
			'--input',
			input,
			'--output',
			output,
			'--review-output',
			review,
			'--no-model',
		]);
		const result = await run(opts);
		assert.equal(result.errors.length, 0);
		assert.equal(result.completed, 1);
		assert.equal(result.proposals[0].evaluation, 'not_evaluated');
		assert.equal(result.proposals[0].technologies.length, SKILLS_MAP.length);
		assert.ok(
			result.proposals[0].technologies.every(t => t.probability === null),
		);
		const saved = JSON.parse(await readFile(output, 'utf8'));
		assert.equal(saved.schema_version, 2);
		const reviewFile = JSON.parse(await readFile(review, 'utf8'));
		assert.equal(reviewFile.decisions[0].disposition, 'pending');
		assert.deepEqual(reviewFile.decisions[0].accept_technologies, []);
		await assert.rejects(() => run(opts), /Review file already exists/);
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
});

test('resume reuses completed skills and processes newly appended skills', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'skills-resume-'));
	try {
		const input = join(dir, 'catalog.json');
		const output = join(dir, 'proposals.json');
		const skillA = fixture();
		const skillB = fixture('Vue migration', {
			id: 'example/skills/vue-migration',
			description: 'Upgrade Vue applications',
		});
		const opts = parseOptions([
			'--input',
			input,
			'--output',
			output,
			'--no-model',
		]);
		await writeFile(
			input,
			JSON.stringify({generated_at: 'first', skills: [skillA]}),
		);
		const first = await run(opts);
		assert.equal(first.reused, 0);
		await writeFile(
			input,
			JSON.stringify({generated_at: 'second', skills: [skillA, skillB]}),
		);
		const second = await run(opts);
		assert.equal(second.reused, 1);
		assert.equal(second.proposals.length, 2);
		assert.equal(second.proposals[0].skill_id, skillA.id);
		assert.equal(second.proposals[1].skill_id, skillB.id);
		assert.equal((await run({...opts, restart: true})).reused, 0);
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
});

test('partial Kev evaluation retries the skill on resume and removes old errors', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'skills-retry-'));
	try {
		const input = join(dir, 'catalog.json');
		const output = join(dir, 'proposals.json');
		await writeFile(
			input,
			JSON.stringify({generated_at: 'first', skills: [fixture()]}),
		);
		const opts = parseOptions([
			'--input',
			input,
			'--output',
			output,
			'--batch-size',
			'32',
		]);
		const callsA = [];
		const first = await run(opts, fakeResponse(callsA, {failCall: 1}));
		assert.equal(first.reused, 0);
		assert.equal(first.proposals[0].evaluation, 'partial');
		assert.equal(first.errors.length, 1);
		const callsB = [];
		const second = await run(opts, fakeResponse(callsB));
		assert.equal(second.reused, 0);
		assert.equal(second.proposals[0].evaluation, 'evaluated');
		assert.equal(second.errors.length, 0);
		const callsC = [];
		const third = await run(opts, fakeResponse(callsC));
		assert.equal(third.reused, 1);
		assert.equal(callsC.length, 0);
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
});

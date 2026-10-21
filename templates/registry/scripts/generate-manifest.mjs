#!/usr/bin/env node
// Dependency-free manifest generator for the SkillSense registry template.
// Scans skill files, never executes them, and never writes skills-map.json.
import {readFile, readdir, lstat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const check = process.argv.includes('--check');

function scalar(value) {
	const text = value.trim();
	if (text.startsWith('"') && text.endsWith('"')) {
		return JSON.parse(text);
	}

	if (text.startsWith("'") && text.endsWith("'")) {
		return text.slice(1, -1).replaceAll("''", "'");
	}

	return text;
}

function metadata(content, filename) {
	const lines = content.replaceAll('\r\n', '\n').split('\n');
	if (lines[0] !== '---')
		throw new Error(filename + ': missing YAML frontmatter');
	const end = lines.indexOf('---', 1);
	if (end === -1) throw new Error(filename + ': unterminated frontmatter');
	const fields = new Map();
	for (let i = 1; i < end; i++) {
		const line = lines[i];
		const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
		if (!match) continue;
		const key = match[1];
		const value = match[2].trim();
		if (/^[>|][-+]?$/u.test(value)) {
			const block = [];
			while (i + 1 < end && /^\s+/.test(lines[i + 1])) {
				block.push(lines[++i].trim());
			}

			fields.set(
				key,
				value.startsWith('>') ? block.join(' ') : block.join('\n'),
			);
		} else {
			fields.set(key, scalar(value));
		}
	}

	const name = fields.get('name');
	if (typeof name !== 'string' || !name.trim()) {
		throw new Error(filename + ': frontmatter name is required');
	}

	const description = fields.get('description');
	if (description !== undefined && typeof description !== 'string') {
		throw new Error(filename + ': invalid description');
	}

	return {name, description};
}

async function enumerate(relative = 'skills') {
	const folder = path.join(root, relative);
	const files = [];
	const entries = await readdir(folder, {withFileTypes: true});
	// Traverse one subtree at a time to keep ordering and filesystem usage bounded.
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (entry.isSymbolicLink()) continue;
		const child = path.posix.join(relative, entry.name);
		if (entry.isDirectory()) {
			// eslint-disable-next-line no-await-in-loop
			files.push(...(await enumerate(child)));
		} else if (entry.isFile() && entry.name === 'SKILL.md') {
			files.push(child);
		}
	}

	return files;
}

async function main() {
	const settings = JSON.parse(
		await readFile(path.join(root, 'registry.json'), 'utf8'),
	);
	if (
		settings.schemaVersion !== 1 ||
		typeof settings.registryId !== 'string' ||
		!/^[\w.-]+\/[\w.-]+$/.test(settings.registryId)
	) {
		throw new Error(
			'registry.json requires schemaVersion=1 and a valid registryId',
		);
	}

	const records = [];
	const ids = new Set();
	for (const filename of await enumerate()) {
		// eslint-disable-next-line no-await-in-loop
		const info = await lstat(path.join(root, filename));
		if (!info.isFile() || info.isSymbolicLink()) continue;
		const {name, description} = metadata(
			// eslint-disable-next-line no-await-in-loop
			await readFile(path.join(root, filename), 'utf8'),
			filename,
		);
		const folderName = path.posix.dirname(filename).slice('skills/'.length);
		const id = settings.registryId + '/' + folderName;
		if (ids.has(id)) throw new Error('Duplicate skill ID: ' + id);
		ids.add(id);
		const record = {id, name, path: filename};
		if (description) record.description = description;
		records.push(record);
	}

	records.sort((a, b) => a.id.localeCompare(b.id));
	const output =
		JSON.stringify(
			{
				schemaVersion: 1,
				registryId: settings.registryId,
				skills: records,
			},
			null,
			2,
		) + '\n';
	const manifestPath = path.join(root, 'skills-manifest.json');
	if (check) {
		const current = await readFile(manifestPath, 'utf8').catch(() => '');
		if (output !== current)
			throw new Error('skills-manifest.json is out of date; run the generator');
		console.log('Manifest is current (' + records.length + ' skills).');
		return;
	}

	await writeFile(manifestPath, output);
	console.log(
		'Generated skills-manifest.json (' + records.length + ' skills).',
	);
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}

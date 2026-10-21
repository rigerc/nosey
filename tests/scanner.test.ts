import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {test, expect} from 'vite-plus/test';
import {scanProject} from '../src/lib/scanner.js';
import {TextCache} from '../src/lib/text-cache.js';

test('text cache evicts least recently used text within its byte budget', () => {
	const cache = new TextCache(8);
	cache.set('a', 'aa');
	cache.set('b', 'bb');
	expect(cache.get('a')).toBe('aa');
	cache.set('c', 'cc');
	expect(cache.get('b')).toBe(undefined);
	expect(cache.get('a')).toBe('aa');
	expect(cache.get('c')).toBe('cc');
	cache.set('a', 'x');
	cache.set('d', 'y');
	expect(cache.get('c')).toBe('cc');
	cache.set('a', 'this does not fit');
	expect(cache.get('a')).toBe(undefined);
	expect(cache.get('d')).toBe('y');
	const disabled = new TextCache(0);
	disabled.set('empty', '');
	expect(disabled.get('empty')).toBe(undefined);
});

test('scanner evicts cached reads and reports skipped files once', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillsense-cache-'));
	try {
		await fs.writeFile(path.join(root, 'a.txt'), 'aa');
		await fs.writeFile(path.join(root, 'b.txt'), 'bb');
		await fs.writeFile(path.join(root, 'large.txt'), '12345');
		const tree = await scanProject(root, {maxCacheBytes: 4, maxReadBytes: 4});
		expect(await tree.read('a.txt')).toBe('aa');
		expect(await tree.read('b.txt')).toBe('bb');
		await fs.writeFile(path.join(root, 'a.txt'), 'zz');
		expect(await tree.read('a.txt')).toBe('zz');
		expect(await tree.read('large.txt')).toBe(undefined);
		expect(await tree.read('large.txt')).toBe(undefined);
		expect(tree.skippedFiles).toStrictEqual([
			{file: 'large.txt', reason: 'too-large', sizeBytes: 5, limitBytes: 4},
		]);
		expect(await tree.read('../outside.txt')).toBe(undefined);
	} finally {
		await fs.rm(root, {recursive: true, force: true});
	}
});

test('scanner prioritizes root manifests and preserves depth and symlink bounds', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillsense-bounds-'));
	try {
		await fs.mkdir(path.join(root, 'nested'));
		await fs.writeFile(path.join(root, 'aaa.txt'), '');
		await fs.writeFile(path.join(root, 'package.json'), '{}');
		await fs.writeFile(
			path.join(root, 'nested', 'go.mod'),
			'module example.com/app',
		);
		await fs.symlink(path.join(root, 'nested'), path.join(root, 'link'));
		const limited = await scanProject(root, {maxFiles: 1});
		expect(limited.files).toStrictEqual(['package.json']);
		expect(limited.truncated).toBe(true);
		const shallow = await scanProject(root, {depth: 0});
		expect(shallow.files).toStrictEqual(['package.json', 'aaa.txt']);
		expect(shallow.truncated).toBe(true);
		const complete = await scanProject(root);
		expect(complete.truncated).toBe(false);
		expect(complete.files).toStrictEqual([
			'package.json',
			'aaa.txt',
			'nested/go.mod',
		]);
		expect(complete.directories.includes('link')).toBe(false);
	} finally {
		await fs.rm(root, {recursive: true, force: true});
	}
});

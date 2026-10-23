import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {deflateRawSync} from 'node:zlib';
import {mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {
  buildManifest,
  collect,
  crc32,
  downloadAll,
  extractZip,
  readManifest,
  readZip,
  safeEntryPath,
  saveManifest,
} from './opencodeskills.mjs';

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? '', 'utf8');
    const method = entry.method ?? METHOD_DEFLATE;
    const mode = entry.mode ?? 0o100644;
    const stored = method === METHOD_DEFLATE ? deflateRawSync(data) : data;
    const checksum = entry.crc ?? crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((mode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + stored.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, ...centrals, eocd]);
}

const archive = (root = 'alpha') =>
  makeZip([
    {name: `${root}/`, data: '', method: METHOD_STORED, mode: 0o040755},
    {name: `${root}/SKILL.md`, data: '# Alpha\n'},
    {name: `${root}/references/notes.md`, data: 'notes\n'},
  ]);

async function withTempDir(worker) {
  const dir = await mkdtemp(join(tmpdir(), 'opencodeskills-'));

  try {
    return await worker(dir);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}

void test('readZip reads stored and deflated entries from the central directory', () => {
  const buffer = makeZip([
    {name: 'stored.txt', data: 'plain', method: METHOD_STORED},
    {name: 'deflated.txt', data: 'compressed '.repeat(20)},
  ]);

  const entries = readZip(buffer);

  assert.deepEqual(
    entries.map((entry) => [entry.name, entry.method]),
    [
      ['stored.txt', METHOD_STORED],
      ['deflated.txt', METHOD_DEFLATE],
    ],
  );
  assert.equal(entries[1].uncompressedSize, 'compressed '.repeat(20).length);
});

void test('readZip rejects buffers that are not zip archives', () => {
  assert.throws(() => readZip(Buffer.from('not a zip file')), /end of central directory/);
});

void test('safeEntryPath rejects absolute and traversal paths', () => {
  assert.equal(safeEntryPath('alpha/SKILL.md'), 'alpha/SKILL.md');
  assert.equal(safeEntryPath('./alpha//SKILL.md'), 'alpha/SKILL.md');
  assert.equal(safeEntryPath('alpha\\SKILL.md'), 'alpha/SKILL.md');
  assert.equal(safeEntryPath('../escape.txt'), null);
  assert.equal(safeEntryPath('alpha/../../escape.txt'), null);
  assert.equal(safeEntryPath('/etc/passwd'), null);
  assert.equal(safeEntryPath('C:/windows/system32'), null);
  assert.equal(safeEntryPath(''), null);
});

void test('extractZip strips a single shared root directory', async () => {
  await withTempDir(async (dir) => {
    const target = join(dir, 'alpha');
    const result = await extractZip(archive(), target);

    assert.deepEqual(result.files, ['SKILL.md', 'references/notes.md']);
    assert.equal(result.root, 'alpha');
    assert.equal(await readFile(join(target, 'SKILL.md'), 'utf8'), '# Alpha\n');
    assert.equal(result.bytes, Buffer.byteLength('# Alpha\n') + Buffer.byteLength('notes\n'));
  });
});

void test('extractZip keeps the archive layout with stripRoot disabled', async () => {
  await withTempDir(async (dir) => {
    const target = join(dir, 'alpha');
    const result = await extractZip(archive(), target, {stripRoot: false});

    assert.equal(result.root, null);
    assert.deepEqual(result.files, ['alpha/SKILL.md', 'alpha/references/notes.md']);
    assert.equal(await readFile(join(target, 'alpha/SKILL.md'), 'utf8'), '# Alpha\n');
  });
});

void test('extractZip refuses a traversal entry and writes nothing', async () => {
  await withTempDir(async (dir) => {
    const target = join(dir, 'alpha');
    const buffer = makeZip([{name: '../escape/SKILL.md', data: 'nope'}]);

    await assert.rejects(extractZip(buffer, target), /unsafe archive path/);
    await assert.rejects(stat(target), /ENOENT/);
  });
});

void test('extractZip refuses entries whose CRC does not match', async () => {
  await withTempDir(async (dir) => {
    const buffer = makeZip([{name: 'alpha/SKILL.md', data: '# Alpha\n', crc: 1}]);
    await assert.rejects(extractZip(buffer, join(dir, 'alpha')), /CRC check/);
  });
});

void test('extractZip skips symlink entries instead of writing them', async () => {
  await withTempDir(async (dir) => {
    const buffer = makeZip([
      {name: 'alpha/SKILL.md', data: '# Alpha\n'},
      {name: 'alpha/link', data: '/etc/passwd', mode: 0o120777},
    ]);

    const result = await extractZip(buffer, join(dir, 'alpha'));

    assert.deepEqual(result.files, ['SKILL.md']);
    assert.deepEqual(result.skipped, ['alpha/link']);
  });
});

void test('downloadAll unpacks skills, records a manifest, and reuses existing trees', async () => {
  const zips = new Map([
    ['/downloads/ai-ml/alpha.zip', archive('alpha')],
    ['/downloads/testing/beta.zip', archive('beta')],
  ]);

  const server = http.createServer((request, response) => {
    const zip = zips.get(request.url);

    if (zip) {
      response.writeHead(200, {'content-type': 'application/zip'});
      response.end(zip);

      return;
    }

    response.writeHead(404).end();
  });

  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    await withTempDir(async (dir) => {
      const target = join(dir, 'skills');
      const manifestPath = join(target, 'manifest.json');

      const records = [
        {
          number: 1,
          title: 'Alpha',
          slug: 'alpha',
          category: 'AI & ML',
          category_slug: 'ai-ml',
          url: `${base}/skills/ai-ml/alpha/`,
          download_url: `${base}/downloads/ai-ml/alpha.zip`,
        },
        {
          number: 2,
          title: 'Beta',
          slug: 'beta',
          category: 'Testing',
          category_slug: 'testing',
          url: `${base}/skills/testing/beta/`,
          download_url: `${base}/downloads/testing/beta.zip`,
        },
      ];

      const first = await downloadAll(records, {dir: target, concurrency: 2, keepZips: true});

      const manifest = buildManifest({
        base,
        catalog: {total: records.length, advertised: records.length},
        skills: first,
        generatedAt: '2026-01-01T00:00:00.000Z',
      });

      await saveManifest(manifest, manifestPath);

      assert.deepEqual(
        first.map((skill) => skill.status),
        ['downloaded', 'downloaded'],
      );
      assert.equal(await readFile(join(target, 'ai-ml', 'alpha', 'SKILL.md'), 'utf8'), '# Alpha\n');
      assert.equal(
        await readFile(join(target, 'testing', 'beta', 'references', 'notes.md'), 'utf8'),
        'notes\n',
      );
      assert.match(first[0].archive.sha256, /^[0-9a-f]{64}$/);

      const saved = JSON.parse(await readFile(manifestPath, 'utf8'));
      assert.equal(saved.schema_version, 1);
      assert.equal(saved.catalog.complete, true);
      assert.deepEqual(saved.summary, {downloaded: 2, cached: 0, failed: 0, files: 4, bytes: 28});
      assert.deepEqual(saved.skills[0].files, ['SKILL.md', 'references/notes.md']);
      assert.equal(saved.skills[0].extract_dir, 'ai-ml/alpha');
      assert.equal(
        await readFile(join(target, 'zips', 'ai-ml', 'alpha.zip')).then(
          (buffer) => buffer.length > 0,
        ),
        true,
      );

      const previous = await readManifest(manifestPath);
      const second = await downloadAll(records, {dir: target, concurrency: 2, previous});

      assert.deepEqual(
        second.map((skill) => skill.status),
        ['cached', 'cached'],
      );
      assert.deepEqual(second[0].files, ['SKILL.md', 'references/notes.md']);
      assert.equal(second[0].archive.sha256, first[0].archive.sha256);

      const forced = await downloadAll(records, {
        dir: target,
        concurrency: 2,
        force: true,
        limit: 1,
      });

      assert.deepEqual(
        forced.map((skill) => skill.status),
        ['downloaded'],
      );
    });
  } finally {
    await new Promise((done) => server.close(done));
  }
});

void test('downloadAll records failures without aborting the run', async () => {
  const server = http.createServer((request, response) => response.writeHead(404).end());
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const {port} = server.address();

  try {
    await withTempDir(async (dir) => {
      const record = {
        number: 1,
        title: 'Missing',
        slug: 'missing',
        category: 'Testing',
        category_slug: 'testing',
        url: `http://127.0.0.1:${port}/skills/testing/missing/`,
        download_url: `http://127.0.0.1:${port}/downloads/testing/missing.zip`,
      };

      const [skill] = await downloadAll([record], {dir: join(dir, 'skills'), concurrency: 1});

      assert.equal(skill.status, 'failed');
      assert.match(skill.error, /HTTP 404/);

      const manifest = buildManifest({skills: [skill], catalog: {total: 1, advertised: 2}});
      assert.deepEqual(manifest.summary, {downloaded: 0, cached: 0, failed: 1, files: 0, bytes: 0});
      assert.equal(manifest.catalog.complete, false);
    });
  } finally {
    await new Promise((done) => server.close(done));
  }
});

void test('collect and download work against a catalog feed', async () => {
  const server = http.createServer((request, response) => {
    if (request.url === '/llms.txt') {
      response.end('Complete machine-readable catalog of 2 free instruction sets.\n');

      return;
    }

    if (request.url === '/llms-full.txt') {
      const origin = `http://127.0.0.1:${server.address().port}`;
      response.end(
        [
          'Complete machine-readable catalog of 2 free instruction sets.',
          '',
          '### No. 1 — Alpha',
          '',
          '- Category: AI & ML',
          `- URL: ${origin}/skills/ai-ml/alpha/`,
          `- Download: ${origin}/downloads/ai-ml/alpha.zip`,
          '- Tagline: First skill',
          '',
          '### No. 2 — Beta',
          '',
          '- Category: Testing',
          `- URL: ${origin}/skills/testing/beta/`,
          `- Download: ${origin}/downloads/testing/beta.zip`,
          '',
        ].join('\n'),
      );

      return;
    }

    if (request.url === '/downloads/ai-ml/alpha.zip') {
      response.end(archive('alpha'));

      return;
    }

    if (request.url === '/downloads/testing/beta.zip') {
      response.end(archive('beta'));

      return;
    }

    response.writeHead(404).end();
  });

  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    await withTempDir(async (dir) => {
      const {records, expected} = await collect({base, delay: 0});

      assert.equal(expected, 2);
      assert.deepEqual(
        records.map((record) => record.slug),
        ['alpha', 'beta'],
      );

      const skills = await downloadAll(records, {
        dir: join(dir, 'skills'),
        concurrency: 2,
        limit: 1,
      });

      const manifest = buildManifest({
        base,
        catalog: {total: records.length, advertised: expected},
        skills,
      });

      assert.equal(manifest.summary.downloaded, 1);
      assert.deepEqual(
        skills.map((skill) => skill.slug),
        ['alpha'],
      );
      assert.equal(manifest.skills[0].title, 'Alpha');
      assert.equal(manifest.skills[0].download_url, `${base}/downloads/ai-ml/alpha.zip`);
    });
  } finally {
    await new Promise((done) => server.close(done));
  }
});

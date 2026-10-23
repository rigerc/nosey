import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {test, expect} from 'vite-plus/test';
import {downloadTemplate, extractTemplate, templateLimits} from '../src/lib/registry/template.js';
import {runRegistryInit, scaffoldRegistry} from '../src/lib/registry/init.js';
import {
  fixtureTransport,
  templateDirectory,
  templateCommit,
  tarEntry,
} from './helpers/registry-template.js';

async function temporary(run: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-download-'));

  try {
    await run(root);
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
}

test('local download pins the default branch once and needs neither Git nor gh', async () => {
  await temporary(async (root) => {
    const requests: string[] = [];
    const transport = await fixtureTransport();
    const directory = path.join(root, 'registry');

    const result = await runRegistryInit(
      {directory, registryId: 'acme/skills', yes: true, git: false},
      {
        run: async () => {
          throw new Error('No subprocess tools available');
        },
        transport: async (url, signal) => {
          requests.push(url);

          return transport(url, signal);
        },
      },
    );

    expect(result.templateCommit).toBe(templateCommit);
    expect(result.configured).toBe(true);
    await expect(fs.stat(path.join(directory, 'nosey-contract.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(requests).toEqual([
      'https://api.github.com/repos/rigerc/nosey-registry-template',
      'https://api.github.com/repos/rigerc/nosey-registry-template/commits/trunk',
      'https://codeload.github.com/rigerc/nosey-registry-template/tar.gz/' + templateCommit,
    ]);
    expect(
      (await fs.stat(path.join(directory, '.github/workflows/update-manifest.yml'))).isFile(),
    ).toBe(true);
    await expect(fs.stat(path.join(directory, '.git'))).rejects.toMatchObject({code: 'ENOENT'});
    await expect(fs.stat(path.join(directory, 'template'))).rejects.toMatchObject({code: 'ENOENT'});
  });
});

test('local initialization needs no schemas, template scripts, or contract metadata', async () => {
  await temporary(async (root) => {
    const template = path.join(root, 'template');
    await fs.cp(templateDirectory, template, {recursive: true});

    for (const name of ['schemas', 'scripts', 'docs'])
      await fs.rm(path.join(template, name), {recursive: true, force: true});

    for (const name of ['skills-manifest.json', 'skills-map.json']) {
      const filename = path.join(template, name);
      const document = JSON.parse(await fs.readFile(filename, 'utf8'));
      delete document.$schema;
      await fs.writeFile(filename, JSON.stringify(document));
    }

    // Leftovers from an older template are ordinary ignored data, not a compatibility gate.
    await fs.writeFile(path.join(template, 'nosey-contract.json'), 'obsolete metadata');
    const directory = path.join(root, 'registry');

    const result = await runRegistryInit(
      {directory, registryId: 'acme/minimal', git: false, yes: true},
      {
        transport: await fixtureTransport(template),
      },
    );

    expect(result.configured).toBe(true);

    for (const name of ['skills-manifest.json', 'skills-map.json']) {
      const document = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
      expect(document.registryId).toBe('acme/minimal');
      expect(Object.hasOwn(document, '$schema')).toBe(false);
    }

    await expect(fs.stat(path.join(directory, 'schemas'))).rejects.toMatchObject({code: 'ENOENT'});
    expect(await fs.readFile(path.join(directory, 'README.md'), 'utf8')).toContain(
      'Registry: acme/minimal',
    );
  });
});

for (const name of ['registry.json', 'skills-manifest.json', 'skills-map.json']) {
  test(`unsupported ${name} schemaVersion fails before configuration and cleans up`, async () => {
    await temporary(async (root) => {
      const template = path.join(root, 'template');
      await fs.cp(templateDirectory, template, {recursive: true});
      const filename = path.join(template, name);
      const document = JSON.parse(await fs.readFile(filename, 'utf8'));
      await fs.writeFile(filename, JSON.stringify({...document, schemaVersion: 999}));
      const directory = path.join(root, 'registry');
      await expect(scaffoldRegistry(directory, 'acme/invalid', template)).rejects.toThrow(
        /Unsupported.*schemaVersion/,
      );
      await expect(fs.stat(directory)).rejects.toMatchObject({code: 'ENOENT'});
      expect(
        JSON.parse(await fs.readFile(path.join(template, 'registry.json'), 'utf8')).registryId,
      ).toBe('example/agent-skills');
    });
  });
}

for (const [name, type] of [
  ['template/../escape', '0'],
  ['/absolute/file', '0'],
  ['template/a\\b', '0'],
  ['template/.git/config', '0'],
  ['template/C:/file', '0'],
  ['template/link', '2'],
  ['template/hardlink', '1'],
  ['template/device', '3'],
  ['template/fifo', '6'],
  ['template/pax', 'x'],
  ['other-root/file', '0'],
]) {
  test(`rejects unsafe archive entry ${name} (${type})`, async () => {
    await temporary(async (root) => {
      const bytes = gzipSync(
        Buffer.concat([
          tarEntry('template/good'),
          tarEntry(name!, Buffer.alloc(0), type),
          Buffer.alloc(1024),
        ]),
      );

      await expect(extractTemplate(bytes, root)).rejects.toThrow(/Unsafe|unsupported|enclosing/);
      await expect(fs.stat(path.join(path.dirname(root), 'escape'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });
  });
}

test('rejects duplicate paths, damaged headers, truncation, and decompression bombs', async () => {
  await temporary(async (root) => {
    const good = tarEntry('template/one');
    const damaged = Buffer.from(good);
    damaged[10] = 1;

    for (const bytes of [
      Buffer.concat([good, good, Buffer.alloc(1024)]),
      damaged,
      good,
      Buffer.alloc(templateLimits.extracted + 1),
    ]) {
      await expect(extractTemplate(gzipSync(bytes), root)).rejects.toThrow();
    }
  });
});

test('global GitHub PAX comments and hidden files extract without inherited metadata', async () => {
  await temporary(async (root) => {
    const pax = Buffer.from('52 comment=' + 'b'.repeat(40) + '\n');

    const bytes = gzipSync(
      Buffer.concat([
        tarEntry('pax_global_header', pax, 'g'),
        tarEntry('template/.hidden', Buffer.from('kept')),
        Buffer.alloc(1024),
      ]),
    );

    await extractTemplate(bytes, root);
    expect(await fs.readFile(path.join(root, '.hidden'), 'utf8')).toBe('kept');
  });
});

test('aborted extraction and excessive file counts stop before completion', async () => {
  await temporary(async (root) => {
    const bytes = gzipSync(Buffer.concat([tarEntry('template/one'), Buffer.alloc(1024)]));
    await expect(extractTemplate(bytes, root, AbortSignal.abort())).rejects.toThrow();

    const entries = Array.from({length: templateLimits.entries + 1}, (_, index) =>
      tarEntry('template/file-' + index),
    );

    // An already expired signal also ensures this cannot leave a long-running extraction.
    await expect(
      extractTemplate(gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)])), root),
    ).rejects.toThrow(/entry limit/);
  });
});

for (const status of [403, 429, 500]) {
  test(`HTTP ${status} cleans the reserved local destination`, async () => {
    await temporary(async (root) => {
      const directory = path.join(root, 'registry');
      await expect(
        scaffoldRegistry(
          directory,
          'acme/skills',
          undefined,
          async () => new Response('', {status}),
        ),
      ).rejects.toThrow('HTTP ' + status);
      await expect(fs.stat(directory)).rejects.toMatchObject({code: 'ENOENT'});
    });
  });
}

test('network failure, oversized responses and request deadline are bounded', async () => {
  await temporary(async (root) => {
    await expect(
      downloadTemplate(root, async (_url, signal) => {
        expect(signal.aborted).toBe(false);
        expect(signal).toBeInstanceOf(AbortSignal);
        throw new Error('network unavailable');
      }),
    ).rejects.toThrow(/network unavailable/);
    await expect(
      downloadTemplate(
        root,
        async () =>
          new Response('', {
            headers: {'content-length': String(templateLimits.download + 1)},
          }),
      ),
    ).rejects.toThrow(/size limit/);

    await expect(
      downloadTemplate(
        root,
        async (_url, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), {once: true});
          }),
        AbortSignal.timeout(10),
      ),
    ).rejects.toThrow(/timeout|timed out/i);

    let cancelled = false;
    await expect(
      downloadTemplate(
        root,
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(1024 * 1024 + 1));
              },
              cancel() {
                cancelled = true;
              },
            }),
          ),
      ),
    ).rejects.toThrow(/size limit/);
    expect(cancelled).toBe(true);
  });
});

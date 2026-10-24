import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {afterEach, expect, test} from 'vite-plus/test';
import {
  downloadTemplateWithRevision,
  type TemplateTransport,
} from '../src/lib/registry/template.js';
import {trustedTemplateRevision} from '../src/lib/registry/template-source.js';

const tempDirs: string[] = [];

afterEach(async () =>
  Promise.all(tempDirs.splice(0).map((directory) => rm(directory, {recursive: true, force: true}))),
);

function tarEntry(name: string, data: string, executable = false, directory = false): Buffer {
  const header = Buffer.alloc(512);
  header.write(name);
  header.write((executable ? 0o755 : 0o644).toString(8).padStart(7, '0') + '\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  const body = directory ? Buffer.alloc(0) : Buffer.from(data);
  header.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
  header.write('00000000000\0', 136);
  header.fill(32, 148, 156);
  header[156] = directory ? 53 : 48;
  header.write('ustar\0', 257);
  header.write('00', 263);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);

  return Buffer.concat([header, body, Buffer.alloc((512 - (body.length % 512)) % 512)]);
}

function archive(entries: Buffer[]): Buffer {
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));
}

const validEntries = [
  tarEntry('top/', '', false, true),
  tarEntry('top/a.txt', 'hello\n'),
  tarEntry('top/sub/', '', false, true),
  tarEntry('top/sub/run', '#!/bin/sh\n', true),
];

async function invoke(bytes: Buffer, tree = '184ab7487176b821b7ae23dc732c70cc6223e2fe') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nosey-template-test-'));
  tempDirs.push(directory);
  const requests: string[] = [];

  const transport: TemplateTransport = async (url) => {
    requests.push(url);

    return new Response(bytes);
  };

  const revision = {...trustedTemplateRevision, commit: 'a'.repeat(40), tree};
  const result = await downloadTemplateWithRevision(directory, revision, transport);

  return {directory, requests, result};
}

test('downloads only the explicit commit and verifies content independent of archive entry order', async () => {
  const {directory, requests, result} = await invoke(archive([...validEntries].reverse()));
  expect(result).toBe('a'.repeat(40));
  expect(requests).toEqual([
    'https://codeload.github.com/rigerc/nosey-registry-template/tar.gz/' + 'a'.repeat(40),
  ]);
  expect(await readFile(path.join(directory, 'a.txt'), 'utf8')).toBe('hello\n');
  expect(await readFile(path.join(directory, 'sub/run'), 'utf8')).toBe('#!/bin/sh\n');
});

test('rejects changed bytes and executable modes even when the archive request is pinned', async () => {
  await expect(
    invoke(archive([tarEntry('top/a.txt', 'changed\n'), ...validEntries.slice(2)])),
  ).rejects.toThrow(/does not match approved/);
  await expect(
    invoke(
      archive([
        validEntries[0]!,
        validEntries[1]!,
        validEntries[2]!,
        tarEntry('top/sub/run', '#!/bin/sh\n'),
      ]),
    ),
  ).rejects.toThrow(/does not match approved/);
});

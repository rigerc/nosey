import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {
  templateArchiveUrl,
  validateTrustedTemplateRevision,
  type TrustedTemplateRevision,
} from './template-provenance.js';
import {trustedTemplateRevision} from './template-source.js';
import {computeTemplateContentTree} from './template-content-tree.js';

export const templateRepository = 'rigerc/nosey-registry-template';

export const templateLimits = {
  download: 8 * 1024 * 1024,
  extracted: 64 * 1024 * 1024,
  entries: 10_000,
  timeout: 30_000,
};

export type TemplateTransport = (url: string, signal: AbortSignal) => Promise<Response>;

const request: TemplateTransport = (url, signal) =>
  fetch(url, {
    signal,
    headers: {'User-Agent': 'nosey', Accept: 'application/vnd.github+json'},
  });

async function boundedResponse(
  url: string,
  signal: AbortSignal,
  limit: number,
  transport: TemplateTransport,
): Promise<Buffer> {
  const response = await transport(url, signal);

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Template request failed: HTTP ${response.status}${response.status === 403 || response.status === 429 ? ' (GitHub rate limit or access denied)' : ''}`,
    );
  }

  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('Template download exceeds size limit');
  }

  const reader = response.body?.getReader();

  if (!reader) throw new Error('Empty template response');
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      signal.throwIfAborted();
      // eslint-disable-next-line no-await-in-loop
      const chunk = await reader.read();

      if (chunk.done) break;
      size += chunk.value.length;

      if (size > limit) throw new Error('Template download exceeds size limit');
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}

function octal(bytes: Buffer): number {
  const value = bytes.toString('ascii').replace(/\0.*$/, '').trim();

  if (!/^[0-7]+$/.test(value)) throw new Error('Invalid template archive numeric field');
  const number = Number.parseInt(value, 8);

  if (!Number.isSafeInteger(number)) throw new Error('Invalid template archive size');

  return number;
}

function archivePath(name: string): string[] {
  const parts = name.replace(/\/$/, '').split('/');

  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        part.toLowerCase() === '.git' ||
        part.includes(':') ||
        part.endsWith('.') ||
        part.endsWith(' ') ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    ) ||
    name.includes('\\') ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\u007f]/u.test(name)
  )
    throw new Error('Unsafe template archive path: ' + JSON.stringify(name));

  return parts;
}

/** Deliberately small tar subset: no links, devices, sparse files or path overrides. */
export async function extractTemplate(
  archive: Buffer,
  directory: string,
  signal = AbortSignal.timeout(templateLimits.timeout),
  expectedCommit?: string,
): Promise<void> {
  let bytes: Buffer;

  try {
    bytes = gunzipSync(archive, {maxOutputLength: templateLimits.extracted});
  } catch (cause) {
    throw new Error('Invalid template gzip archive or extracted size limit exceeded', {cause});
  }

  let offset = 0;
  let entries = 0;
  let root: string | undefined;
  const seen = new Set<string>();

  while (offset + 512 <= bytes.length) {
    signal.throwIfAborted();
    const header = bytes.subarray(offset, offset + 512);

    if (header.every((value) => value === 0)) {
      if (
        !root ||
        entries === 0 ||
        bytes.length < offset + 1024 ||
        !bytes.subarray(offset).every((value) => value === 0)
      )
        throw new Error('Invalid template archive terminator');

      return;
    }

    if (++entries > templateLimits.entries)
      throw new Error('Template archive entry limit exceeded');
    const checksum = octal(header.subarray(148, 156));
    let calculated = 0;

    for (const [index, value] of header.entries())
      calculated += index >= 148 && index < 156 ? 32 : value;

    if (checksum !== calculated) throw new Error('Invalid template archive checksum');
    const size = octal(header.subarray(124, 136));
    const mode = octal(header.subarray(100, 108));
    const end = offset + 512 + size;

    if (end > bytes.length) throw new Error('Truncated template archive');
    const data = bytes.subarray(offset + 512, end);
    offset += 512 + Math.ceil(size / 512) * 512;
    const type = header[156];

    // GitHub emits a global PAX comment containing the source commit. It does not
    // affect file paths or sizes. Reject all other extended-header semantics.
    if (type === 103) {
      const match = /^(\d+) comment=([a-f\d]{40})\n$/.exec(data.toString('utf8'));

      if (!match || Number(match[1]) !== data.length)
        throw new Error('Unsupported template archive extended header');

      if (expectedCommit && match[2] !== expectedCommit)
        throw new Error('Template archive source commit does not match the approved revision');
      continue;
    }

    if (type !== 0 && type !== 48 && type !== 53)
      throw new Error('Unsafe or unsupported template archive entry type');
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const parts = archivePath(prefix ? prefix + '/' + name : name);
    root ??= parts[0];

    if (parts[0] !== root) throw new Error('Template archive must have one enclosing directory');

    if (parts.length === 1) {
      if (type !== 53 || size !== 0) throw new Error('Invalid template archive root');
      continue;
    }

    const relative = parts.slice(1).join('/');

    if (seen.has(relative)) throw new Error('Duplicate template archive entry: ' + relative);
    seen.add(relative);
    const filename = path.join(directory, ...parts.slice(1));

    if (type === 53) {
      if (size !== 0) throw new Error('Invalid template archive directory size');
      // eslint-disable-next-line no-await-in-loop
      await fs.mkdir(filename, {recursive: true});
    } else {
      // eslint-disable-next-line no-await-in-loop
      await fs.mkdir(path.dirname(filename), {recursive: true});
      // eslint-disable-next-line no-await-in-loop
      await fs.writeFile(filename, data, {flag: 'wx', mode: mode & 0o111 ? 0o755 : 0o644});
    }
  }

  throw new Error('Truncated template archive');
}

/** Anonymous HTTP only: neither Git nor gh is needed for a local --no-git init. */
export async function downloadTemplate(
  destination: string,
  transport: TemplateTransport = request,
  signal = AbortSignal.timeout(templateLimits.timeout),
): Promise<string> {
  return downloadTemplateWithRevision(destination, trustedTemplateRevision, transport, signal);
}

/** Internal explicit revision seam for archive tests; production callers use downloadTemplate. */
export async function downloadTemplateWithRevision(
  destination: string,
  revision: TrustedTemplateRevision,
  transport: TemplateTransport = request,
  signal = AbortSignal.timeout(templateLimits.timeout),
): Promise<string> {
  const trusted = validateTrustedTemplateRevision(revision);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-template-'));

  try {
    const archive = await boundedResponse(
      templateArchiveUrl(trusted),
      signal,
      templateLimits.download,
      transport,
    );

    await extractTemplate(archive, temporary, signal, trusted.commit);
    const actualTree = await computeTemplateContentTree(temporary);

    if (actualTree !== trusted.tree)
      throw new Error(
        `Template content tree ${actualTree} does not match approved ${trusted.tree}`,
      );

    for (const name of await fs.readdir(temporary)) {
      signal.throwIfAborted();
      // eslint-disable-next-line no-await-in-loop
      await fs.cp(path.join(temporary, name), path.join(destination, name), {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    }

    return trusted.commit;
  } catch (cause) {
    throw new Error(
      'Unable to download registry template: ' +
        (cause instanceof Error ? cause.message : String(cause)),
      {cause},
    );
  } finally {
    await fs.rm(temporary, {recursive: true, force: true});
  }
}

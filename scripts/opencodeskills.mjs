#!/usr/bin/env node
/**
 * Export the OpenCode Skills catalog to JSON and CSV, and optionally download
 * and unpack every skill zip into a directory with a manifest.
 * Node.js >= 20. No npm dependencies.
 *
 * Examples:
 *   node scripts/opencodeskills.mjs
 *   node scripts/opencodeskills.mjs --list
 *   node scripts/opencodeskills.mjs --json skills.json --csv skills.csv
 *   node scripts/opencodeskills.mjs --allow-partial
 *   node scripts/opencodeskills.mjs --download out/opencode-skills
 *   node scripts/opencodeskills.mjs --download out/opencode-skills --force --keep-zips
 *
 * Data sources (in order):
 *   /llms-full.txt    Detailed, machine-readable catalog
 *   /llms.txt         Advertised count and categories
 *   /skills/          HTML fallback
 *   /skills/{cat}/    Category HTML fallback
 *   /sitemap-index.xml  Final URL-discovery fallback
 *
 * Note: Static pages can be cached inconsistently. The script compares counts
 * and will not silently claim success when fewer skills than expected are found.
 *
 * Zip handling is dependency-free: the central directory is parsed directly and
 * deflate entries are inflated with node:zlib. Archive paths are validated
 * (no absolute paths, no "..") and CRCs are verified before anything is written.
 */

import {createHash} from 'node:crypto';
import {mkdir, readdir, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inflateRawSync} from 'node:zlib';

const DEFAULT_BASE = 'https://opencodeskills.dev';

const CATEGORY_NAMES = {
  'ai-ml': 'AI & ML',
  architecture: 'Architecture',
  cloud: 'Cloud',
  'code-quality': 'Code Quality',
  data: 'Data',
  databases: 'Databases',
  design: 'Design',
  devops: 'DevOps',
  documentation: 'Documentation',
  framework: 'Frameworks',
  integration: 'Integrations',
  mobile: 'Mobile',
  performance: 'Performance',
  recommended: 'Recommended',
  security: 'Security',
  testing: 'Testing',
  workflow: 'Workflow',
  writing: 'Writing',
};

const HEADLINE = /^### No\.\s*(\d+)\s*[—–-]\s*(.+?)\s*$/gm;

const COLUMNS = [
  'number',
  'title',
  'slug',
  'category',
  'category_slug',
  'url',
  'download_url',
  'version',
  'license',
  'tagline',
  'description',
  'triggers',
  'package_contents',
  'source',
];

const MANIFEST_SCHEMA_VERSION = 1;
const MANIFEST_FILENAME = 'manifest.json';
const ZIP_DIRNAME = 'zips';
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const USER_AGENT = 'OpenCodeSkillsCatalogExporter/1.0 (public catalog; low volume)';
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_CONCURRENCY = 16;

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const ZIP64_EXTRA_ID = 0x0001;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const DIRECTORY_MODE = 0x4000;
const SYMLINK_MODE = 0xa000;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index++) {
    let value = index;

    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
})();

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function absoluteUrl(path, base = DEFAULT_BASE) {
  try {
    return new URL(path, base + '/').toString();
  } catch {
    return new URL(path, base).toString();
  }
}

function messageOf(error) {
  if (error instanceof Error) return error.message;

  return String(error);
}

function isRecord(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isFatalHttpError(message) {
  const match = message.match(/^HTTP (\d{3}):/);

  return Boolean(match) && !RETRY_STATUSES.has(Number(match[1]));
}

async function fetchWithRetry(url, {attempts = 4, accept, timeoutMs = 30_000} = {}) {
  let error;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': USER_AGENT,
          accept: accept ?? 'text/plain,text/html,application/xml;q=0.9,*/*;q=0.5',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) return response;

      if (!RETRY_STATUSES.has(response.status) || attempt === attempts - 1) {
        throw new Error(`HTTP ${response.status}: ${url}`);
      }

      const after = Number(response.headers.get('retry-after'));
      await sleep(
        Number.isFinite(after) && after > 0 ? Math.min(after * 1_000, 10_000) : 600 * 2 ** attempt,
      );
    } catch (caught) {
      error = caught;

      if (isFatalHttpError(messageOf(caught)) || attempt === attempts - 1) break;

      await sleep(600 * 2 ** attempt);
    }
  }

  throw error;
}

export async function fetchText(path, {base = DEFAULT_BASE, attempts = 4} = {}) {
  const response = await fetchWithRetry(absoluteUrl(path, base), {attempts});

  return await response.text();
}

export async function fetchBytes(
  path,
  {base = DEFAULT_BASE, attempts = 4, timeoutMs = 60_000} = {},
) {
  const response = await fetchWithRetry(absoluteUrl(path, base), {
    attempts,
    accept: 'application/zip,application/octet-stream;q=0.9,*/*;q=0.5',
    timeoutMs,
  });

  return Buffer.from(await response.arrayBuffer());
}

function findCount(text) {
  for (const pattern of [
    /complete machine-readable catalog of\s+(\d+)\s+free/i,
    /\b(\d+)\s+free,\s+downloadable\s+instruction\s+sets\b/i,
    /\b(\d+)\s+skills\s+(?:in|across)\s+\d+\s+categories\b/i,
    /\b(\d+)\s+ready-to-install\s+instruction\s+sets\b/i,
  ]) {
    const match = text.slice(0, 5000).match(pattern);

    if (match) return Number(match[1]);
  }

  return null;
}

function skillIdentity(rawUrl, base = DEFAULT_BASE) {
  let url;

  try {
    url = new URL(rawUrl, base + '/');
  } catch {
    return null;
  }

  if (url.origin !== new URL(base).origin) return null;
  const match = url.pathname.match(/^\/skills\/([^/]+)\/([^/]+)\/?$/);

  if (!match) return null;

  return {cat: match[1], slug: match[2]};
}

function recordFor(cat, slug, base, categories = CATEGORY_NAMES) {
  return {
    number: null,
    title: slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' '),
    slug,
    category: categories[cat] || CATEGORY_NAMES[cat] || cat,
    category_slug: cat,
    url: absoluteUrl(`/skills/${cat}/${slug}/`, base),
    download_url: absoluteUrl(`/downloads/${cat}/${slug}.zip`, base),
    version: '',
    license: '',
    tagline: '',
    description: '',
    triggers: [],
    package_contents: '',
    source: 'url-discovery',
  };
}

export function parseSummary(text, base = DEFAULT_BASE) {
  const categories = {...CATEGORY_NAMES};
  const links = /(?:^|\n)\s*-\s*\[([^\]]+)\]\((https?:\/\/[^)]+\/skills\/[^/]+\/)\)/g;

  for (const match of text.matchAll(links)) {
    const parsed = skillIdentity(`${match[2]}placeholder/`, base);

    if (parsed) categories[parsed.cat] = match[1].trim();
  }

  return {count: findCount(text), categories};
}

export function parseFullCatalog(text, {base = DEFAULT_BASE, categories = CATEGORY_NAMES} = {}) {
  const headings = [...text.matchAll(HEADLINE)];
  const records = [];

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const block = text.slice(h.index + h[0].length, headings[i + 1]?.index ?? text.length);
    const fields = {};

    for (const line of block.trimStart().split(/\r?\n/)) {
      const match = line.match(
        /^- (Category|URL|Download|Version|License|Tagline|Description|Triggers|Package contents):\s*(.*)$/,
      );

      if (!match) break; // Only read contiguous metadata, not skill content.
      fields[match[1]] = match[2].trim();
    }

    const id = skillIdentity(fields.URL || '', base);

    if (!id) continue;
    const r = recordFor(id.cat, id.slug, base, categories);
    records.push({
      ...r,
      number: Number(h[1]),
      title: h[2].trim(),
      category: fields.Category || r.category,
      url: absoluteUrl(`/skills/${id.cat}/${id.slug}/`, base),
      download_url: fields.Download || r.download_url,
      version: fields.Version || '',
      license: fields.License || '',
      tagline: fields.Tagline || '',
      description: fields.Description || '',
      triggers: (fields.Triggers || '')
        .split(';')
        .map((x) => x.trim())
        .filter(Boolean),
      package_contents: fields['Package contents'] || '',
      source: 'llms-full.txt',
    });
  }

  return records;
}

function decodeEntities(html) {
  const named = {
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    nbsp: ' ',
    mdash: '—',
    ndash: '–',
    hellip: '…',
  };

  return html.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, key) => {
    if (key[0] === '#') {
      const numeric = key[1]?.toLowerCase() === 'x';
      const codepoint = parseInt(key.slice(numeric ? 2 : 1), numeric ? 16 : 10);

      return Number.isInteger(codepoint) && codepoint > 0 && codepoint <= 0x10ffff
        ? String.fromCodePoint(codepoint)
        : whole;
    }

    return named[key.toLowerCase()] ?? whole;
  });
}

function plainText(html) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * HTML fallback extracts real per-skill links from server-rendered markup.
 * Rich details remain sourced from the text catalog whenever available.
 */
export function parseDirectory(html, {base = DEFAULT_BASE, categories = CATEGORY_NAMES} = {}) {
  const anchors = /<a\b([^>]*?)>([\s\S]*?)<\/a\s*>/gi;
  const found = new Map();
  let a;

  while ((a = anchors.exec(html))) {
    const attr = a[1].match(/\bhref\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/i);

    if (!attr) continue;
    const href = decodeEntities(attr[2] ?? attr[3]);
    const id = skillIdentity(href, base);

    if (!id) continue;
    const r = recordFor(id.cat, id.slug, base, categories);
    const label = plainText(a[2]);

    const useful =
      label.length >= 3 &&
      label.length <= 120 &&
      !/^(details|view|read more|learn more)/i.test(label);

    if (useful) r.title = label;
    r.source = 'directory-html';
    const key = r.url;
    const old = found.get(key);

    if (!old || (useful && old.title === recordFor(id.cat, id.slug, base, categories).title))
      found.set(key, r);
  }

  return [...found.values()];
}

/** Discover skill URLs from Astro-style sitemap XML, if published. */
export async function parseSitemaps({base = DEFAULT_BASE} = {}) {
  const sitemapIndex = await fetchText('/sitemap-index.xml', {base});
  const locs = xmlLocs(sitemapIndex);
  const xmls = [sitemapIndex];
  const nested = locs.filter((x) => /\.xml(?:\?.*)?$/i.test(x));

  for (const url of nested) {
    if (new URL(url, base).origin !== new URL(base).origin) continue;

    try {
      xmls.push(await fetchText(url, {base}));
    } catch (error) {
      console.error(`Warning: sitemap ${url}: ${messageOf(error)}`);
    }
  }

  const discovered = new Map();

  for (const xml of xmls) {
    for (const loc of xmlLocs(xml)) {
      const id = skillIdentity(loc, base);

      if (id) {
        const record = recordFor(id.cat, id.slug, base);
        record.source = 'sitemap';
        discovered.set(record.url, record);
      }
    }
  }

  return [...discovered.values()];
}

function xmlLocs(xml) {
  return [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi)].map((x) =>
    decodeEntities(x[1].trim()),
  );
}

function mergeInto(map, records) {
  for (const incoming of records) {
    const key = incoming.url.replace(/\/$/, '');
    const current = map.get(key);

    if (!current) {
      map.set(key, {...incoming});
      continue;
    }

    for (const field of [
      'number',
      'title',
      'category',
      'version',
      'license',
      'tagline',
      'description',
      'triggers',
      'package_contents',
      'download_url',
    ]) {
      if (
        (current[field] == null ||
          current[field] === '' ||
          (Array.isArray(current[field]) && !current[field].length)) &&
        incoming[field]
      ) {
        current[field] = incoming[field];
      }
    }
  }
}

export async function collect({base = DEFAULT_BASE, delay = 0.2} = {}) {
  const items = new Map();
  let expected = null;
  let categories = {...CATEGORY_NAMES};
  let haveFeed = false;

  try {
    const summary = parseSummary(await fetchText('/llms.txt', {base}), base);
    expected = summary.count;
    categories = summary.categories;
    console.error(`llms.txt: expected ${expected ?? 'unknown'} skills`);
  } catch (error) {
    console.error(`Warning: llms.txt unavailable: ${messageOf(error)}`);
  }

  try {
    const full = await fetchText('/llms-full.txt', {base});
    const feedCount = findCount(full);
    const parsed = parseFullCatalog(full, {base, categories});
    mergeInto(items, parsed);
    haveFeed = true;
    // Some HTML and summary pages have been seen with older (250) counts.
    // Always prefer the largest count advertised by any source.
    expected = Math.max(expected ?? 0, feedCount ?? 0) || null;
    console.error(`llms-full.txt: ${parsed.length} parsed, advertised ${feedCount ?? 'unknown'}`);
  } catch (error) {
    console.error(`Warning: llms-full.txt unavailable: ${messageOf(error)}`);
  }

  if (!haveFeed || expected === null || items.size < expected) {
    try {
      const parsed = parseDirectory(await fetchText('/skills/', {base}), {base, categories});
      mergeInto(items, parsed);
      console.error(`/skills/: ${parsed.length} found (merged ${items.size})`);
    } catch (error) {
      console.error(`Warning: directory unavailable: ${messageOf(error)}`);
    }
  }

  if (expected === null || items.size < expected) {
    for (const cat of Object.keys(categories)) {
      if (delay) await sleep(delay * 1_000);

      try {
        const parsed = parseDirectory(await fetchText(`/skills/${cat}/`, {base}), {
          base,
          categories,
        });

        mergeInto(items, parsed);
        console.error(`${cat}: ${parsed.length} found (merged ${items.size})`);
      } catch (error) {
        console.error(`Warning: category ${cat}: ${messageOf(error)}`);
      }

      if (expected !== null && items.size >= expected) break;
    }
  }

  if (expected === null || items.size < expected) {
    try {
      const parsed = await parseSitemaps({base});
      mergeInto(items, parsed);
      console.error(`Sitemaps: ${parsed.length} found (merged ${items.size})`);
    } catch (error) {
      console.error(`Warning: sitemaps unavailable: ${messageOf(error)}`);
    }
  }

  const records = [...items.values()].sort(compareRecords);

  return {records, expected};
}

function comparePaths(a, b) {
  if (a === b) return 0;

  return a < b ? -1 : 1;
}

function compareRecords(a, b) {
  return (
    (a.number ?? Infinity) - (b.number ?? Infinity) ||
    a.category_slug.localeCompare(b.category_slug) ||
    a.slug.localeCompare(b.slug)
  );
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join('; ') : value == null ? '' : String(value);

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function save(
  records,
  jsonPath = 'opencodeskills.json',
  csvPath = 'opencodeskills.csv',
) {
  await fsWrite(jsonPath, JSON.stringify(records, null, 2) + '\n');

  const rows = [
    COLUMNS.join(','),
    ...records.map((r) => COLUMNS.map((name) => csvCell(r[name])).join(',')),
  ];

  await fsWrite(csvPath, rows.join('\r\n') + '\r\n');
}

function fsWrite(path, contents) {
  return writeFile(path, contents, 'utf8');
}

export function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);

  return (crc ^ 0xffffffff) >>> 0;
}

function toSafeNumber(value, label) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error(`zip ${label} is too large to address safely`);

  return Number(value);
}

function findEndOfCentralDirectory(buffer) {
  const stop = Math.max(0, buffer.length - 65_557);

  for (let offset = buffer.length - 22; offset >= stop; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIG) return offset;
  }

  throw new Error('not a zip archive: end of central directory record not found');
}

function readDirectoryLocation(buffer, eocd) {
  let count = buffer.readUInt16LE(eocd + 10);
  let size = buffer.readUInt32LE(eocd + 12);
  let offset = buffer.readUInt32LE(eocd + 16);

  if (count !== 0xffff && size !== 0xffffffff && offset !== 0xffffffff)
    return {count, size, offset};

  const locator = eocd - 20;

  if (locator < 0 || buffer.readUInt32LE(locator) !== ZIP64_LOCATOR_SIG) {
    throw new Error('zip64 archive is missing its end of central directory locator');
  }

  const zip64Eocd = toSafeNumber(
    buffer.readBigUInt64LE(locator + 8),
    'zip64 end of central directory',
  );

  if (zip64Eocd < 0 || buffer.readUInt32LE(zip64Eocd) !== ZIP64_EOCD_SIG) {
    throw new Error('zip64 end of central directory record is malformed');
  }

  count = toSafeNumber(buffer.readBigUInt64LE(zip64Eocd + 32), 'entry count');
  size = toSafeNumber(buffer.readBigUInt64LE(zip64Eocd + 40), 'central directory size');
  offset = toSafeNumber(buffer.readBigUInt64LE(zip64Eocd + 48), 'central directory offset');

  return {count, size, offset};
}

function readZip64Extra(extra, needed) {
  let cursor = 0;

  while (cursor + 4 <= extra.length) {
    const id = extra.readUInt16LE(cursor);
    const size = extra.readUInt16LE(cursor + 2);
    const body = extra.subarray(cursor + 4, cursor + 4 + size);

    if (id === ZIP64_EXTRA_ID) {
      const values = {};
      let position = 0;

      if (needed.uncompressed && position + 8 <= body.length) {
        values.uncompressed = toSafeNumber(body.readBigUInt64LE(position), 'uncompressed size');
        position += 8;
      }

      if (needed.compressed && position + 8 <= body.length) {
        values.compressed = toSafeNumber(body.readBigUInt64LE(position), 'compressed size');
        position += 8;
      }

      if (needed.localOffset && position + 8 <= body.length) {
        values.localOffset = toSafeNumber(body.readBigUInt64LE(position), 'local header offset');
      }

      return values;
    }

    cursor += 4 + size;
  }

  return {};
}

function readEntryData(buffer, entry) {
  if (
    entry.localOffset + 30 > buffer.length ||
    buffer.readUInt32LE(entry.localOffset) !== LOCAL_SIG
  ) {
    throw new Error(`zip entry ${entry.name} has no valid local header`);
  }

  const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;

  if (end > buffer.length) throw new Error(`zip entry ${entry.name} is truncated`);

  const raw = buffer.subarray(start, end);

  if (entry.method === METHOD_STORED) return raw;

  if (entry.method === METHOD_DEFLATE) return inflateRawSync(raw);
  throw new Error(`zip entry ${entry.name} uses unsupported compression method ${entry.method}`);
}

/**
 * Parse every central-directory entry of a zip buffer without an npm dependency.
 * Entries carry their unix mode so directories and symlinks can be told apart.
 */
export function readZip(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const {count, size, offset} = readDirectoryLocation(buffer, eocd);

  if (offset + size > buffer.length) throw new Error('zip central directory is truncated');

  const entries = [];
  let cursor = offset;

  for (let index = 0; index < count; index++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_SIG) {
      throw new Error(`zip central directory entry ${index + 1} is malformed`);
    }

    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    let compressedSize = buffer.readUInt32LE(cursor + 20);
    let uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    let localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);

    if (flags & 0x1) throw new Error(`zip entry ${name} is encrypted`);

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      const extraStart = cursor + 46 + nameLength;
      const extra = buffer.subarray(extraStart, extraStart + extraLength);

      const values = readZip64Extra(extra, {
        uncompressed: uncompressedSize === 0xffffffff,
        compressed: compressedSize === 0xffffffff,
        localOffset: localOffset === 0xffffffff,
      });

      compressedSize = values.compressed ?? compressedSize;
      uncompressedSize = values.uncompressed ?? uncompressedSize;
      localOffset = values.localOffset ?? localOffset;
    }

    const mode = externalAttributes >>> 16;
    entries.push({
      name,
      method,
      crc,
      compressedSize,
      uncompressedSize,
      localOffset,
      mode,
      directory: name.endsWith('/') || (mode & 0xf000) === DIRECTORY_MODE,
      symlink: (mode & 0xf000) === SYMLINK_MODE,
    });

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/** Normalize an archive path, or null when it could escape the target directory. */
export function safeEntryPath(name) {
  const normalized = String(name).replace(/\\/g, '/');

  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return null;

  const segments = [];

  for (const part of normalized.split('/')) {
    if (!part || part === '.') continue;

    if (part === '..') return null;
    segments.push(part);
  }

  return segments.length ? segments.join('/') : null;
}

function sanitizeSegment(segment) {
  const cleaned = String(segment)
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^[-.]+/, '');

  return cleaned || 'skill';
}

/** Expand an archive in memory, validating every path and CRC first. */
function planExtraction(buffer, {stripRoot = true} = {}) {
  const entries = readZip(buffer);
  const planned = [];
  const skipped = [];
  let total = 0;

  for (const entry of entries) {
    if (entry.directory) continue;

    const safe = safeEntryPath(entry.name);

    if (!safe) throw new Error(`refusing unsafe archive path: ${entry.name}`);

    if (entry.symlink) {
      skipped.push(entry.name);
      continue;
    }

    if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
      throw new Error(`archive entry ${entry.name} is larger than ${MAX_ENTRY_BYTES} bytes`);
    }

    if (total + entry.uncompressedSize > MAX_ARCHIVE_BYTES) {
      throw new Error(`archive expands beyond ${MAX_ARCHIVE_BYTES} bytes`);
    }

    planned.push({...entry, path: safe});
    total += entry.uncompressedSize;
  }

  const root = planned.length ? planned[0].path.split('/')[0] : null;

  const canStrip = Boolean(
    stripRoot &&
    root &&
    planned.length &&
    planned.every((item) => item.path.startsWith(`${root}/`)),
  );

  const files = [];
  let bytes = 0;

  for (const entry of planned) {
    const path = canStrip ? entry.path.slice(root.length + 1) : entry.path;

    if (!path) continue;

    const data = readEntryData(buffer, entry);

    if (data.length !== entry.uncompressedSize) {
      throw new Error(`zip entry ${entry.name} has an unexpected size`);
    }

    if (crc32(data) !== entry.crc) throw new Error(`zip entry ${entry.name} failed its CRC check`);

    files.push({path, data});
    bytes += data.length;
  }

  return {files, bytes, skipped, root: canStrip ? root : null};
}

/**
 * Unpack a zip buffer into targetDir. Everything is validated and inflated in
 * memory first, so a rejected archive leaves no partial tree behind.
 */
export async function extractZip(buffer, targetDir, {stripRoot = true} = {}) {
  const {files, bytes, skipped, root} = planExtraction(buffer, {stripRoot});
  const rootPath = resolve(targetDir);

  for (const file of files) {
    const destination = resolve(rootPath, file.path);

    if (!destination.startsWith(rootPath + sep)) {
      throw new Error(`refusing to write outside ${rootPath}: ${file.path}`);
    }

    await mkdir(dirname(destination), {recursive: true});
    await writeFile(destination, file.data);
  }

  return {
    files: files.map((file) => file.path).sort(comparePaths),
    bytes,
    skipped,
    root,
  };
}

async function listExtracted(rootPath) {
  const found = [];
  const entries = await readdir(rootPath, {recursive: true, withFileTypes: true});

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    const info = await stat(full);
    found.push({path: relative(rootPath, full).split(sep).join('/'), bytes: info.size});
  }

  found.sort((a, b) => comparePaths(a.path, b.path));

  return found;
}

async function hasContent(path) {
  try {
    const info = await stat(path);

    return info.isDirectory();
  } catch {
    return false;
  }
}

async function mapPool(items, limit, worker) {
  const results = Array.from({length: items.length});
  const width = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  const runners = Array.from({length: width}, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);

  return results;
}

async function downloadOne(record, {dir, force, stripRoot, keepZips, index, previous}) {
  const relativeDir = join(sanitizeSegment(record.category_slug), sanitizeSegment(record.slug));
  const target = resolve(dir, relativeDir);

  const entry = {
    number: record.number ?? null,
    title: record.title,
    slug: record.slug,
    category: record.category,
    category_slug: record.category_slug,
    url: record.url,
    download_url: record.download_url,
    status: 'failed',
    extract_dir: relativeDir.split(sep).join('/'),
    archive: null,
    files: [],
    bytes: 0,
    error: null,
  };

  const prior = previous.get(record.slug);
  const reusable = prior && prior.status !== 'failed' ? prior : null;

  if (!force && (await hasContent(target))) {
    if (reusable && Array.isArray(reusable.files)) {
      return {
        ...entry,
        status: 'cached',
        archive: reusable.archive ?? null,
        files: reusable.files,
        bytes: Number(reusable.bytes) || 0,
      };
    }

    const existing = await listExtracted(target);

    return {
      ...entry,
      status: 'cached',
      files: existing.map((file) => file.path),
      bytes: existing.reduce((sum, file) => sum + file.bytes, 0),
    };
  }

  const temp = resolve(dir, `.tmp-${sanitizeSegment(record.slug)}-${process.pid}-${index}`);

  try {
    const archive = await fetchBytes(record.download_url, {timeoutMs: 60_000});
    const sha256 = createHash('sha256').update(archive).digest('hex');
    const extraction = await extractZip(archive, temp, {stripRoot});

    await rm(target, {recursive: true, force: true});
    await mkdir(dirname(target), {recursive: true});
    await rename(temp, target);

    if (keepZips) {
      const zipPath = resolve(
        dir,
        ZIP_DIRNAME,
        entry.category_slug,
        `${sanitizeSegment(record.slug)}.zip`,
      );

      await mkdir(dirname(zipPath), {recursive: true});
      await writeFile(zipPath, archive);
    }

    if (extraction.skipped.length) {
      console.error(
        `Note: skipped ${extraction.skipped.length} symlink entr${extraction.skipped.length === 1 ? 'y' : 'ies'} in ${record.slug}`,
      );
    }

    return {
      ...entry,
      status: 'downloaded',
      archive: {bytes: archive.length, sha256},
      files: extraction.files,
      bytes: extraction.bytes,
    };
  } catch (error) {
    await rm(temp, {recursive: true, force: true});

    return {...entry, error: messageOf(error)};
  }
}

/** Download and unpack every skill zip. Failures are recorded, never fatal. */
export async function downloadAll(
  records,
  {
    dir,
    force = false,
    stripRoot = true,
    concurrency = 4,
    keepZips = false,
    limit = 0,
    previous = new Map(),
  } = {},
) {
  if (!dir) throw new Error('downloadAll needs a target directory');
  const selected = limit > 0 ? records.slice(0, limit) : records;
  await mkdir(dir, {recursive: true});

  return await mapPool(selected, concurrency, (record, index) =>
    downloadOne(record, {dir, force, stripRoot, keepZips, index, previous}),
  );
}

export function buildManifest({
  base = DEFAULT_BASE,
  catalog,
  skills,
  generatedAt = new Date().toISOString(),
}) {
  const ordered = [...skills].sort(compareRecords);

  const summary = {
    downloaded: 0,
    cached: 0,
    failed: 0,
    files: 0,
    bytes: 0,
  };

  for (const skill of ordered) {
    if (skill.status === 'downloaded') summary.downloaded++;
    else if (skill.status === 'cached') summary.cached++;
    else summary.failed++;
    summary.files += skill.files.length;
    summary.bytes += Number(skill.bytes) || 0;
  }

  const total = catalog?.total ?? ordered.length;
  const advertised = catalog?.advertised ?? null;

  return {
    schema_version: MANIFEST_SCHEMA_VERSION,
    generated_at: generatedAt,
    base,
    catalog: {
      skills: total,
      advertised,
      complete: advertised === null ? null : total >= advertised,
    },
    summary,
    skills: ordered,
  };
}

export async function saveManifest(manifest, path) {
  const target = resolve(path);
  await mkdir(dirname(target), {recursive: true});
  const temp = `${target}.tmp`;
  await writeFile(temp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await rename(temp, target);
}

export async function readManifest(path) {
  const skills = new Map();

  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    const list = isRecord(parsed) && Array.isArray(parsed.skills) ? parsed.skills : [];

    for (const skill of list) {
      if (isRecord(skill) && skill.slug) skills.set(String(skill.slug), skill);
    }
  } catch {
    // A missing or corrupt manifest just means nothing is reusable.
  }

  return skills;
}

function positiveInteger(value, label, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0 || number > max) {
    throw new Error(`${label} must be an integer between 1 and ${max}`);
  }

  return number;
}

function parseArgs(argv) {
  const opts = {
    json: 'opencodeskills.json',
    csv: 'opencodeskills.csv',
    list: false,
    allowPartial: false,
    delay: 0.2,
    base: DEFAULT_BASE,
    download: '',
    manifest: '',
    concurrency: 4,
    limit: 0,
    force: false,
    keepZips: false,
    stripRoot: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];

    if (flag === '--help' || flag === '-h') {
      opts.help = true;
      continue;
    }

    if (flag === '--list') {
      opts.list = true;
      continue;
    }

    if (flag === '--allow-partial') {
      opts.allowPartial = true;
      continue;
    }

    if (flag === '--force') {
      opts.force = true;
      continue;
    }

    if (flag === '--keep-zips') {
      opts.keepZips = true;
      continue;
    }

    if (flag === '--no-strip-root') {
      opts.stripRoot = false;
      continue;
    }

    if (
      [
        '--json',
        '--csv',
        '--delay',
        '--base',
        '--download',
        '--manifest',
        '--concurrency',
        '--limit',
      ].includes(flag)
    ) {
      if (argv[i + 1] === undefined) throw new Error(`Missing value for ${flag}`);
      opts[flag.slice(2)] = argv[++i];
      continue;
    }

    throw new Error(`Unknown argument: ${flag}`);
  }

  opts.delay = Number(opts.delay);

  if (!Number.isFinite(opts.delay) || opts.delay < 0)
    throw new Error('--delay must be nonnegative seconds');
  opts.base = new URL(opts.base).origin;

  if (opts.download) {
    opts.download = resolve(opts.download);
    opts.manifest = opts.manifest ? resolve(opts.manifest) : join(opts.download, MANIFEST_FILENAME);
    opts.concurrency = positiveInteger(opts.concurrency, '--concurrency', MAX_CONCURRENCY);
    opts.limit = opts.limit ? positiveInteger(opts.limit, '--limit') : 0;
  } else if (opts.manifest) {
    throw new Error('--manifest only applies together with --download');
  }

  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(
      'Usage: node scripts/opencodeskills.mjs [options]\n\n' +
        '  --list                Print skill number, name, and URL\n' +
        '  --json FILE           JSON output path (default opencodeskills.json)\n' +
        '  --csv FILE            CSV output path (default opencodeskills.csv)\n' +
        '  --delay SECONDS       Delay between category fetches (default 0.2)\n' +
        '  --allow-partial       Return success even when the export or downloads are incomplete\n' +
        '  --base URL            Alternate base URL (for testing)\n' +
        '  --download DIR        Download and unpack every skill zip into DIR\n' +
        '  --manifest FILE       Manifest path (default DIR/manifest.json)\n' +
        '  --concurrency N       Parallel downloads, 1-16 (default 4)\n' +
        '  --limit N             Download only the first N skills\n' +
        '  --force               Re-download and re-extract every skill\n' +
        '  --keep-zips           Keep a copy of each archive under DIR/zips/\n' +
        "  --no-strip-root       Keep the archive's single top-level directory\n",
    );

    return;
  }

  const {records, expected} = await collect(opts);

  if (records.length === 0)
    throw new Error('No skills found; the feed or page structure may have changed');
  await save(records, opts.json, opts.csv);

  if (opts.list) {
    for (const row of records) {
      console.log(
        `${row.number == null ? '---' : String(row.number).padStart(3, '0')}\t${row.title}\t${row.url}`,
      );
    }
  }

  console.error(`Exported ${records.length} skills to ${opts.json} and ${opts.csv}`);
  console.error(`Advertised catalog total: ${expected ?? 'unknown'}`);

  if (expected !== null && records.length < expected) {
    console.error(
      `WARNING: incomplete export (${records.length}/${expected}); check page caching or parsers`,
    );

    if (!opts.allowPartial) process.exitCode = 2;
  } else if (expected !== null && records.length > expected) {
    console.error('NOTE: more skills found than advertised; some pages may be stale');
  } else if (expected === null) {
    console.error('NOTE: no published total was found; completeness cannot be verified');
  }

  if (!opts.download) return;

  const previous = await readManifest(opts.manifest);

  const skills = await downloadAll(records, {
    dir: opts.download,
    force: opts.force,
    stripRoot: opts.stripRoot,
    concurrency: opts.concurrency,
    keepZips: opts.keepZips,
    limit: opts.limit,
    previous,
  });

  const manifest = buildManifest({
    base: opts.base,
    catalog: {total: records.length, advertised: expected},
    skills,
  });

  await saveManifest(manifest, opts.manifest);

  console.error(
    `Unpacked ${skills.length} skills into ${opts.download}: ` +
      `${manifest.summary.downloaded} downloaded, ${manifest.summary.cached} cached, ${manifest.summary.failed} failed`,
  );
  console.error(`Manifest: ${opts.manifest}`);

  if (manifest.summary.failed > 0) {
    for (const skill of skills) {
      if (skill.status === 'failed') console.error(`  ${skill.slug}: ${skill.error}`);
    }

    if (!opts.allowPartial) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`ERROR: ${messageOf(err)}`);
    process.exitCode = 1;
  });
}

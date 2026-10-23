#!/usr/bin/env node
import {
  errorCode,
  jsonValueSchema,
  type JsonValue,
  type JsonObject,
  isString,
  isRecord,
  isBoolean,
} from '../src/lib/values.ts';

/**
 * Build a merged, de-duplicated skills catalogue from officialskills.sh and
 * omgskills' gold basket, excluding IDs already mapped by this project's own
 * skills map (src/data/skills-map.ts).
 *
 * Every HTTP response uses the same disk cache. A warm --cache-ttl 0 build is an
 * OFFLINE SNAPSHOT, not evidence that GitHub has not changed. Use --refresh or
 * an expiring TTL to check for fresh upstream changes.
 *
 * Node 22.9+ with --experimental-strip-types (or Node 22.18+ directly).
 * No runtime dependencies; the exclusion map is read from the local source tree.
 */

import {createHash} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

import {COMBO_SKILLS_MAP, FRONTEND_BONUS_SKILLS, SKILLS_MAP} from '../src/data/skills-map.ts';

const OFFICIAL_URL = 'https://officialskills.sh/';

const GOLD_URL =
  'https://raw.githubusercontent.com/jonslimak/omgskills/refs/heads/main/index/gold-basket.json';

/** The local map is the exclusion source; nothing is fetched for it. */
const MAP_FILE = 'src/data/skills-map.ts';
const OFFICIAL_HOSTS = new Set(['officialskills.sh', 'www.officialskills.sh']);
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const CACHEABLE_STATUSES = new Set([200, 201, 203, 206, 404, 410]);
const DEFAULT_CACHE_DIR = 'out/cache/skills-catalog';
const DEFAULT_CACHE_TTL_HOURS = 24;
const TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;
const MAX_CANDIDATE_PATHS = 18;
const USER_AGENT = 'SkillsCatalogueBuilder/2.0';

const CATEGORIES = new Set([
  'infrastructure',
  'development',
  'ai-tools',
  'testing',
  'security',
  'workflows',
  'data',
  'design',
  'docs',
]);

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const sha256 = (body: string) => createHash('sha256').update(body).digest('hex');
const sha1 = (body: string) => createHash('sha1').update(body).digest('hex');
const toError = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

interface RequestHeaders {
  [header: string]: string;
}

type Source = 'gold-basket' | 'officialskills';

type JsonRecord = JsonObject;

export interface OfficialMetadata {
  skill_page: string;
  publisher_slug: string;
  name: string;
  github_url: string;
  description: string | null;
  category: string | null;
  classification: 'official' | 'community' | null;
  overview: string | null;
  when_to_use: string[];
  install_command: string | null;
}

export interface SkillMdCheck {
  checked_at: string;
  exists: boolean;
  /** Actual path when a file was found, even if its identity is wrong. */
  path: string | null;
  recorded_path: string | null;
  url: string | null;
  moved: boolean;
  http_status: number | null;
  bytes: number | null;
  sha256: string | null;
  last_modified: string | null;
  has_frontmatter: boolean;
  frontmatter_name: string | null;
  /** Null means there was no earlier hash, or comparison was inconclusive. */
  changed_since_last_build: boolean | null;
  /** Null means inconclusive; a network failure is NOT evidence of obsolescence. */
  outdated: boolean | null;
  reason:
    | 'ok'
    | 'never-seen'
    | 'moved'
    | 'changed'
    | 'name-mismatch'
    | 'invalid'
    | 'missing'
    | 'unresolved'
    | 'error';
  /** Independent of reason: moved+changed+mismatch can coexist. */
  name_mismatch: boolean;
  matched_by: 'path' | 'tree' | null;
  tree_matches: number | null;
  /** hit=unvalidated cached snapshot; stale=offline fallback. */
  source_cache: Resource['cache'] | null;
  error: string | null;
}

export interface SkillRecord {
  id: string;
  name: string;
  publisher: string;
  repository: string;
  repository_url: string;
  github_url: string;
  skill_md_path: string | null;
  skill_md?: SkillMdCheck | null;
  description: string | null;
  category: string | null;
  classification: 'official' | 'community' | null;
  tags: string[];
  sources: Source[];
  gold_basket?: JsonRecord;
  officialskills?: OfficialMetadata;
}

type Candidate = SkillRecord & {aliases: string[]};

export interface Catalogue {
  generated_at: string;
  source_urls: {
    officialskills: string;
    gold_basket: string;
    skills_map: string;
  };
  stats: {
    gold_basket_entries: number;
    officialskills_pages_discovered: number;
    officialskills_pages_attempted: number;
    officialskills_pages_succeeded: number;
    officialskills_pages_failed: number;
    skill_map_exclusion_ids: number;
    duplicates_merged: number;
    excluded_as_already_mapped: number;
    output_skills: number;
    cache_hits: number;
    cache_revalidated: number;
    cache_misses: number;
    cache_stale_served: number;
  };
  verification?: {
    checked_at: string;
    previous_catalogue: string | null;
    previous_generated_at: string | null;
    checked: number;
    found: number;
    missing: number;
    unresolved: number;
    moved: number;
    changed: number;
    name_mismatch: number;
    invalid: number;
    never_seen: number;
    outdated: number;
    errors: number;
    /** Files obtained from the response cache rather than HTTP 200/304. */
    cached_checks: number;
    /** Files returned as stale fallbacks after networking failed. */
    stale_checks: number;
    /** True only when no SKILL.md body was confirmed via HTTP this run. */
    snapshot_only: boolean;
    tree_lookups: number;
    tree_limited: boolean;
  };
  errors: {skill_page: string; error: string}[];
  skill_md_errors?: {
    id: string;
    repository: string;
    path: string | null;
    url: string | null;
    error: string;
  }[];
  skills: SkillRecord[];
}

export interface Options {
  output: string;
  limit: number;
  workers: number;
  delay: number;
  previous: string | null;
  verify: boolean;
  tree: boolean;
  cacheDir: string;
  cacheTtlHours: number;
  refresh: boolean;
  cache: boolean;
}

/* ---------------------- Cached HTTP transport ---------------------- */

export interface Resource {
  url: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  cache: 'miss' | 'hit' | 'revalidated' | 'stale' | 'off';
  fetched_at: string;
}

export interface CacheStats {
  hits: number;
  revalidated: number;
  misses: number;
  stored: number;
  stale: number;
}

interface CacheEntry {
  url: string;
  status: number;
  fetched_at: string;
  etag: string | null;
  last_modified: string | null;
  content_type: string | null;
  bytes: number;
  sha256: string;
  body_file: string;
}

interface CachedBody {
  entry: CacheEntry;
  body: string;
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface RemoteSourceConfig {
  cacheDir?: string | null;
  cacheTtlHours?: number;
  refresh?: boolean;
  delayMs?: number;
  tokens?: {host: string; headers: Record<string, string>}[];
  fetcher?: Fetcher;
}

function retryDelay(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);

  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function resourceFrom(cached: CachedBody, how: Resource['cache']): Resource {
  const {entry} = cached;

  return {
    url: entry.url,
    status: entry.status,
    ok: entry.status >= 200 && entry.status < 300,
    headers: {
      etag: entry.etag ?? '',
      'last-modified': entry.last_modified ?? '',
      'content-type': entry.content_type ?? '',
    },
    body: cached.body,
    cache: how,
    fetched_at: entry.fetched_at,
  };
}

function validators(cached: CachedBody | null): RequestHeaders {
  if (cached?.entry.etag) return {'If-None-Match': cached.entry.etag};

  if (cached?.entry.last_modified) return {'If-Modified-Since': cached.entry.last_modified};

  return {};
}

export class RemoteSource {
  readonly stats: CacheStats = {
    hits: 0,
    revalidated: 0,
    misses: 0,
    stored: 0,
    stale: 0,
  };
  private readonly config: RemoteSourceConfig;
  private readonly inFlight = new Map<string, Promise<Resource>>();
  /** Global gap between outgoing HTTP requests, shared across worker tasks. */
  private requestSlot: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;

  constructor(config: RemoteSourceConfig = {}) {
    this.config = config;
  }
  private get dir(): string | null {
    return this.config.cacheDir === undefined ? DEFAULT_CACHE_DIR : this.config.cacheDir;
  }
  private get ttlMs(): number {
    return Math.max(0, this.config.cacheTtlHours ?? DEFAULT_CACHE_TTL_HOURS) * 3_600_000;
  }
  private get fetcher(): Fetcher {
    return this.config.fetcher ?? ((url, init) => fetch(url, init));
  }
  private headersFor(url: string): RequestHeaders {
    const host = new URL(url).hostname.toLowerCase();
    const headers: RequestHeaders = {};

    for (const token of this.config.tokens ?? []) {
      if (host === token.host.toLowerCase()) Object.assign(headers, token.headers);
    }

    return headers;
  }
  private async reserveRequest(): Promise<void> {
    const delay = Math.max(0, this.config.delayMs ?? 0);

    if (!delay) return;
    const previous = this.requestSlot;
    let release!: () => void;
    this.requestSlot = new Promise<void>((done) => {
      release = done;
    });
    await previous;

    try {
      const now = Date.now();
      const wait = Math.max(0, this.nextRequestAt - now);
      this.nextRequestAt = now + wait + delay;

      if (wait) await sleep(wait);
    } finally {
      release();
    }
  }

  async resource(url: string, accept = '*/*'): Promise<Resource> {
    const running = this.inFlight.get(url);

    if (running) return running;
    const started = this.load(url, accept);
    this.inFlight.set(url, started);

    try {
      return await started;
    } finally {
      this.inFlight.delete(url);
    }
  }
  async text(url: string, accept = '*/*'): Promise<string> {
    const resource = await this.resource(url, accept);

    if (!resource.ok) throw new Error(`HTTP ${resource.status} (${url})`);

    return resource.body;
  }
  private fresh(entry: CacheEntry): boolean {
    if (this.ttlMs === 0) return true; // immutable snapshot until --refresh
    const age = Date.now() - Date.parse(entry.fetched_at);

    return Number.isFinite(age) && age >= 0 && age < this.ttlMs;
  }
  private async load(url: string, accept: string): Promise<Resource> {
    const cached = this.config.refresh ? null : await this.read(url);

    if (cached && this.fresh(cached.entry)) {
      this.stats.hits++;

      return resourceFrom(cached, 'hit');
    }

    try {
      const response = await this.send(url, accept, validators(cached));

      if (response.status === 304 && cached) {
        this.stats.revalidated++;

        const touched = {
          entry: {...cached.entry, fetched_at: new Date().toISOString()},
          body: cached.body,
        };

        await this.writeEntry(touched.entry);

        return resourceFrom(touched, 'revalidated');
      }

      this.stats.misses++;

      const resource: Resource = {
        url,
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
        cache: this.dir ? 'miss' : 'off',
        fetched_at: new Date().toISOString(),
      };

      if (this.dir && CACHEABLE_STATUSES.has(resource.status)) {
        await this.store(resource);
        this.stats.stored++;
      }

      return resource;
    } catch (error) {
      if (!cached) throw error;
      console.error(`cache: serving stale ${url}: ${toError(error)}`);
      this.stats.stale++;

      return resourceFrom(cached, 'stale');
    }
  }
  private async send(
    url: string,
    accept: string,
    extra: Record<string, string>,
  ): Promise<Response> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.reserveRequest();

        const response = await this.fetcher(url, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: accept,
            ...this.headersFor(url),
            ...extra,
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (response.ok || response.status === 304 || CACHEABLE_STATUSES.has(response.status))
          return response;

        if (!RETRY_STATUSES.has(response.status) || attempt === MAX_RETRIES) {
          throw new Error(`HTTP ${response.status} ${response.statusText} (${url})`);
        }

        await sleep(retryDelay(response.headers.get('retry-after')) ?? 1000 * 2 ** attempt);
      } catch (error) {
        if (error instanceof Error && /^HTTP \d+/.test(error.message)) throw error;

        if (attempt === MAX_RETRIES) throw error;
        await sleep(1000 * 2 ** attempt);
      }
    }

    throw new Error(`Retries exhausted: ${url}`);
  }
  private key(url: string): string {
    return sha1(url);
  }
  private async read(url: string): Promise<CachedBody | null> {
    if (!this.dir) return null;

    try {
      const entry: CacheEntry = JSON.parse(
        await readFile(join(this.dir, `${this.key(url)}.json`), 'utf8'),
      );

      if (entry.url !== url || entry.body_file !== `${this.key(url)}.body`) return null;
      const body = await readFile(join(this.dir, entry.body_file), 'utf8');

      // Reject half-written/corrupt cache entries instead of silently trusting them.
      if (entry.bytes !== Buffer.byteLength(body, 'utf8') || entry.sha256 !== sha256(body))
        return null;

      return {entry, body};
    } catch {
      return null;
    }
  }
  private async writeEntry(entry: CacheEntry): Promise<void> {
    if (!this.dir) return;
    await mkdir(this.dir, {recursive: true});
    const target = join(this.dir, `${this.key(entry.url)}.json`);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(entry, null, 2) + '\n', 'utf8');
    await rename(temp, target);
  }
  private async store(resource: Resource): Promise<void> {
    const bodyFile = `${this.key(resource.url)}.body`;
    await mkdir(this.dir!, {recursive: true});
    const target = join(this.dir!, bodyFile);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, resource.body, 'utf8');
    await rename(temp, target);
    await this.writeEntry({
      url: resource.url,
      status: resource.status,
      fetched_at: resource.fetched_at,
      etag: resource.headers['etag'] ?? null,
      last_modified: resource.headers['last-modified'] ?? null,
      content_type: resource.headers['content-type'] ?? null,
      bytes: Buffer.byteLength(resource.body, 'utf8'),
      sha256: sha256(resource.body),
      body_file: bodyFile,
    });
  }
}

/* --------------------- HTML and source parsing --------------------- */

interface HtmlEntities {
  [key: string]: string;
}

const ENTITIES: HtmlEntities = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function decodeEntities(value: string): string {
  return String(value)
    .replace(/&#x([\da-f]+);/gi, (match, hex: string) => {
      const point = parseInt(hex, 16);

      return point >= 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : match;
    })
    .replace(/&#(\d+);/g, (match, decimal: string) => {
      const point = Number(decimal);

      return Number.isInteger(point) &&
        point >= 0 &&
        point <= 0x10ffff &&
        !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : match;
    })
    .replace(/&([\w#]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

export function textOf(html: string): string {
  return decodeEntities(
    String(html)
      .replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function anchors(html: string): {href: string; text: string}[] {
  const result: {href: string; text: string}[] = [];

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const href = (match[1] ?? '').match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    result.push({
      href: decodeEntities(href?.[1] ?? href?.[2] ?? href?.[3] ?? ''),
      text: textOf(match[2] ?? ''),
    });
  }

  return result;
}

export function skillPageLinks(html: string): string[] {
  const pages = new Set<string>();

  for (const anchor of anchors(html)) {
    try {
      const url = new URL(anchor.href, OFFICIAL_URL);
      const parts = url.pathname.split('/').filter(Boolean);

      if (
        url.protocol === 'https:' &&
        OFFICIAL_HOSTS.has(url.hostname.toLowerCase()) &&
        parts.length === 3 &&
        parts[1] === 'skills'
      ) {
        pages.add(new URL(`/${parts.join('/')}`, OFFICIAL_URL).href);
      }
    } catch {
      /* malformed link */
    }
  }

  return [...pages].sort();
}

function metaDescription(html: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/\b(?:name|property)\s*=\s*["'](?:description|og:description)["']/i.test(match[0]))
      continue;
    const content = match[0].match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const value = decodeEntities(content?.[1] ?? content?.[2] ?? '').trim();

    if (value) return value;
  }

  return null;
}

function headingSection(html: string, tag: 'h2' | 'h3', heading: RegExp): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi');

  for (const match of html.matchAll(re)) {
    if (!heading.test(textOf(match[1] ?? ''))) continue;
    const start = (match.index ?? 0) + match[0].length;
    const rest = html.slice(start);
    const next = rest.search(/<h[23]\b/i);

    return (next < 0 ? rest : rest.slice(0, next)).slice(0, 20_000);
  }

  return '';
}

export function readOfficialPage(html: string, skillPage: string): OfficialMetadata {
  const parts = new URL(skillPage).pathname.split('/').filter(Boolean);
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(html);
  const name = h1 ? textOf(h1[1] ?? '') : (parts[2] ?? '');
  const titleEnd = h1 ? h1.index + h1[0].length : 0;
  const afterTitle = html.slice(titleEnd, titleEnd + 16_000);
  const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/i.exec(afterTitle);
  const labels = textOf(afterTitle.slice(0, paragraph?.index ?? 1800));

  const category =
    labels
      .toLowerCase()
      .split(/[^a-z-]+/)
      .find((word) => CATEGORIES.has(word)) ?? null;

  const classification = /\bofficial\b/i.test(labels)
    ? 'official'
    : /\bcommunity\b/i.test(labels)
      ? 'community'
      : null;

  const firstText = paragraph ? textOf(paragraph[1] ?? '') : '';

  const description =
    firstText.length >= 12 && firstText.length < 1500 ? firstText : metaDescription(html);

  let github_url = '';

  for (const anchor of anchors(html)) {
    if (anchor.text.toLowerCase() !== 'view on github') continue;

    try {
      const url = new URL(anchor.href, skillPage);

      if (url.protocol === 'https:' && url.hostname.toLowerCase() === 'github.com') {
        url.hash = '';
        url.search = '';
        github_url = url.href;
        break;
      }
    } catch {
      /* invalid link */
    }
  }

  const overview = headingSection(html, 'h2', /^what this skill does$/i);

  const paragraphs = [...overview.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)]
    .values()
    .map((match) => textOf(match[1] ?? ''))
    .filter(Boolean)
    .toArray();

  const usage = headingSection(html, 'h3', /^when to use it$/i);

  const when_to_use = [...usage.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)]
    .values()
    .map((match) => textOf(match[1] ?? ''))
    .filter(Boolean)
    .toArray();

  const command = textOf(html).match(
    /\bnpx\s+skills\s+add\s+https:\/\/github\.com\/[^\s]+(?:\s+--skill\s+[^\s]+)?/i,
  );

  return {
    skill_page: skillPage,
    publisher_slug: parts[0] ?? '',
    name,
    github_url,
    description: description ?? null,
    category,
    classification,
    overview: paragraphs.length ? paragraphs.join('\n\n') : null,
    when_to_use,
    install_command: command?.[0] ?? null,
  };
}

function asString(value: JsonValue): string {
  return isString(value) ? value.trim() : '';
}

function asRecord(value: JsonValue): JsonRecord | null {
  return value && isRecord(value) && !Array.isArray(value) ? value : null;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^\/+|\/+$/g, '');
}

export function githubRepository(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.toLowerCase() !== 'github.com' || parsed.protocol !== 'https:') return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const [owner, repository] = parts;

    if (!owner || !repository) return null;

    return `${owner}/${repository.replace(/\.git$/i, '')}`;
  } catch {
    return null;
  }
}

function skillFromGithubDirectory(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const at = parts.findIndex((part, i) => i >= 2 && (part === 'tree' || part === 'blob'));

    if (at < 0 || parts.length < at + 3) return null;
    const last = parts.at(-1) ?? '';
    const name = /^skill\.md$/i.test(last) ? (parts.at(-2) ?? '') : last;

    return name && !['skills', '.agents', '.claude', 'main', 'master'].includes(name.toLowerCase())
      ? name
      : null;
  } catch {
    return null;
  }
}

function skillFromMdPath(path: string): string | null {
  const parts = path.split('/').filter(Boolean);

  if (!parts.length) return null;

  return /^skill\.md$/i.test(parts.at(-1)!) ? (parts.at(-2) ?? null) : parts.at(-1)!;
}

function alias(repo: string, name: string): string | null {
  const normalized = slug(name);

  return repo && normalized ? `${repo.toLowerCase()}/${normalized}` : null;
}

function aliasesFor(repo: string, names: (string | null | undefined)[]): string[] {
  return [
    ...new Set(
      names
        .values()
        .map((name) => alias(repo, name ?? ''))
        .filter((s): s is string => Boolean(s))
        .toArray(),
    ),
  ];
}

function parseGoldId(id: string) {
  const colon = id.indexOf(':');

  if (colon >= 0) return {repo: id.slice(0, colon), name: id.slice(colon + 1)};
  const parts = id.split('/');

  return parts.length >= 3
    ? {repo: parts.slice(0, 2).join('/'), name: parts.slice(2).join('/')}
    : {repo: '', name: ''};
}

export function fromGold(value: JsonRecord): Candidate | null {
  const parsed = parseGoldId(asString(value['id']));
  const github = asString(value['github_url']);
  const repo = githubRepository(github) || asString(value['publisher_repo']) || parsed.repo;

  if (!/^[^/]+\/[^/]+$/.test(repo)) return null;
  const mdPath = asString(value['skill_md_path']);
  const name = asString(value['name']) || parsed['name'] || skillFromMdPath(mdPath) || '';
  const identity = parsed.name || name;
  const id = alias(repo, identity);

  if (!id) return null;

  const tags = Array.isArray(value['tags'])
    ? value['tags'].filter((x): x is string => isString(x))
    : [];

  return {
    id,
    name,
    publisher:
      asString(value['publisher_handle']) ||
      asString(value['author_handle']) ||
      (repo.split('/')[0] ?? ''),
    repository: repo,
    repository_url: `https://github.com/${repo}`,
    github_url: github || `https://github.com/${repo}`,
    skill_md_path: mdPath || null,
    description: asString(value['description']) || null,
    category: asString(value['niche']) || null,
    classification: value['official_vendor'] === true ? 'official' : null,
    tags: [...new Set(tags)],
    sources: ['gold-basket'],
    gold_basket: value,
    aliases: aliasesFor(repo, [
      identity,
      name,
      skillFromMdPath(mdPath),
      skillFromGithubDirectory(github),
    ]),
  };
}

export function fromOfficial(value: OfficialMetadata): Candidate | null {
  const repo = githubRepository(value.github_url);

  if (!repo) return null;
  const pageName = new URL(value.skill_page).pathname.split('/').filter(Boolean).at(-1) ?? '';
  const id = alias(repo, pageName);

  if (!id) return null;

  return {
    id,
    name: value.name || pageName,
    publisher: value.publisher_slug || (repo.split('/')[0] ?? ''),
    repository: repo,
    repository_url: `https://github.com/${repo}`,
    github_url: value.github_url,
    skill_md_path: null,
    description: value.description,
    category: value.category,
    classification: value.classification,
    tags: [],
    sources: ['officialskills'],
    officialskills: value,
    aliases: aliasesFor(repo, [pageName, value.name, skillFromGithubDirectory(value.github_url)]),
  };
}

/**
 * Exclusion IDs come from the typed map rather than a network copy, so the
 * catalogue can never be built against a stale or rewritten upstream map.
 * Technology, combo and frontend-bonus entries are all exclusion sources.
 */
export function mappedSkillIds(): Set<string> {
  const ids = new Set<string>();

  const add = (value: string): void => {
    const id = value.trim().toLowerCase();

    if (id.split('/').length >= 3) ids.add(id);
  };

  for (const technology of SKILLS_MAP) for (const id of technology.skills) add(id);

  for (const combo of COMBO_SKILLS_MAP) for (const id of combo.skills) add(id);

  for (const id of FRONTEND_BONUS_SKILLS) add(id);

  if (!ids.size) throw new Error(`No skill IDs could be read from ${MAP_FILE}.`);

  return ids;
}

function mergeInto(target: Candidate, incoming: Candidate): void {
  for (const source of incoming.sources)
    if (!target.sources.includes(source)) target.sources.push(source);
  target.aliases = [...new Set([...target.aliases, ...incoming.aliases])];

  if (incoming.gold_basket) target.gold_basket = incoming.gold_basket;

  if (incoming.officialskills) {
    target.officialskills = incoming.officialskills;
    target.github_url = incoming.github_url;

    if (incoming.category) target.category = incoming.category;

    if (incoming.classification) target.classification = incoming.classification;
  }

  if (!target.description && incoming.description) target.description = incoming.description;

  if (!target.category && incoming.category) target.category = incoming.category;

  if (!target.classification && incoming.classification)
    target.classification = incoming.classification;

  if (!target.skill_md_path && incoming.skill_md_path)
    target.skill_md_path = incoming.skill_md_path;
  target.tags = [...new Set([...target.tags, ...incoming.tags])];
}

/** Union-find handles transitive alias bridges; only whole components are excluded. */
export interface CombinedCandidates {
  skills: SkillRecord[];
  duplicatesMerged: number;
  excludedAsMapped: number;
}

export function combineCandidates(values: Candidate[], excluded: Set<string>): CombinedCandidates {
  const parents = values.map((_, i) => i);

  const root = (index: number): number => {
    let parent = parents[index];

    while (parent !== undefined && parent !== index) {
      const grandparent = parents[parent];

      if (grandparent === undefined) throw new Error('Invalid alias parent');
      parents[index] = grandparent;
      index = grandparent;
      parent = parents[index];
    }

    return index;
  };

  const union = (a: number, b: number) => {
    parents[root(b)] = root(a);
  };

  const byAlias = new Map<string, number>();
  values.forEach((candidate, i) => {
    for (const key of candidate.aliases) {
      const other = byAlias.get(key);

      if (other !== undefined) union(i, other);
      else byAlias.set(key, i);
    }
  });
  const groups = new Map<number, Candidate[]>();
  values.forEach((candidate, i) => {
    const key = root(i);

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(candidate);
  });
  const merged: Candidate[] = [];

  for (const members of groups.values()) {
    // Gold record is canonical even when discovered later; preserve all fields.
    const primary = members.find((candidate) => candidate.gold_basket) ?? members[0];

    if (!primary) continue;

    const candidate: Candidate = {
      ...primary,
      aliases: [...primary.aliases],
      sources: [...primary.sources],
      tags: [...primary.tags],
    };

    for (const member of members) if (member !== primary) mergeInto(candidate, member);
    merged.push(candidate);
  }

  const kept = merged.filter((skill) => !skill.aliases.some((key) => excluded.has(key)));
  kept.sort((a, b) => a.id.localeCompare(b.id));

  return {
    skills: kept.map(({aliases: _aliases, ...publicFields}) => publicFields),
    duplicatesMerged: values.length - groups.size,
    excludedAsMapped: merged.length - kept.length,
  };
}

/* --------------------- SKILL.md verification --------------------- */

const BLOB_OR_TREE = new Set(['blob', 'tree']);
const SKILL_FILE = /^skill\.md$/i;

const GENERIC_DIRS = new Set([
  'skill',
  'skills',
  'agent',
  'agents',
  'claude',
  'docs',
  'doc',
  'src',
  'lib',
  'test',
  'tests',
  'evals',
  'examples',
  'packages',
  'plugins',
  'tools',
  'templates',
  'assets',
]);

const nameKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** GitHub directory links resolve to a SKILL.md; unrelated blob files are rejected. */
export function pathFromGithubUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.toLowerCase() !== 'github.com' || parsed.protocol !== 'https:') return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const at = parts.findIndex((part, i) => i >= 2 && BLOB_OR_TREE.has(part));

    if (at < 0 || parts.length < at + 3) return null;
    const tail = parts.slice(at + 2).join('/');

    if (parts[at] === 'blob') return SKILL_FILE.test(parts.at(-1) ?? '') ? tail : null;

    return SKILL_FILE.test(parts.at(-1) ?? '') ? tail : `${tail}/SKILL.md`;
  } catch {
    return null;
  }
}

function tidyPath(value: string | null | undefined, repository: string): string | null {
  if (!value) return null;

  let path = value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/|\/)+/, '');

  if (repository && path.toLowerCase().startsWith(`${repository.toLowerCase()}/`)) {
    path = path.slice(repository.length + 1);
  }

  if (
    !path ||
    path.split('/').some((segment) => segment === '..' || segment === '.' || !segment) ||
    /[?#\0]/.test(path) ||
    !SKILL_FILE.test(path.split('/').at(-1)!)
  )
    return null;

  return path;
}

/** Paths are deduplicated CASE-SENSITIVELY: SKILL.md and skill.md differ on GitHub. */
export function skillMdCandidates(skill: {
  id?: string;
  name?: string | null;
  repository?: string;
  github_url?: string | null;
  skill_md_path?: string | null;
}): string[] {
  const repository = skill.repository ?? '';
  const paths: string[] = [];

  const add = (path: string | null | undefined) => {
    const normalized = tidyPath(path, repository);

    if (normalized && !paths.includes(normalized)) paths.push(normalized);
  };

  const variants = (path: string | null | undefined) => {
    if (!path) return;
    add(path);

    if (path.endsWith('SKILL.md')) add(path.replace(/SKILL\.md$/, 'skill.md'));
    else if (path.endsWith('skill.md')) add(path.replace(/skill\.md$/, 'SKILL.md'));
  };

  // The catalogue's recorded path is authoritative; the link is a fallback.
  variants(skill.skill_md_path);
  variants(pathFromGithubUrl(skill.github_url ?? ''));
  const names = [...new Set([String(skill.name ?? '').trim(), skill.id?.split('/').at(-1) ?? ''])];

  for (const name of names) {
    if (!name || name.includes('/')) continue;

    for (const directory of ['skills/', '', '.claude/skills/', '.agents/skills/']) {
      variants(`${directory}${name}/SKILL.md`);
    }
  }

  variants('SKILL.md');

  return paths.slice(0, MAX_CANDIDATE_PATHS);
}

/** HEAD resolves the default branch without hard-coding main/master. */
export function rawSkillUrl(repository: string, path: string): string {
  return `https://raw.githubusercontent.com/${repository}/HEAD/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

export interface TreeFile {
  path: string;
  dir: string;
}

export interface RepoTree {
  skillFiles: TreeFile[];
  truncated: boolean;
}

export interface TreeResolver {
  (repository: string): Promise<RepoTree | null>;
  readonly stats: {lookups: number; blocked: boolean; failures: number};
}

export type TreeResult =
  | {kind: 'tree'; tree: RepoTree}
  | {kind: 'denied'; mayBeRateLimited: boolean};

export async function fetchTree(source: RemoteSource, repository: string): Promise<TreeResult> {
  const url = `https://api.github.com/repos/${repository}/git/trees/HEAD?recursive=1`;
  let resource: Resource;

  try {
    resource = await source.resource(url, 'application/vnd.github+json');
  } catch (error) {
    const message = toError(error);
    console.error(`tree: ${repository}: ${message}`);

    return {kind: 'denied', mayBeRateLimited: /HTTP (403|429)\b/.test(message)};
  }

  // A 404 / unreadable repo does NOT prove that the file is absent.
  if (!resource.ok || resource.cache === 'stale') {
    return {kind: 'denied', mayBeRateLimited: false};
  }

  try {
    const payload = jsonValueSchema.parse(JSON.parse(resource.body));
    const parsed = asRecord(payload);

    // Refuse a malformed success payload rather than declaring an empty repo.
    if (!parsed || !Array.isArray(parsed['tree']) || !isBoolean(parsed['truncated'])) {
      throw new Error('Invalid GitHub tree payload');
    }

    const skillFiles: TreeFile[] = [];

    for (const item of parsed['tree']) {
      const entry = asRecord(item);

      if (entry?.['type'] !== 'blob' || !isString(entry['path'])) continue;
      const parts = entry['path'].split('/');

      if (!SKILL_FILE.test(parts.at(-1) ?? '')) continue;
      skillFiles.push({path: entry['path'], dir: parts.at(-2) ?? ''});
    }

    return {kind: 'tree', tree: {skillFiles, truncated: parsed['truncated']}};
  } catch (error) {
    console.error(`tree: ${repository}: ${toError(error)}`);

    return {kind: 'denied', mayBeRateLimited: false};
  }
}

/** Memoize one tree lookup per repository; block only after repeated rate-limit-like denials. */
export function treeResolver(source: RemoteSource): TreeResolver {
  const seen = new Map<string, Promise<RepoTree | null>>();
  const stats = {lookups: 0, blocked: false, failures: 0};

  const load = async (repository: string): Promise<RepoTree | null> => {
    stats.lookups++;
    const result = await fetchTree(source, repository);

    if (result.kind === 'tree') {
      stats.failures = 0;

      return result.tree;
    }

    if (result.mayBeRateLimited && ++stats.failures >= 3) stats.blocked = true;

    if (!result.mayBeRateLimited) stats.failures = 0;

    return null;
  };

  const resolve = async (repository: string): Promise<RepoTree | null> => {
    const earlier = seen.get(repository);

    if (earlier) return earlier;

    if (stats.blocked) return null;
    const started = load(repository);
    seen.set(repository, started);

    return started;
  };

  return Object.assign(resolve, {stats});
}

/** Favor exact skill directory names, then publisher-prefix-stripped names. */
export function treeMatches(tree: RepoTree, skill: SkillRecord): TreeFile[] {
  const owner = skill.repository.split('/')[0] ?? '';
  const names = [skill.name, skill.id.split('/').at(-1) ?? ''];
  const exact = names.values().map(nameKey).filter(Boolean).toArray();

  const stripped = names
    .values()
    .filter((name) => owner && name.toLowerCase().startsWith(`${owner.toLowerCase()}-`))
    .map((name) => nameKey(name.slice(owner.length + 1)))
    .toArray()
    .filter((name) => name && !GENERIC_DIRS.has(name));

  const sort = (matches: TreeFile[]) =>
    matches.sort(
      (a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path),
    );

  const direct = tree.skillFiles.filter((file) => exact.includes(nameKey(file.dir)));

  return sort(
    direct.length ? direct : tree.skillFiles.filter((file) => stripped.includes(nameKey(file.dir))),
  );
}

export function matchInTree(
  tree: RepoTree,
  skill: SkillRecord,
): {path: string; matches: number} | null {
  const matches = treeMatches(tree, skill);
  const first = matches[0];

  return first ? {path: first.path, matches: matches.length} : null;
}

export interface Frontmatter {
  has_frontmatter: boolean;
  name: string | null;
  description: string | null;
}

export function readFrontmatter(text: string): Frontmatter {
  const body = text.replace(/^\uFEFF/, '');
  const opening = /^---[ \t]*\r?\n/.exec(body);

  if (!opening) return {has_frontmatter: false, name: null, description: null};
  const tail = body.slice(opening[0].length);
  const closing = /^---[ \t]*\r?$/m.exec(tail);

  if (!closing) return {has_frontmatter: false, name: null, description: null};
  const block = tail.slice(0, closing.index);

  const field = (key: string): string | null => {
    const match = new RegExp(`^${key}[ \\t]*:[ \\t]*(.*)$`, 'm').exec(block);
    const value = match?.[1]?.trim() ?? '';

    if (!value) return null;

    return value
      .replace(
        /^(?:"([\s\S]*)"|'([\s\S]*)')$/,
        (_all, double: string | undefined, single: string | undefined) => double ?? single ?? '',
      )
      .trim();
  };

  return {
    has_frontmatter: true,
    name: field('name'),
    description: field('description'),
  };
}

/** All source-side names are valid aliases; do not rely solely on a display title. */
function nameMatches(frontmatterName: string, skill: SkillRecord): boolean {
  const gold = skill.gold_basket;

  const known = [
    skill.name,
    skill.id.split('/').at(-1) ?? '',
    asString(gold?.['name']),
    parseGoldId(asString(gold?.['id'])).name,
    skill.officialskills?.name ?? '',
    skill.officialskills?.skill_page?.split('/').filter(Boolean).at(-1) ?? '',
  ].filter(Boolean);

  const wanted = new Set(known.map(nameKey));

  return wanted.has(nameKey(frontmatterName));
}

interface FoundMd {
  kind: 'found';
  check: SkillMdCheck;
  identity: 'valid' | 'mismatch' | 'invalid';
}

type ReadMdResult = FoundMd | {kind: 'gone'} | {kind: 'error'; error: string};

async function readSkillMd(
  source: RemoteSource,
  skill: SkillRecord,
  path: string,
  previous: SkillMdCheck | null,
  recorded_path: string | null,
): Promise<ReadMdResult> {
  if (!tidyPath(path, skill.repository))
    return {kind: 'error', error: `Not a SKILL.md path: ${path}`};
  const url = rawSkillUrl(skill.repository, path);
  let resource: Resource;

  try {
    resource = await source.resource(url, 'text/plain');
  } catch (error) {
    return {kind: 'error', error: toError(error)};
  }

  if (resource.status === 404 || resource.status === 410) {
    if (resource.cache === 'stale')
      return {
        kind: 'error',
        error: `Stale cached HTTP ${resource.status}: ${url}`,
      };

    return {kind: 'gone'};
  }

  if (!resource.ok) return {kind: 'error', error: `HTTP ${resource.status}: ${url}`};
  const metadata = readFrontmatter(resource.body);

  const identity =
    !metadata.has_frontmatter || !metadata.name
      ? 'invalid'
      : nameMatches(metadata.name, skill)
        ? 'valid'
        : 'mismatch';

  const hash = sha256(resource.body);
  const changed = previous?.sha256 ? previous.sha256 !== hash : null;

  const expectedPath =
    recorded_path ?? tidyPath(pathFromGithubUrl(skill.github_url), skill.repository);

  const moved = Boolean(expectedPath) && expectedPath !== path;
  const mismatch = identity === 'mismatch';
  // A stale HTTP fallback proves only a historical snapshot, not current existence.
  const stale = resource.cache === 'stale';

  const reason: SkillMdCheck['reason'] = stale
    ? 'unresolved'
    : mismatch
      ? 'name-mismatch'
      : identity === 'invalid'
        ? 'invalid'
        : moved
          ? 'moved'
          : changed
            ? 'changed'
            : changed === null
              ? 'never-seen'
              : 'ok';

  return {
    kind: 'found',
    identity,
    check: {
      checked_at: new Date().toISOString(),
      exists: true,
      path,
      recorded_path,
      url,
      moved,
      http_status: resource.status,
      bytes: Buffer.byteLength(resource.body, 'utf8'),
      sha256: hash,
      last_modified: resource.headers['last-modified'] || null,
      has_frontmatter: metadata.has_frontmatter,
      frontmatter_name: metadata.name,
      changed_since_last_build: changed,
      outdated: stale ? null : identity !== 'valid' || moved || changed === true,
      reason,
      name_mismatch: mismatch,
      matched_by: null,
      tree_matches: null,
      source_cache: resource.cache,
      error: stale ? 'GitHub could not be reached; this file came from a stale cache entry' : null,
    },
  };
}

/**
 * Path successes must pass identity checking. When directory matching cannot locate a skill
 * in a complete tree containing other SKILL.md files, identity is still UNRESOLVED, not missing.
 */
export async function checkSkillMd(
  source: RemoteSource,
  skill: SkillRecord,
  previous: SkillMdCheck | null,
  trees: TreeResolver | null = null,
): Promise<SkillMdCheck> {
  const recorded_path = tidyPath(skill.skill_md_path, skill.repository);

  const base: SkillMdCheck = {
    checked_at: new Date().toISOString(),
    exists: false,
    path: null,
    recorded_path,
    url: null,
    moved: false,
    http_status: null,
    bytes: null,
    sha256: null,
    last_modified: null,
    has_frontmatter: false,
    frontmatter_name: null,
    changed_since_last_build: null,
    outdated: null,
    reason: 'unresolved',
    name_mismatch: false,
    matched_by: null,
    tree_matches: null,
    source_cache: null,
    error: null,
  };

  if (!skill.repository) return {...base, reason: 'error', error: 'No GitHub repository to check'};
  let failure: string | null = null;
  let recordedFailed = false;
  let mismatchSeen = false;

  const expectedPath =
    recorded_path ?? tidyPath(pathFromGithubUrl(skill.github_url), skill.repository);

  let badFile: SkillMdCheck | null = null;
  let staleFile: SkillMdCheck | null = null;
  const guessed = skillMdCandidates(skill);
  const visited = new Set<string>();

  async function attempt(
    path: string,
    method: 'path' | 'tree',
    treeCount: number | null,
  ): Promise<SkillMdCheck | null> {
    if (visited.has(path)) return null;
    visited.add(path);
    const result = await readSkillMd(source, skill, path, previous, recorded_path);

    if (result.kind === 'error') {
      failure ??= result.error;

      if (path === expectedPath) recordedFailed = true;

      return null;
    }

    if (result.kind === 'gone') return null;

    const check = {
      ...result.check,
      matched_by: method,
      tree_matches: treeCount,
    };

    if (check.source_cache === 'stale') {
      staleFile ??= check;

      return null;
    }

    if (result.identity !== 'valid') {
      // An unrelated file found by a layout guess (or a tree listing) says
      // nothing about this skill. Only catalogue-provided paths can mismatch.
      if (method === 'tree' || (path !== recorded_path && path !== expectedPath)) return null;

      if (result.identity === 'mismatch') mismatchSeen = true;

      // Keep a mismatch on the recorded path ahead of unrelated incidental matches.
      if (
        !badFile ||
        path === recorded_path ||
        (result.identity === 'mismatch' && !badFile.name_mismatch)
      )
        badFile = check;

      return null;
    }

    if (mismatchSeen) {
      check.name_mismatch = true;

      if (check.outdated !== null) check.outdated = true;

      if (check.reason === 'never-seen' || check.reason === 'ok') check.reason = 'name-mismatch';
    }

    if (method === 'tree') {
      // The recorded paths failed; the file list discovered the real location.
      // If the recorded path had a network error, its disappearance is not established.
      check.moved = !recordedFailed;
      check.reason = recordedFailed ? 'unresolved' : 'moved';
      check.outdated = recordedFailed ? null : true;

      if (recordedFailed) check.error = 'Could not verify the original recorded path';
    } else if (recordedFailed && check.moved) {
      check.reason = 'unresolved';
      check.outdated = null;
      check.error = 'Could not verify whether the original recorded path still exists';
    }

    return check;
  }

  for (const path of guessed) {
    const result = await attempt(path, 'path', null);

    if (result) return result;
  }

  let tree: RepoTree | null = null;

  if (trees) tree = await trees(skill.repository);

  if (tree) {
    const matches = treeMatches(tree, skill);

    // In small repositories, also inspect nonmatching directories' frontmatter.
    // For large repositories a directory-name miss cannot prove removal.
    const candidates = [
      ...matches,
      ...(tree.skillFiles.length <= 24
        ? tree.skillFiles.filter((file) => !matches.some((m) => m.path === file.path))
        : []),
    ];

    for (const file of candidates) {
      const check = await attempt(file.path, 'tree', matches.length);

      if (check) return check;
    }

    // A complete *empty* list proves the repo has no SKILL.md. An unmatched
    // nonempty list proves nothing about the skill's identity.
    if (!tree.truncated && tree.skillFiles.length === 0 && !failure && !badFile && !staleFile) {
      return {...base, reason: 'missing', outdated: true, tree_matches: 0};
    }
  }

  if (badFile) return badFile;

  if (staleFile) return staleFile;

  return {
    ...base,
    reason: failure ? 'error' : 'unresolved',
    tree_matches: tree?.skillFiles.length ?? null,
    error: failure,
  };
}

export async function readPreviousCatalogue(file: string | null): Promise<{
  path: string;
  generated_at: string | null;
  checks: Map<string, SkillMdCheck>;
} | null> {
  if (!file) return null;

  try {
    const previous: Catalogue = JSON.parse(await readFile(file, 'utf8'));
    const checks = new Map<string, SkillMdCheck>();

    for (const skill of Array.isArray(previous.skills) ? previous.skills : []) {
      if (skill?.id && skill.skill_md) checks.set(skill.id, skill.skill_md);
    }

    return {
      path: file,
      generated_at: isString(previous.generated_at) ? previous.generated_at : null,
      checks,
    };
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      console.error(`previous catalogue ${file}: ${toError(error)}`);
    }

    return null;
  }
}

function summarizeChecks(checks: Map<string, SkillMdCheck>) {
  const summary = {
    checked: checks.size,
    found: 0,
    missing: 0,
    unresolved: 0,
    moved: 0,
    changed: 0,
    name_mismatch: 0,
    invalid: 0,
    never_seen: 0,
    outdated: 0,
    errors: 0,
    cached_checks: 0,
    stale_checks: 0,
    snapshot_only: false,
  };

  let freshChecks = 0;

  for (const check of checks.values()) {
    if (check.exists) summary.found++;

    if (check.reason === 'missing') summary.missing++;

    if (check.reason === 'unresolved') summary.unresolved++;

    if (check.reason === 'error') summary.errors++;

    if (check.reason === 'invalid') summary.invalid++;

    if (check.moved) summary.moved++;

    if (check.changed_since_last_build) summary.changed++;

    if (check.name_mismatch || check.reason === 'name-mismatch') summary.name_mismatch++;

    if (check.reason === 'never-seen') summary.never_seen++;

    if (check.outdated === true) summary.outdated++;

    if (check.source_cache === 'hit') summary.cached_checks++;

    if (check.source_cache === 'stale') summary.stale_checks++;

    if (
      check.source_cache === 'miss' ||
      check.source_cache === 'revalidated' ||
      check.source_cache === 'off'
    )
      freshChecks++;
  }

  summary.snapshot_only = freshChecks === 0;

  return summary;
}

async function verifySkillMd(
  source: RemoteSource,
  skills: SkillRecord[],
  previous: Map<string, SkillMdCheck>,
  workers: number,
  trees: TreeResolver | null,
) {
  const checks = new Map<string, SkillMdCheck>();

  const errors: {
    id: string;
    repository: string;
    path: string | null;
    url: string | null;
    error: string;
  }[] = [];

  let index = 0;
  let processed = 0;
  await Promise.all(
    Array.from({length: Math.min(workers, skills.length)}, async () => {
      while (index < skills.length) {
        const skill = skills[index++];

        if (!skill) continue;
        const check = await checkSkillMd(source, skill, previous.get(skill.id) ?? null, trees);
        checks.set(skill.id, check);

        if (check.reason === 'error' && check.error) {
          errors.push({
            id: skill.id,
            repository: skill.repository,
            path: check.recorded_path,
            url: check.url,
            error: check.error,
          });
        }

        processed++;

        if (processed % 50 === 0 || processed === skills.length) {
          console.error(`SKILL.md checks: ${processed}/${skills.length}`);
        }
      }
    }),
  );

  return {
    checks,
    errors: errors.sort((a, b) => a.id.localeCompare(b.id)),
    tree: trees?.stats ?? {lookups: 0, blocked: false, failures: 0},
  };
}

/* ---------------------------- Build / CLI ---------------------------- */

async function scrapeOfficialPages(
  source: RemoteSource,
  pages: string[],
  workers: number,
): Promise<{
  entries: Candidate[];
  errors: {skill_page: string; error: string}[];
}> {
  const candidates: (Candidate | null)[] = Array(pages.length).fill(null);
  const errors: {skill_page: string; error: string}[] = [];
  let index = 0;
  let processed = 0;
  await Promise.all(
    Array.from({length: Math.min(workers, pages.length)}, async () => {
      while (index < pages.length) {
        const i = index++;
        const page = pages[i];

        if (page === undefined) continue;

        try {
          const metadata = readOfficialPage(
            await source.text(page, 'text/html,application/xhtml+xml'),
            page,
          );

          const candidate = fromOfficial(metadata);

          if (!candidate) throw new Error('No valid "View on GitHub" skill-directory URL');
          candidates[i] = candidate;
        } catch (error) {
          errors.push({skill_page: page, error: toError(error)});
        }

        processed++;

        if (processed % 25 === 0 || processed === pages.length) {
          console.error(`Official skill pages: ${processed}/${pages.length}`);
        }
      }
    }),
  );

  return {
    entries: candidates.filter((value): value is Candidate => value !== null),
    errors,
  };
}

const HELP = `Usage: node --experimental-strip-types build-skills-catalog.ts [options]

  --output FILE      JSON output (default: skills-catalog.json)
  --limit N          Scrape N official skill pages; 0 = all
  --workers N        Concurrent tasks (default: 3)
  --delay SECONDS    Minimum spacing BETWEEN outgoing requests (default: 0.8)
  --previous FILE    Compare with this catalogue (default: the output file)
  --no-verify        Skip GitHub checks; retain historical hashes in the output
  --no-tree          Skip GitHub API tree lookup when guessed paths fail
  --cache-dir DIR    Response cache (default: ${DEFAULT_CACHE_DIR})
  --cache-ttl HOURS  Revalidate after this many hours; 0 = frozen snapshot (default: ${DEFAULT_CACHE_TTL_HOURS})
  --refresh          Ignore cached responses and fetch fresh data
  --no-cache         Do not read or write cached responses
  --help             Show this help

A frozen snapshot makes zero requests after warming, but cannot detect new
upstream changes. Use --refresh to obtain up-to-date verification results.`;

export function parseOptions(args: string[]): Options | null {
  const options: Options = {
    output: 'skills-catalog.json',
    limit: 0,
    workers: 3,
    delay: 0.8,
    previous: null,
    verify: true,
    tree: true,
    cacheDir: DEFAULT_CACHE_DIR,
    cacheTtlHours: DEFAULT_CACHE_TTL_HOURS,
    refresh: false,
    cache: true,
  };

  for (let i = 0; i < args.length; i++) {
    const key = args[i];

    if (key === undefined) continue;

    if (key === '--help' || key === '-h') {
      console.log(HELP);

      return null;
    }

    if (key === '--no-verify' || key === '--skip-verify') {
      options.verify = false;
      continue;
    }

    if (key === '--no-tree') {
      options.tree = false;
      continue;
    }

    if (key === '--no-cache') {
      options.cache = false;
      continue;
    }

    if (key === '--refresh') {
      options.refresh = true;
      continue;
    }

    if (
      ![
        '--output',
        '--limit',
        '--workers',
        '--delay',
        '--previous',
        '--cache-dir',
        '--cache-ttl',
      ].includes(key)
    ) {
      throw new Error(`Unknown argument: ${key}`);
    }

    const value = args[++i];

    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}`);

    switch (key) {
      case '--output':
        options.output = value;
        break;
      case '--limit':
        options.limit = Number(value);
        break;
      case '--workers':
        options.workers = Number(value);
        break;
      case '--delay':
        options.delay = Number(value);
        break;
      case '--previous':
        options.previous = value;
        break;
      case '--cache-dir':
        options.cacheDir = value;
        break;
      case '--cache-ttl':
        options.cacheTtlHours = Number(value);
        break;
    }
  }

  if (
    !options.output ||
    !Number.isInteger(options.limit) ||
    options.limit < 0 ||
    !Number.isInteger(options.workers) ||
    options.workers < 1 ||
    !Number.isFinite(options.delay) ||
    options.delay < 0 ||
    (options.cache && !options.cacheDir) ||
    !Number.isFinite(options.cacheTtlHours) ||
    options.cacheTtlHours < 0
  ) {
    throw new Error(
      'Invalid options: output nonempty; limit >= 0; workers >= 1; delay >= 0; cache dir nonempty; cache ttl >= 0.',
    );
  }

  return options;
}

export async function build(options: Options): Promise<Catalogue> {
  const token = process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN'] || '';

  const source = new RemoteSource({
    cacheDir: options.cache ? options.cacheDir : null,
    cacheTtlHours: options.cacheTtlHours,
    refresh: options.refresh,
    delayMs: options.delay * 1000,
    tokens: token
      ? [
          {
            host: 'api.github.com',
            headers: {
              Authorization: `Bearer ${token}`,
              'X-GitHub-Api-Version': '2022-11-28',
            },
          },
        ]
      : [],
  });

  const [homeHtml, goldText] = await Promise.all([
    source.text(OFFICIAL_URL, 'text/html'),
    source.text(GOLD_URL, 'application/json'),
  ]);

  const listed = skillPageLinks(homeHtml);

  if (!listed.length)
    throw new Error('No official skill pages found; the site layout may have changed.');
  const json = jsonValueSchema.parse(JSON.parse(goldText));

  if (!Array.isArray(json))
    throw new Error('Golden Basket has an unexpected JSON structure: expected an array.');
  const gold: Candidate[] = [];

  for (const value of json) {
    const record = asRecord(value);

    if (!record) throw new Error('Golden Basket contains a non-object entry.');
    const skill = fromGold(record);

    if (!skill)
      throw new Error(
        `Unidentifiable Golden Basket skill: ${JSON.stringify(record['id'] ?? record['name'])}`,
      );
    gold.push(skill);
  }

  const excluded = mappedSkillIds();
  const pages = options.limit ? listed.slice(0, options.limit) : listed;
  console.error(
    `Golden Basket: ${gold.length}; map IDs: ${excluded.size}; official pages: ${pages.length}/${listed.length}`,
  );
  const official = await scrapeOfficialPages(source, pages, options.workers);
  const combined = combineCandidates([...gold, ...official.entries], excluded);
  const previous = await readPreviousCatalogue(options.previous ?? options.output);
  let skills = combined.skills;
  let verification: Catalogue['verification'];
  let skillMdErrors: Catalogue['skill_md_errors'] = [];

  if (options.verify && skills.length) {
    console.error(
      previous
        ? `SKILL.md: checking ${skills.length} against ${
            previous.path
          } (built ${previous.generated_at ?? 'unknown'})`
        : `SKILL.md: checking ${skills.length}; no previous catalogue, establishing baseline`,
    );
    const trees = options.tree ? treeResolver(source) : null;

    const verified = await verifySkillMd(
      source,
      skills,
      previous?.checks ?? new Map(),
      options.workers,
      trees,
    );

    skills = skills.map((skill) => {
      const check = verified.checks.get(skill.id);

      if (!check) return skill;

      // Only write a new canonical path when identity was confirmed.
      const validPath =
        check.exists &&
        check.has_frontmatter &&
        check.frontmatter_name &&
        nameMatches(check.frontmatter_name, skill) &&
        check.reason !== 'unresolved';

      return {
        ...skill,
        skill_md_path: validPath ? check.path : skill.skill_md_path,
        skill_md: check,
      };
    });
    skillMdErrors = verified.errors;
    verification = {
      checked_at: new Date().toISOString(),
      previous_catalogue: previous?.path ?? null,
      previous_generated_at: previous?.generated_at ?? null,
      ...summarizeChecks(verified.checks),
      tree_lookups: verified.tree.lookups,
      tree_limited: verified.tree.blocked,
    };
    console.error(
      `${verification.checked} SKILL.md checked: ${verification.found} found, ` +
        `${verification.moved} moved, ${verification.changed} changed, ${verification.missing} missing, ` +
        `${verification.unresolved} unresolved, ${verification.outdated} confirmed outdated`,
    );

    if (verification.snapshot_only)
      console.error(
        'verification: cached snapshot only; use --refresh to check live upstream changes',
      );

    if (verification.tree_limited)
      console.error('tree: repeated GitHub denials; set GITHUB_TOKEN and --refresh to retry');
  } else if (!options.verify && previous) {
    // Preserve the last verified hash so a future verified build retains its baseline.
    let kept = 0;
    skills = skills.map((skill) => {
      const old = previous.checks.get(skill.id);

      if (!old) return skill;
      kept++;

      return {
        ...skill,
        skill_md: old, // checked_at stays historical; current source path is unchanged
      };
    });
    console.error(`--no-verify: carried forward ${kept} historical hashes (no new checks)`);
  }

  const cache = source.stats;
  console.error(
    `cache: ${cache.hits} hits, ${cache.revalidated} revalidated, ` +
      `${cache.misses} fetched, ${cache.stale} stale fallbacks`,
  );

  return {
    generated_at: new Date().toISOString(),
    source_urls: {
      officialskills: OFFICIAL_URL,
      gold_basket: GOLD_URL,
      skills_map: MAP_FILE,
    },
    stats: {
      gold_basket_entries: gold.length,
      officialskills_pages_discovered: listed.length,
      officialskills_pages_attempted: pages.length,
      officialskills_pages_succeeded: official.entries.length,
      officialskills_pages_failed: official.errors.length,
      skill_map_exclusion_ids: excluded.size,
      duplicates_merged: combined.duplicatesMerged,
      excluded_as_already_mapped: combined.excludedAsMapped,
      output_skills: skills.length,
      cache_hits: cache.hits,
      cache_revalidated: cache.revalidated,
      cache_misses: cache.misses,
      cache_stale_served: cache.stale,
    },
    verification,
    errors: official.errors.sort((a, b) => a.skill_page.localeCompare(b.skill_page)),
    skill_md_errors: skillMdErrors,
    skills,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  if (!options) return;
  const catalogue = await build(options);
  await mkdir(dirname(resolve(options.output)), {recursive: true});
  // Do not corrupt the previous hash baseline if the process crashes mid-write.
  const temporary = `${options.output}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(catalogue, null, 2) + '\n', 'utf8');
  await rename(temporary, options.output);
  console.log(
    `Wrote ${catalogue.stats.output_skills} unique, unmapped skills to ${options.output}.`,
  );
  console.log(JSON.stringify(catalogue.stats, null, 2));

  if (catalogue.verification)
    console.log(JSON.stringify({verification: catalogue.verification}, null, 2));
  const checkErrors = catalogue.skill_md_errors?.length ?? 0;

  if (catalogue.errors.length || checkErrors) {
    console.error(
      `${catalogue.errors.length} official pages and ${checkErrors} SKILL.md checks failed; ` +
        'see the output JSON error arrays.',
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(toError(error));
    process.exitCode = 1;
  });
}

import {parseMap, parseManifest} from './validate.js';
import {mergeRegistries} from './merge.js';

export const guideSentinel = '<!-- NOSEY-TEMPLATE-MAINTAINER-GUIDE:v1 -->';
export const catalogBegin = '<!-- BEGIN GENERATED SKILL CATALOG -->';
export const catalogEnd = '<!-- END GENERATED SKILL CATALOG -->';

export type GuidePolicy = {maintainer: string; downstream: string};
export type IdentityInput = {
  map: unknown;
  manifest: unknown;
  readme: string;
  agentGuide?: string;
  guidePolicy?: GuidePolicy;
  registryId: string;
};
export type IdentityOutput = {map: Record<string, unknown>; manifest: Record<string, unknown>; readme: string; agentGuide?: string};

const record = (value: unknown, label: string): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, any>;
};
const validRegistryId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) && !value.split('/').some((part) => part === '.' || part === '..' || part.endsWith('.'));
const esc = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim().replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[\\`*_[\]{}()|#!+~]/g, '\\$&').replace(/^-/, '\\-').replace(/^(\d+)\.(?= )/, '$1\\.');

function catalog(manifest: Record<string, any>, map: Record<string, any>): string {
  const lines = ['## Skill catalog', '', `Registry: ${esc(manifest.registryId)} · ${manifest.skills.length} ${manifest.skills.length === 1 ? 'skill' : 'skills'}.`, '', 'Generated from [skills-manifest.json](skills-manifest.json) and [skills-map.json](skills-map.json). Edit those sources or skill frontmatter, then regenerate this section.', '', 'Recommendation conditions below are alternatives; matching any condition can recommend a skill. Technology detection is handled by Nosey.', ''];
  if (!manifest.skills.length) lines.push('No skills are registered.', '');
  for (const skill of [...manifest.skills].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const path = skill.path.split('/').map((part: string) => encodeURIComponent(part).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
    lines.push(`### [${esc(skill.name)}](${path})`, '');
    if (skill.description !== undefined) lines.push(esc(skill.description), '');
    const rules: string[] = [];
    if ((map.alwaysRecommend ?? []).includes(skill.id)) rules.push('Always recommended');
    for (const tech of map.technologies ?? []) if ((tech.skills ?? []).includes(skill.id)) rules.push(`${esc(tech.name)} is detected`);
    for (const item of map.technologySkills ?? []) if ((item.skills ?? []).includes(skill.id)) rules.push(`${esc(item.technologyId)} is detected`);
    for (const combo of map.combinations ?? []) if ((combo.skills ?? []).includes(skill.id)) rules.push(`${esc(combo.name)} is detected`);
    for (const item of map.combinationSkills ?? []) if ((item.skills ?? []).includes(skill.id)) rules.push(`Combination ${esc(item.combinationId)} is detected`);
    if ((map.frontendBonusSkills ?? []).includes(skill.id)) rules.push('A web frontend is detected');
    lines.push(rules.length ? `**Recommended when:**\n\n${[...new Set(rules)].sort().map(rule => `- ${rule}`).join('\n')}` : 'Available; no automatic recommendation.', '');
  }
  return lines.join('\n');
}

export function renderIdentityReadme(readme: string, manifest: Record<string, any>, map: Record<string, any>): string {
  const start = readme.indexOf(catalogBegin), end = readme.indexOf(catalogEnd);
  if (start < 0 || end <= start || readme.indexOf(catalogBegin, start + catalogBegin.length) >= 0 || readme.indexOf(catalogEnd, end + catalogEnd.length) >= 0) throw new Error('README.md requires exactly one ordered pair of generated skill catalog markers');
  const nl = readme.includes('\r\n') ? '\r\n' : '\n';
  return readme.slice(0, start + catalogBegin.length) + nl + nl + catalog(manifest, map).replaceAll('\n', nl) + nl + readme.slice(end);
}

/** Pure, lossless identity rewrite. Parser models are validation-only; serialization uses the raw copies. */
export function transformRegistryIdentity(input: IdentityInput): IdentityOutput {
  if (!validRegistryId(input.registryId)) throw new Error('Registry ID must be owner/repository');
  const map = structuredClone(record(input.map, 'skills-map.json'));
  const manifest = structuredClone(record(input.manifest, 'skills-manifest.json'));
  const old = map.registryId;
  if (!validRegistryId(old) || manifest.registryId !== old) throw new Error('Registry documents have inconsistent registry IDs');
  // Existing v1 registries may encode nullable optional collections; the parser's
  // runtime model accepts these as absent, while the raw document stays untouched.
  const validationMap = structuredClone(map);
  for (const key of ['alwaysRecommend', 'technologies', 'technologySkills', 'combinations', 'combinationSkills', 'frontendBonusSkills', 'frontendPackages', 'webFrontendExtensions']) if (validationMap[key] === null) delete validationMap[key];
  const parsedMap = parseMap(validationMap as any), parsedManifest = parseManifest(manifest as any);
  const locals = new Map<string, string>();
  for (const skill of manifest.skills) {
    if (!validRegistryIdPrefix(skill.id, old)) throw new Error(`Invalid local skill ID: ${skill.id}`);
    if (!/^skills\/.+\/SKILL\.md$/.test(skill.path) || skill.path.includes('\\') || skill.path.split('/').some((part: string) => !part || part === '.' || part === '..')) throw new Error(`Unsafe skill path: ${skill.path}`);
    const expected = `${old}/${skill.path.slice(7, -9)}`;
    if (skill.id !== expected) throw new Error(`Skill ID does not match path: ${skill.id}`);
    if (locals.has(skill.id)) throw new Error(`Duplicate local skill ID: ${skill.id}`);
    locals.set(skill.id, `${input.registryId}${skill.id.slice(old.length)}`);
  }
  const external = new Set((map.externalSkills ?? []).map((s: any) => s.id));
  const refs: string[] = [...(map.alwaysRecommend ?? []), ...(map.frontendBonusSkills ?? []), ...(map.technologies ?? []).flatMap((x: any) => x.skills ?? []), ...(map.technologySkills ?? []).flatMap((x: any) => x.skills ?? []), ...(map.combinations ?? []).flatMap((x: any) => x.skills ?? []), ...(map.combinationSkills ?? []).flatMap((x: any) => x.skills ?? [])];
  for (const id of refs) if (typeof id === 'string' && id.startsWith(old + '/') && !locals.has(id) && !external.has(id)) throw new Error(`Undeclared local-looking skill reference: ${id}`);
  const remap = (id: string) => locals.get(id) ?? id;
  manifest.registryId = input.registryId;
  for (const skill of manifest.skills) skill.id = remap(skill.id);
  map.registryId = input.registryId;
  for (const key of ['alwaysRecommend', 'frontendBonusSkills']) if (Array.isArray(map[key])) map[key] = map[key].map(remap);
  for (const key of ['technologies', 'technologySkills', 'combinations', 'combinationSkills']) if (Array.isArray(map[key])) for (const item of map[key]) if (Array.isArray(item.skills)) item.skills = item.skills.map(remap);
  // Validate normalized known fields and reference resolution while preserving raw unknown data.
  const validationOutputMap = structuredClone(map);
  for (const key of ['alwaysRecommend', 'technologies', 'technologySkills', 'combinations', 'combinationSkills', 'frontendBonusSkills', 'frontendPackages', 'webFrontendExtensions']) if (validationOutputMap[key] === null) delete validationOutputMap[key];
  const nextMap = parseMap(validationOutputMap as any), nextManifest = parseManifest(manifest as any);
  if (nextMap.registryId !== nextManifest.registryId) throw new Error('Transformed registry IDs do not match');
  const merged = mergeRegistries([{map: nextMap, manifest: nextManifest, source: 'identity-transform'}]);
  if (merged.warnings.length) throw new Error(merged.warnings[0]!.message);
  // mergeRegistries historically filters dangling alwaysRecommend entries; this API tightens it.
  const declared = new Set([...nextManifest.skills.map(s => s.id), ...(nextMap.externalSkills ?? []).map(s => s.id)]);
  for (const id of nextMap.alwaysRecommend) if (!declared.has(id)) throw new Error(`Always recommended skill not declared in registry: ${id}`);
  const readme = renderIdentityReadme(input.readme, manifest, map);
  let agentGuide = input.agentGuide;
  if (agentGuide !== undefined) {
    if (input.guidePolicy) {
      const {maintainer, downstream} = input.guidePolicy;
      if (agentGuide === downstream) { /* already configured */ }
      else if (agentGuide === maintainer && agentGuide.startsWith(guideSentinel + '\n')) agentGuide = downstream;
      else if (agentGuide.startsWith(guideSentinel)) throw new Error('Unrecognized or modified template maintainer AGENTS.md');
    } else if (agentGuide.startsWith(guideSentinel)) {
      throw new Error('A trusted guide policy is required to verify template maintainer AGENTS.md');
    }
    // Non-sentinel user-authored instructions remain byte-identical.
  }
  return {map, manifest, readme, ...(agentGuide === undefined ? {} : {agentGuide})};
}

function validRegistryIdPrefix(id: unknown, registryId: string): id is string { return typeof id === 'string' && id.startsWith(registryId + '/') && id.length > registryId.length + 1; }

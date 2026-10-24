import {describe, expect, it} from 'vitest';
import {transformRegistryIdentity, guideSentinel, catalogBegin, catalogEnd} from '../src/lib/registry/identity.js';

const make = (): any => ({
  map: {$schema: {custom: true}, schemaVersion: 1, registryId: 'old/team', technologies: [], technologySkills: null, combinations: [], combinationSkills: [], alwaysRecommend: ['old/team/nested/tool'], frontendBonusSkills: null, frontendPackages: [], webFrontendExtensions: [], extra: {kept: true}},
  manifest: {$schema: 7, schemaVersion: 1, registryId: 'old/team', skills: [{id: 'old/team/nested/tool', name: 'Tool', path: 'skills/nested/tool/SKILL.md', description: 'A tool', custom: 'kept'}], extra: true},
  readme: `Before\n${catalogBegin}\nold\n${catalogEnd}\nAfter`,
  registryId: 'new/team',
});

describe('trusted registry identity transformation', () => {
  it('rewrites only manifest-declared local IDs and preserves unknown data and annotations', () => {
    const input = make();
    input.map.externalSkills = [{id: 'old/team/vendor', name: 'External', source: 'acme/repo', skill: 'tool'}];
    input.map.schemaVersion = 2;
    input.map.alwaysRecommend.push('old/team/vendor');
    const output = transformRegistryIdentity(input);
    expect((output.manifest.skills as any[])[0].id).toBe('new/team/nested/tool');
    expect(output.map.alwaysRecommend).toEqual(['new/team/nested/tool', 'old/team/vendor']);
    expect(output.map.$schema).toEqual({custom: true});
    expect(output.manifest.$schema).toBe(7);
    expect((output.manifest.skills as any[])[0].custom).toBe('kept');
    expect(output.map.extra).toEqual({kept: true});
    expect(output.readme).toContain('Registry: new/team');
  });

  it('is byte-stable on a second transform and preserves a user-authored guide', () => {
    const policy = {maintainer: `${guideSentinel}\n# Maintainer\n`, downstream: '# Downstream\n'};
    const first = transformRegistryIdentity({...make(), agentGuide: '# Mine\n\nKeep this.', guidePolicy: policy});
    const second = transformRegistryIdentity({...first, registryId: 'new/team', guidePolicy: policy});
    expect(second).toEqual(first);
  });

  it('rejects missing/ambiguous README markers, mismatched IDs, and undeclared local-looking refs', () => {
    expect(() => transformRegistryIdentity({...make(), readme: 'no markers'})).toThrow(/markers/);
    const dup = make(); dup.readme += catalogBegin;
    expect(() => transformRegistryIdentity(dup)).toThrow(/markers/);
    const mismatched = make(); mismatched.manifest.registryId = 'other/team';
    expect(() => transformRegistryIdentity(mismatched)).toThrow(/inconsistent/);
    const stray = make(); stray.map.frontendBonusSkills = ['old/team/not-declared'];
    expect(() => transformRegistryIdentity(stray)).toThrow(/Undeclared local-looking/);
  });

  it('converts only exact trusted maintainer guide bytes and rejects sentinel edits', () => {
    const maintainer = `${guideSentinel}\n# Maintainer\n`;
    const downstream = '# Downstream\n';
    const input = make();
    expect(transformRegistryIdentity({...input, agentGuide: maintainer, guidePolicy: {maintainer, downstream}}).agentGuide).toBe(downstream);
    expect(() => transformRegistryIdentity({...input, agentGuide: `${guideSentinel}\n# edited`, guidePolicy: {maintainer, downstream}})).toThrow(/modified/);
    expect(transformRegistryIdentity({...input, agentGuide: '# User\n', guidePolicy: {maintainer, downstream}}).agentGuide).toBe('# User\n');
  });

  it('preserves nullable optional arrays for legacy v1 maps', () => {
    const input = make();
    const output = transformRegistryIdentity(input);
    expect(output.map.technologySkills).toBeNull();
    expect(output.map.frontendBonusSkills).toBeNull();
  });
});

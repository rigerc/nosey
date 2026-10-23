import {mkdtemp, mkdir, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, beforeEach, expect, test} from 'vite-plus/test';
import {detectProject} from '../src/lib/detect.js';
import {formatReport} from '../src/lib/report.js';
import {builtInRegistry, mergeRegistries} from '../src/lib/registry/merge.js';
import {loadLocalRegistry} from '../src/lib/registry/load.js';
import {isString, type JsonValue} from '../src/lib/values.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'nosey-mcp-'));
});

afterEach(async () => {
  await rm(root, {recursive: true, force: true});
});

async function file(name: string, content: string | JsonValue): Promise<void> {
  await mkdir(dirname(join(root, name)), {recursive: true});
  await writeFile(join(root, name), isString(content) ? content : JSON.stringify(content));
}

test.each(['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json', '.codex/config.toml'])(
  'detects versioned packages under arbitrary names in %s',
  async (location) => {
    const content = location.endsWith('.toml')
      ? '[mcp_servers."browser.tools"]\ncommand = "npx"\nargs = [\n "-y",\n "@playwright/mcp@latest",\n]\n[mcp_servers."browser.tools".env]\nPRIVATE_TOKEN = "secret-value"\n'
      : JSON.stringify({
          [location.startsWith('.vscode') ? 'servers' : 'mcpServers']: {
            'browser.tools': {
              command: 'npx',
              args: ['-y', '@playwright/mcp@latest'],
              env: {PRIVATE_TOKEN: 'secret-value'},
            },
          },
        });

    await file(location, content);
    const report = await detectProject(root);
    expect(report.skippedFiles).toEqual([]);
    expect(report.mcpServers).toEqual([
      {
        file: location,
        name: 'browser.tools',
        transport: 'stdio',
        status: 'configured',
        package: {ecosystem: 'npm', name: '@playwright/mcp'},
      },
    ]);
    expect(report.technologies.find((tech) => tech.id === 'mcp-playwright')?.evidence).toEqual([
      `mcp: browser.tools (${location})`,
    ]);
    expect(report.skills.map((skill) => skill.id)).toContain('anthropics/skills/webapp-testing');
    expect(JSON.stringify(report)).not.toContain('secret-value');
    expect(await readFile(join(root, location), 'utf8')).toBe(content);
  },
);

test('VS Code JSONC handles comments and trailing commas without treating comments as declarations', async () => {
  await file(
    '.vscode/mcp.json',
    `{
    // "fake": {"command": "npx", "args": ["@playwright/mcp"]}
    "servers": {
      "reference": {"type": "http", "url": "https://mcp.context7.com/mcp",},
    },
  }`,
  );
  const report = await detectProject(root);
  expect(report.skippedFiles).toEqual([]);
  expect(report.technologies.map((tech) => tech.id)).toEqual(['mcp-context7']);
});

test('remote identity strips secrets and requires the exact origin and path', async () => {
  await file('.mcp.json', {
    mcpServers: {
      docs: {
        url: 'https://user:private-password@DEVELOPERS.OPENAI.COM:443/mcp/?api_key=secret-query#secret-fragment',
        headers: {Authorization: 'Bearer secret-header'},
      },
      context7: {url: 'https://mcp.context7.com.attacker.example/mcp'},
      wrongPath: {url: 'https://mcp.context7.com/other'},
      unresolved: {url: '${MCP_URL}', env: {MCP_URL: 'https://mcp.context7.com/mcp'}},
    },
  });
  const report = await detectProject(root);
  expect(report.skippedFiles).toEqual([]);
  expect(report.technologies.map((tech) => tech.id)).toEqual(['mcp-openai-docs']);
  expect(report.mcpServers?.[0]?.endpoint).toBe('https://developers.openai.com/mcp');
  expect(
    report.mcpServers?.find((server) => server.name === 'unresolved')?.endpoint,
  ).toBeUndefined();

  for (const secret of [
    'private-password',
    'secret-query',
    'secret-fragment',
    'secret-header',
    'MCP_URL',
  ]) {
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(formatReport(report, true)).not.toContain(secret);
  }
});

test('endpoint identity ignores interpolation in credentials and queries without resolving variables', async () => {
  await file('.mcp.json', {
    mcpServers: {
      docs: {url: 'https://${USER}:${PASSWORD}@mcp.context7.com/mcp?api_key=${API_KEY}'},
      unknown: {url: 'https://mcp.context7.com/${PRIVATE_PATH}'},
    },
  });
  const report = await detectProject(root);
  expect(report.skippedFiles).toEqual([]);
  expect(report.technologies.map((tech) => tech.id)).toEqual(['mcp-context7']);
  expect(JSON.stringify(report)).not.toContain('API_KEY');
  expect(JSON.stringify(report)).not.toContain('PRIVATE_PATH');
});

test('disabled, unknown and local script servers remain visible without triggering provider suggestions', async () => {
  await file(
    '.codex/config.toml',
    `
model = "example"
last_seen = 2026-10-23T12:00:00Z
[mcp_servers.off]
command = "npx"
args = ["@playwright/mcp"]
enabled = false
[mcp_servers.context7]
command = "node"
args = ["./custom.js", "@upstash/context7-mcp"]
[mcp_servers.unrelated]
command = "npx"
args = ["other-package", "@playwright/mcp"]
[mcp_servers.local]
command = "python"
args = ["./server.py"]
`,
  );
  const report = await detectProject(root);
  expect(report.technologies).toEqual([]);
  expect(report.skills).toEqual([]);
  expect(report.mcpServers).toHaveLength(4);
  expect(formatReport(report, true, true)).toContain('off [disabled, stdio] (.codex/config.toml)');
  expect(formatReport(report)).toContain('configuration only');
  await file('.cursor/mcp.json', {
    mcpServers: {disabled: {url: 'https://mcp.context7.com/mcp', disabled: true}},
  });
  expect((await detectProject(root)).technologies).toEqual([]);
});

test.each([
  ['npm', ['exec', '--yes', '--', '@playwright/mcp@0.0.1']],
  ['pnpm', ['dlx', '@playwright/mcp']],
  ['yarn', ['dlx', '@playwright/mcp']],
  ['bun', ['x', '@playwright/mcp']],
  ['bunx', ['@playwright/mcp']],
  ['C:\\Program Files\\nodejs\\npx.cmd', ['-y', '@playwright/mcp']],
] satisfies Array<[string, string[]]>)('recognizes %s package runners', async (command, args) => {
  await file('.mcp.json', {mcpServers: {browser: {command, args}}});
  expect((await detectProject(root)).technologies.map((tech) => tech.id)).toContain(
    'mcp-playwright',
  );
});

test('deduplicates suggestions while retaining evidence across nested workspace configs and SDK detection', async () => {
  await file('.mcp.json', {mcpServers: {one: {command: 'npx', args: ['@playwright/mcp']}}});
  await file(
    'packages/app/.codex/config.toml',
    '[mcp_servers.two]\ncommand="npx"\nargs=["@playwright/mcp"]',
  );
  await file('package.json', {
    dependencies: {'@modelcontextprotocol/sdk': '^1', '@upstash/context7-mcp': '^1'},
  });
  const report = await detectProject(root);
  expect(report.technologies.map((tech) => tech.id)).toEqual(['mcp-sdk', 'mcp-playwright']);
  expect(
    report.skills.filter((skill) => skill.id === 'anthropics/skills/webapp-testing'),
  ).toHaveLength(1);
  expect(report.technologies.find((tech) => tech.id === 'mcp-playwright')?.evidence).toHaveLength(
    2,
  );
});

test('malformed JSON/TOML and invalid entries warn without exposing parser source or losing valid files', async () => {
  await file('.mcp.json', '{"mcpServers":{"private-secret":');
  await file('.codex/config.toml', '[mcp_servers.private]\nurl="private-secret');
  await file('.vscode/mcp.json', {
    servers: {
      valid: {url: 'https://mcp.context7.com/mcp'},
      bad: {args: [42], command: 'npx'},
      alsoBad: null,
    },
  });
  const report = await detectProject(root);
  expect(report.technologies.map((tech) => tech.id)).toEqual(['mcp-context7']);
  expect(report.skippedFiles).toHaveLength(3);
  expect(report.skippedFiles.every((item) => item.reason === 'invalid-config')).toBe(true);
  expect(JSON.stringify(report)).not.toContain('private-secret');
  expect(formatReport(report)).toContain('.codex/config.toml: invalid-config');
});

test.each(['null', '[]', '{"mcpServers":null}', '{"mcpServers":[]}'])(
  'rejects invalid configuration shape %s',
  async (content) => {
    await file('.mcp.json', content);
    const report = await detectProject(root);
    expect(report.mcpServers).toEqual([]);
    expect(report.skippedFiles).toEqual([{file: '.mcp.json', reason: 'invalid-config'}]);
  },
);

test('respects size, depth, file count, ignored directories and symlink limits', async () => {
  await file('.mcp.json', {mcpServers: {browser: {command: 'npx', args: ['@playwright/mcp']}}});
  await file('node_modules/example/.mcp.json', {
    mcpServers: {ignored: {url: 'https://mcp.context7.com/mcp'}},
  });
  await file('.codex/config.toml', '[mcp_servers.docs]\nurl="https://developers.openai.com/mcp"');
  const size = await detectProject(root, {maxReadBytes: 8});
  expect(size.mcpServers).toEqual([]);
  expect(size.skippedFiles.every((item) => item.reason === 'too-large')).toBe(true);
  const shallow = await detectProject(root, {depth: 0});
  expect(shallow.mcpServers?.map((server) => server.file)).toEqual(['.mcp.json']);
  expect(shallow.truncated).toBe(true);
  const limited = await detectProject(root, {maxFiles: 1});
  expect(limited.scannedFiles).toBe(1);
  expect(limited.truncated).toBe(true);
  const complete = await detectProject(root);
  expect(complete.mcpServers).toHaveLength(2);
  await rm(join(root, '.mcp.json'));
  await symlink(join(root, 'node_modules/example/.mcp.json'), join(root, '.mcp.json'));
  expect((await detectProject(root)).mcpServers?.map((server) => server.name)).toEqual(['docs']);
});

test.each([
  ['uvx', ['Example_MCP==1.2.3']],
  ['uvx', ['--from', 'Example_MCP[tools]>=1.0', 'example-mcp']],
  ['uv', ['tool', 'run', '--from=Example_MCP', 'example-mcp']],
] satisfies Array<[string, string[]]>)(
  'custom registries match Python distributions through %s',
  async (command, args) => {
    const registryRoot = join(root, 'registry');
    await file('registry/skills/check/SKILL.md', '# Check');
    await file('registry/skills-manifest.json', {
      schemaVersion: 1,
      registryId: 'acme/mcp',
      skills: [{id: 'acme/mcp/check', name: 'Check', path: 'skills/check/SKILL.md'}],
    });
    await file('registry/skills-map.json', {
      schemaVersion: 2,
      registryId: 'acme/mcp',
      technologies: [
        {
          id: 'custom-mcp',
          name: 'Custom MCP',
          detect: {mcpServers: [{pythonPackages: ['example-mcp']}]},
          skills: ['acme/mcp/check'],
        },
      ],
      combinations: [
        {
          id: 'mcp-pair',
          name: 'MCP pair',
          requires: ['custom-mcp', 'mcp-context7'],
          skills: ['acme/mcp/check'],
        },
      ],
    });
    await file('.mcp.json', {
      mcpServers: {custom: {command, args}, docs: {url: 'https://mcp.context7.com/mcp'}},
    });
    const registry = mergeRegistries([await loadLocalRegistry(registryRoot)]);
    expect(registry.warnings).toEqual([]);
    const report = await detectProject(root, {registry: registry.registry});
    expect(report.skills.map((skill) => skill.id)).toEqual(['acme/mcp/check']);
    expect(report.combinations.map((combo) => combo.id)).toContain('mcp-pair');
    expect(report.mcpServers?.find((server) => server.name === 'custom')?.package).toEqual({
      ecosystem: 'python',
      name: 'example-mcp',
    });
  },
);

test('endpoint and package matcher fields are alternatives and cannot be supplied by a server name', async () => {
  const registry = builtInRegistry();
  registry.technologies.push({
    id: 'custom',
    name: 'Custom',
    detect: {mcpServers: [{packages: ['custom-mcp'], endpoints: ['https://custom.example/mcp']}]},
    skills: [],
  });
  await file('.mcp.json', {mcpServers: {context7: {command: 'npx', args: ['custom-mcp']}}});
  expect((await detectProject(root, {registry})).technologies.map((tech) => tech.id)).toEqual([
    'custom',
  ]);
  await file('.mcp.json', {mcpServers: {context7: {url: 'https://custom.example/mcp'}}});
  expect((await detectProject(root, {registry})).technologies.map((tech) => tech.id)).toEqual([
    'custom',
  ]);
});

test('custom local MCP server names recommend skills only from the configured file', async () => {
  await file('registry/skills/docs/SKILL.md', '# Documentation guidance');
  await file('registry/skills-manifest.json', {
    schemaVersion: 1,
    registryId: 'example/team-skills',
    skills: [{id: 'example/team-skills/docs', name: 'Docs', path: 'skills/docs/SKILL.md'}],
  });
  await file('registry/skills-map.json', {
    schemaVersion: 2,
    registryId: 'example/team-skills',
    technologies: [
      {
        id: 'internal-docs-mcp',
        name: 'Internal docs MCP',
        detect: {
          mcpServers: [
            {serverNames: ['company-docs'], configFiles: ['packages/api/.mcp.json']},
          ],
        },
      },
    ],
    technologySkills: [
      {technologyId: 'internal-docs-mcp', skills: ['example/team-skills/docs']},
    ],
  });
  const loaded = await loadLocalRegistry(join(root, 'registry'));
  const {registry, warnings} = mergeRegistries([loaded]);
  expect(warnings).toEqual([]);

  await file('packages/api/.mcp.json', {
    mcpServers: {'company-docs': {command: 'node', args: ['./local-server.js']}},
  });
  await file('.cursor/mcp.json', {
    mcpServers: {'company-docs': {command: 'node', args: ['./another-server.js']}},
  });
  const report = await detectProject(root, {registry});
  expect(report.technologies.find((tech) => tech.id === 'internal-docs-mcp')?.evidence).toEqual([
    'mcp: company-docs (packages/api/.mcp.json)',
  ]);
  expect(report.skills.map((skill) => skill.id)).toContain('example/team-skills/docs');

  await rm(join(root, 'packages/api/.mcp.json'));
  expect((await detectProject(root, {registry})).skills).toEqual([]);

  await file('packages/api/.mcp.json', {
    mcpServers: {'Company-docs': {command: 'node', args: ['./local-server.js']}},
  });
  expect((await detectProject(root, {registry})).skills).toEqual([]);

  await file('packages/api/.mcp.json', {
    mcpServers: {
      'company-docs': {command: 'node', args: ['./local-server.js'], disabled: true},
    },
  });
  expect((await detectProject(root, {registry})).skills).toEqual([]);
});

test('MCP name matching is opt-in and config files scope package and endpoint identities', async () => {
  const registry = builtInRegistry();
  registry.technologies.push({
    id: 'named-local',
    name: 'Named local MCP',
    detect: {mcpServers: [{serverNames: ['company-docs']}]},
    skills: [],
  });
  registry.technologies.push({
    id: 'scoped-package',
    name: 'Scoped package MCP',
    detect: {mcpServers: [
      {packages: ['@playwright/mcp'], configFiles: ['.cursor/mcp.json']},
    ]},
    skills: [],
  });

  await file('.mcp.json', {
    mcpServers: {
      'company-docs': {command: 'node', args: ['./server.js']},
      browser: {command: 'npx', args: ['@playwright/mcp']},
    },
  });
  expect((await detectProject(root, {registry})).technologies.map((t) => t.id)).toEqual([
    'named-local', 'mcp-playwright',
  ]);
  await file('.cursor/mcp.json', {
    mcpServers: {browser: {command: 'npx', args: ['@playwright/mcp']}},
  });
  expect((await detectProject(root, {registry})).technologies.map((t) => t.id)).toEqual([
    'named-local', 'mcp-playwright', 'scoped-package',
  ]);
});

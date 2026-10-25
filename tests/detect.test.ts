import {type JsonObject, isString} from '../src/lib/values';

import os from 'node:os';
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {test, expect} from 'vite-plus/test';
import {detectProject, type Report} from '../src/lib/detect.js';
import {scanProject} from '../src/lib/scanner.js';
import {allPackages, indexManifests} from '../src/lib/manifests.js';
import {
  deriveSkillGroups,
  orderedSelection,
  selectedInGroup,
} from '../src/features/skills/groups.js';

import {COMBO_SKILLS_MAP, SKILLS_MAP} from '../src/data/skills-map.js';

type Files = Record<string, string | JsonObject | undefined>;

async function fixture<T>(
  files: Files,
  fn: (report: Report, root: string) => T | Promise<T>,
  options = {},
): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillsense-test-'));

  try {
    for (const [name, content] of Object.entries(files)) {
      const dest = path.join(root, name);
      await fs.mkdir(path.dirname(dest), {recursive: true});

      if (content === null) await fs.mkdir(dest, {recursive: true});
      else {
        await fs.writeFile(dest, isString(content) ? content : JSON.stringify(content));
      }
    }

    return await fn(await detectProject(root, options), root);
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
}

function has(report: Report, id: string): boolean {
  return report.technologies.some((tech) => tech.id === id);
}

function skill(report: Report, id: string) {
  return report.skills.find((candidate) => candidate.id === id);
}

function combo(report: Report, id: string): boolean {
  return report.combinations.some((candidate) => candidate.id === id);
}

const cli = fileURLToPath(new URL('../src/cli.tsx', import.meta.url));

function runCli(root: string, ...args: string[]): string {
  return execFileSync(process.execPath, ['--import=tsx', cli, root, ...args], {
    encoding: 'utf8',
  });
}

test('mapping loads complete base and combo catalogs', () => {
  expect(SKILLS_MAP.length > 150).toBe(true);
  expect(COMBO_SKILLS_MAP.length > 15).toBe(true);
  expect(SKILLS_MAP.some((technology) => technology.id === 'react')).toBe(true);
});

test('detects npm dependencies, scoped patterns, bonuses, and deduped combo skills', async () => {
  await fixture(
    {
      'package.json': {
        dependencies: {
          react: '^19',
          next: '^15',
          '@clerk/nextjs': '^6',
          tailwindcss: '^4',
        },
        devDependencies: {typescript: '^5'},
      },
      'next.config.ts': 'export default {}',
      '.claude/settings.json': '{}',
      'app/page.tsx': 'export default function Page() { return <main/> }',
    },
    (report) => {
      expect(
        ['react', 'nextjs', 'clerk', 'tailwind', 'typescript'].filter((id) => !has(report, id)),
      ).toStrictEqual([]);

      expect(combo(report, 'nextjs-clerk')).toBe(true);
      expect(skill(report, 'clerk/skills/clerk-nextjs-patterns')).toBeTruthy();
      expect(skill(report, 'anthropics/skills/frontend-design')).toBeTruthy();
      expect(report.agents.some((agent) => agent.agent === 'claude-code')).toBe(true);
      expect(
        report.skills.filter((candidate) => candidate.id === 'clerk/skills/clerk').length,
      ).toBe(1);
      expect(
        report.technologies
          .find((tech) => tech.id === 'react')
          ?.evidence.some((evidence) => evidence.includes('package.json')),
      ).toBe(true);
    },
  );
});

test('nested workspace manifests detected and dependency directories ignored', async () => {
  await fixture(
    {
      'apps/web/package.json': {dependencies: {vue: '*'}},
      'node_modules/ignored/package.json': {dependencies: {rails: '*'}},
      'apps/web/nuxt.config.ts': 'export default {}',
    },
    (report) => {
      expect(has(report, 'vue')).toBe(true);
      expect(has(report, 'nuxt')).toBe(true);
      expect(report.scannedFiles).toBe(2);
      expect(has(report, 'rails')).toBe(false);
    },
  );
});

test('detects Python dependencies from requirements, pyproject, and Pipfile', async () => {
  await fixture(
    {
      'requirements.txt': '# comment\nfastapi>=0.110\npydantic==2.1\n-r extra.txt\n',
      'pyproject.toml':
        '[project]\nname = "example"\ndependencies = [\n "sqlalchemy>=2",\n "pytest>=8",\n]\n[tool.uv]\npython = "3.12"\n',
      'sub/Pipfile': '[packages]\npandas = "*"\n',
    },
    (report) => {
      expect(
        ['python', 'fastapi', 'pydantic', 'sqlalchemy', 'pytest', 'pandas'].filter(
          (id) => !has(report, id),
        ),
      ).toStrictEqual([]);

      expect(combo(report, 'fastapi-sqlalchemy')).toBe(true);
      expect(has(report, 'flask')).toBe(false);
    },
  );
});

test('detects PHP composer, Rails gems and combinations', async () => {
  await fixture(
    {
      'web/composer.json': {require: {'symfony/framework-bundle': '^7'}},
      'web/artisan': '',
      'api/Gemfile': "gem 'rails'\ngem 'rspec-rails'\ngem 'sidekiq'\n",
    },
    (report) => {
      expect(
        ['php', 'symfony', 'rails', 'rspec', 'sidekiq'].filter((id) => !has(report, id)),
      ).toStrictEqual([]);

      expect(combo(report, 'rails-rspec')).toBe(true);
      expect(combo(report, 'rails-sidekiq')).toBe(true);
      expect(skill(report, 'igmarin/rails-agent-skills/plan-tests')).toBeTruthy();
    },
  );
});

test('detects Go, Rust, and Elixir module dependencies', async () => {
  await fixture(
    {
      'service/go.mod':
        'module example.com/service\n\nrequire (\n  github.com/gin-gonic/gin v1.10.0\n)\n',
      'backend/Cargo.toml': '[package]\nname = "backend"\n[dependencies]\naxum = "0.8"\n',
      'worker/mix.exs': 'defp deps do\n [{:phoenix, "~> 1.7"}]\nend\n',
    },
    (report) => {
      expect(
        ['go', 'gin', 'rust', 'axum', 'elixir', 'phoenix'].filter((id) => !has(report, id)),
      ).toStrictEqual([]);

      expect(skill(report, 'non-existent-skill')).toBeFalsy();
      expect(report.technologies.find((tech) => tech.id === 'gin')?.skills.length).toBe(0);
    },
  );
});

test('content detection handles Gradle and ignores comments in Swift sources', async () => {
  await fixture(
    {
      'android/app/build.gradle.kts':
        'plugins { id("com.android.application")\n kotlin("multiplatform") }',
      'ios/False.swift': '// import SwiftUI\nlet phrase = "import SwiftUI"',
      'ios/True.swift': 'import Foundation\nimport SwiftUI\nstruct Main {}',
    },
    (report) => {
      expect(has(report, 'android')).toBe(true);
      expect(has(report, 'kotlin-multiplatform')).toBe(true);
      expect(has(report, 'swiftui')).toBe(true);
      const evidence = report.technologies.find((tech) => tech.id === 'swiftui')?.evidence ?? [];
      expect(evidence.some((entry) => entry.includes('True.swift'))).toBe(true);
      expect(evidence.some((entry) => entry.includes('False.swift'))).toBe(false);
    },
  );
});

test('minimal API allPatterns can combine signals from distinct source files', async () => {
  await fixture(
    {
      'app/Example.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>',
      'app/Program.cs': 'var app = WebApplication.CreateBuilder(args).Build();',
      'app/Routes.cs': 'app.MapGet("/", () => "hi");',
      'app/Ignore.cs': '// app.MapPost("/",()=> 0)',
    },
    (report) => {
      expect(has(report, 'dotnet')).toBe(true);
      expect(has(report, 'csharp')).toBe(true);
      expect(has(report, 'aspnetcore')).toBe(true);
      expect(has(report, 'aspnet-minimal-api')).toBe(true);
    },
  );
});

test('no mapped skills remains clearly distinguishable; bonus option works', async () => {
  await fixture({'package.json': {dependencies: {zustand: '*'}}}, (report) => {
    expect(has(report, 'zustand')).toBe(true);
    expect(report.skills.length).toBe(0);
    expect(report.summary.technologiesWithoutSkills).toBe(1);
  });

  await fixture(
    {'index.html': '<html></html>'},
    (report) => {
      expect(report.frontendDetected).toBe(true);
      expect(report.skills.length).toBe(0);
    },
    {frontendBonus: false},
  );
});

test('CLI rejects conflicting, invalid and unknown flags', async () => {
  await fixture({'package.json': {dependencies: {react: '*'}}}, (_, root) => {
    expect(() => runCli(root, '--json', '--skills-only')).toThrow(
      expect.objectContaining({
        status: 2,
        stderr: expect.stringMatching(/mutually exclusive/),
      }),
    );
    expect(() => runCli(root, '--depth', 'abc')).toThrow(
      expect.objectContaining({
        status: 2,
        stderr: expect.stringMatching(/--depth requires a non-negative integer/),
      }),
    );
    expect(() => runCli(root, '--bogus-flag')).toThrow(
      expect.objectContaining({
        status: 2,
        stderr: expect.stringMatching(/Unknown option: --bogus-flag/),
      }),
    );
  });
});

test('CLI JSON and skills-only modes produce parseable results', async () => {
  await fixture({'package.json': {dependencies: {react: '*'}}}, (_, root) => {
    // SAFETY: the owned fixture produces this JSON contract; the assertions below verify its fields.
    const result = JSON.parse(runCli(root, '--json')) as Report;
    expect(result.technologies.some((tech) => tech.id === 'react')).toBe(true);
    expect(result.skills.every((candidate) => Array.isArray(candidate.sources))).toBe(true);

    const ids = runCli(root, '--skills-only');
    expect(ids.includes('react-best-practices')).toBe(true);
  });
});

test('root manifests survive a file limit consumed by an early directory', async () => {
  await fixture(
    {
      'aaa_data/a.txt': '',
      'aaa_data/b.txt': '',
      'aaa_data/c.txt': '',
      'package.json': {dependencies: {next: '*'}},
      'pyproject.toml': '[project]\ndependencies = ["fastapi"]',
    },
    (report) => {
      expect(has(report, 'nextjs')).toBe(true);
      expect(has(report, 'fastapi')).toBe(true);
      expect(report.truncated).toBe(true);
      expect(report.scannedFiles).toBe(2);
    },
    {maxFiles: 2},
  );
});

test('browser build tooling does not recommend Node backend skills', async () => {
  await fixture(
    {
      'package.json': {dependencies: {react: '*', 'react-dom': '*', vite: '*'}},
      'package-lock.json': '{}',
      '.nvmrc': '22',
    },
    (report) => {
      expect(skill(report, 'wshobson/agents/nodejs-backend-patterns')).toBeFalsy();
      expect(skill(report, 'sickn33/antigravity-awesome-skills/nodejs-best-practices')).toBeFalsy();
    },
  );
  await fixture({'package.json': {dependencies: {express: '*'}}}, (report) => {
    expect(has(report, 'node')).toBe(true);
    expect(skill(report, 'wshobson/agents/nodejs-backend-patterns')).toBeTruthy();
  });
});

for (const [name, files] of Object.entries({
  ink: {
    'package.json': {dependencies: {react: '*', ink: '*'}},
    'app.tsx': 'export default <Text>hi</Text>',
  },
  native: {
    'package.json': {
      dependencies: {react: '*', 'react-native': '*', expo: '*'},
    },
    'App.tsx': 'export default <View />',
  },
  docs: {'requirements.txt': 'fastapi', 'docs/index.html': '<html></html>'},
  css: {'Cargo.toml': '[package]\nname="cli"', 'assets/style.css': 'body {}'},
})) {
  test(`frontend bonuses exclude ${name} without web evidence`, async () => {
    await fixture(files, (report) => {
      expect(report.frontendDetected).toBe(false);
      expect(
        report.skills.some((candidate) =>
          candidate.sources.some((origin) => origin.type === 'frontend'),
        ),
      ).toBe(false);
    });
  });
}

test('frontend detection preserves static sites and mixed web workspaces', async () => {
  await fixture({'index.html': '<html></html>', 'style.css': 'body {}'}, (report) => {
    expect(report.frontendDetected).toBe(true);
  });
  await fixture(
    {
      'package.json': {dependencies: {ink: '*', react: '*'}},
      'apps/native/package.json': {
        dependencies: {'react-native': '*', react: '*'},
      },
      'apps/web/package.json': {dependencies: {'react-dom': '*', react: '*'}},
    },
    (report) => {
      expect(report.frontendDetected).toBe(true);
      expect(skill(report, 'anthropics/skills/frontend-design')).toBeTruthy();
    },
  );
});

test('Go indirect modules do not count as direct technology dependencies', async () => {
  await fixture(
    {
      'go.mod': 'module example.com/cli\nrequire github.com/gin-gonic/gin v1.10.0 // indirect\n',
    },
    (report) => {
      expect(has(report, 'go')).toBe(true);
      expect(has(report, 'gin')).toBe(false);
    },
  );
});

const coreGoSkills = [
  'golang-code-style',
  'golang-error-handling',
  'golang-security',
  'golang-testing',
].map((name) => 'samber/cc-skills-golang/' + name);

for (const file of ['go.mod', 'go.work']) {
  test(`bare ${file} recommends only the four core Go skills`, async () => {
    await fixture(
      {[file]: file === 'go.mod' ? 'module example.com/cli\n\ngo 1.24\n' : 'go 1.24\n'},
      (report) => {
        expect(has(report, 'go')).toBe(true);
        expect(report.skills.map((candidate) => candidate.id).sort()).toStrictEqual(coreGoSkills);
        expect(
          report.technologies
            .find((tech) => tech.id === 'go')
            ?.skills.slice()
            .sort(),
        ).toStrictEqual(coreGoSkills);
      },
    );
  });
}

// Explicit expectations keep module aliases and recommendation identities under review.
const goLibraryMappings: Array<[string, string, string[]]> = [
  ['google-wire', 'golang-google-wire', ['github.com/google/wire']],
  ['uber-dig', 'golang-uber-dig', ['go.uber.org/dig']],
  ['uber-fx', 'golang-uber-fx', ['go.uber.org/fx']],
  ['samber-do', 'golang-samber-do', ['github.com/samber/do', 'github.com/samber/do/v2']],
  ['samber-hot', 'golang-samber-hot', ['github.com/samber/hot']],
  ['samber-lo', 'golang-samber-lo', ['github.com/samber/lo']],
  ['samber-mo', 'golang-samber-mo', ['github.com/samber/mo']],
  ['samber-oops', 'golang-samber-oops', ['github.com/samber/oops']],
  ['samber-ro', 'golang-samber-ro', ['github.com/samber/ro']],
  [
    'samber-slog',
    'golang-samber-slog',
    [
      'github.com/samber/slog-multi',
      'github.com/samber/slog-sampling',
      'github.com/samber/slog-formatter',
    ],
  ],
  ['cobra', 'golang-spf13-cobra', ['github.com/spf13/cobra']],
  ['viper', 'golang-spf13-viper', ['github.com/spf13/viper']],
  [
    'swagger',
    'golang-swagger',
    [
      'github.com/swaggo/swag',
      'github.com/swaggo/gin-swagger',
      'github.com/swaggo/echo-swagger',
      'github.com/swaggo/http-swagger',
      'github.com/swaggo/files',
    ],
  ],
  ['testify', 'golang-stretchr-testify', ['github.com/stretchr/testify']],
  [
    'go-graphql',
    'golang-graphql',
    ['github.com/99designs/gqlgen', 'github.com/graph-gophers/graphql-go'],
  ],
  ['go-grpc', 'golang-grpc', ['google.golang.org/grpc']],
];

for (const [technologyId, skillName, modules] of goLibraryMappings) {
  for (const module of modules) {
    test(`${module} recommends only its matching Go library skill with a specific origin`, async () => {
      const id = 'samber/cc-skills-golang/' + skillName;
      await fixture(
        {'go.mod': `module example.com/service\nrequire ${module} v1.0.0\n`},
        (report) => {
          expect(has(report, technologyId)).toBe(true);
          expect(
            report.technologies
              .find((tech) => tech.id === technologyId)
              ?.evidence.some((reason) => reason.includes('go.mod')),
          ).toBe(true);
          expect(skill(report, id)?.sources.map((source) => source.id)).toStrictEqual([
            technologyId,
          ]);
          expect(
            report.skills
              .filter((candidate) => candidate.id.startsWith('samber/cc-skills-golang/'))
              .map((candidate) => candidate.id)
              .sort(),
          ).toStrictEqual([...coreGoSkills, id].sort());

          if (technologyId === 'go-graphql') {
            expect(has(report, 'graphql')).toBe(true);
            expect(skill(report, 'apollographql/skills/graphql-operations')).toBeTruthy();
          }

          if (technologyId === 'go-grpc') expect(has(report, 'grpc')).toBe(true);
        },
      );
    });
  }

  test(`${technologyId} is not recommended for indirect-only or similarly named modules`, async () => {
    const requirements = modules
      .flatMap((module) => [`  ${module} v1.0.0 // indirect`, `  ${module}-unrelated v1.0.0`])
      .join('\n');

    await fixture(
      {'go.mod': `module example.com/service\nrequire (\n${requirements}\n)\n`},
      (report) => {
        expect(has(report, technologyId)).toBe(false);
        expect(report.skills.map((candidate) => candidate.id).sort()).toStrictEqual(coreGoSkills);
      },
    );
  });
}

for (const withGo of [false, true]) {
  test(`non-Go GraphQL/gRPC dependencies do not suggest Go library skills (Go workspace: ${withGo})`, async () => {
    const files = {
      'web/package.json': {dependencies: {graphql: '^16', '@grpc/grpc-js': '^1'}},
      'service/requirements.txt': 'grpcio==1.71.0\ngrpcio-tools==1.71.0\n',
    };

    if (withGo) Object.assign(files, {'other/go.mod': 'module example.com/unrelated\ngo 1.24\n'});

    await fixture(files, (report) => {
      expect(has(report, 'graphql')).toBe(true);
      expect(has(report, 'grpc')).toBe(true);
      expect(skill(report, 'apollographql/skills/graphql-operations')).toBeTruthy();
      expect(has(report, 'go-graphql')).toBe(false);
      expect(has(report, 'go-grpc')).toBe(false);
      expect(
        report.skills
          .filter((candidate) => candidate.id.startsWith('samber/cc-skills-golang/'))
          .map((candidate) => candidate.id)
          .sort(),
      ).toStrictEqual(withGo ? coreGoSkills : []);
    });
  });
}

test('Go CLI dependencies add three skills to the four-skill baseline', async () => {
  await fixture(
    {
      'go.mod':
        'module example.com/cli\nrequire (\n github.com/spf13/cobra v1.9.1\n go.uber.org/fx v1.23.2\n github.com/samber/lo v1.53.0\n)\n',
    },
    (report) => {
      expect(report.skills.map((candidate) => candidate.id).sort()).toStrictEqual(
        [
          ...coreGoSkills,
          'samber/cc-skills-golang/golang-spf13-cobra',
          'samber/cc-skills-golang/golang-uber-fx',
          'samber/cc-skills-golang/golang-samber-lo',
        ].sort(),
      );
      const groups = deriveSkillGroups(report);
      expect(groups.map((group) => [group.key, group.skillIds.length])).toStrictEqual([
        ['technology:cobra', 1],
        ['technology:go', 4],
        ['technology:samber-lo', 1],
        ['technology:uber-fx', 1],
      ]);
      const selected = new Set(report.skills.map((candidate) => candidate.id));
      expect(
        groups
          .map((group) => selectedInGroup(group, selected))
          .reduce((sum, count) => sum + count, 0),
      ).toBe(7);
      expect(orderedSelection(report, selected)).toHaveLength(7);
    },
  );
});

test('built-in technology skill lists are unique three-segment IDs', () => {
  for (const technology of SKILLS_MAP) {
    expect(new Set(technology.skills).size).toBe(technology.skills.length);

    for (const id of technology.skills) expect(id.split('/')).toHaveLength(3);
  }
});

test('Cargo dependency subtables and renames are detected', async () => {
  await fixture(
    {
      'Cargo.toml':
        '[package]\nname="server"\n[dependencies.web]\npackage="axum"\nversion="0.8"\n[target.\'cfg(unix)\'.dependencies.tokio]\nversion="1"\n',
    },
    async (report, root) => {
      expect(has(report, 'axum')).toBe(true);
      const index = await indexManifests(await scanProject(root));
      expect(
        allPackages(index, 'rustCrates')
          .map((pkg) => pkg.name)
          .sort(),
      ).toStrictEqual(['axum', 'tokio']);
    },
  );
});

test('oversized reads are reported in JSON and plain text', async () => {
  await fixture(
    {
      'composer.lock': JSON.stringify({
        packages: [{name: 'laravel/framework'}],
        padding: ' '.repeat(600_000),
      }),
    },
    (report, root) => {
      expect(has(report, 'laravel')).toBe(false);

      // SAFETY: the owned fixture produces this JSON contract; the assertions below verify its fields.
      const result = JSON.parse(runCli(root, '--json')) as Report & {
        skippedFiles: Array<{file: string; reason: string}>;
      };

      expect(
        result.skippedFiles.some(
          (item) => item.file === 'composer.lock' && item.reason === 'too-large',
        ),
      ).toBe(true);
      expect(runCli(root, '--no-interactive')).toMatch(/composer.lock.*too-large/);
    },
  );
});

test('content evidence keeps late signals, distinct masking modes, and file limits', async () => {
  await fixture(
    {
      'App.csproj': '<!-- Microsoft.AspNetCore.App -->\n<Project Sdk="Microsoft.NET.Sdk.Web" />',
      'Program.cs':
        '/* WebApplication.CreateBuilder(args); */\n' +
        ' '.repeat(100_000) +
        '\nvar app = WebApplication.CreateBuilder(args).Build();',
      'Routes.cs': 'var ignored = "app.MapDelete";\napp.MapGet("/", () => "ok");',
      'OnlyStrings.swift': 'let message = "import SwiftUI"; // import SwiftUI',
    },
    (report) => {
      expect(has(report, 'dotnet')).toBe(true);
      expect(has(report, 'aspnetcore')).toBe(true);
      expect(has(report, 'aspnet-minimal-api')).toBe(true);
      expect(has(report, 'swiftui')).toBe(false);

      const evidence =
        report.technologies.find((tech) => tech.id === 'aspnet-minimal-api')?.evidence ?? [];

      expect(evidence.some((value) => value.includes('Program.cs'))).toBe(true);
      expect(evidence.some((value) => value.includes('Routes.cs'))).toBe(true);
    },
    {maxCacheBytes: 0},
  );
});

test('builtin Node server imports qualify without package-manager evidence', async () => {
  await fixture(
    {
      'server.mjs': 'import {createServer} from "node:http";\ncreateServer(() => {});',
    },
    (report) => {
      expect(has(report, 'node')).toBe(true);
    },
  );
  await fixture({'server.mjs': '// import {createServer} from "node:http";'}, (report) => {
    expect(has(report, 'node')).toBe(false);
  });
});

# Install recommended skills command

Status: **proposed; not implemented**. This plan adds a first-class headless
command for installing Nosey's recommended skills, with CI as a primary consumer.

## Goal

Add `nosey install [path]` so a project can turn a scan result into installed
agent skills in one noninteractive step:

```bash
nosey install . --agent codex --yes
```

The command must reuse the existing detection and Skills CLI planning code. It
must not introduce a second scanner, a second registry loader, or a second
install-command generator.

## Current behavior (verified)

- `src/features/skills/install.ts` already owns agent validation, install-source
  resolution (`skillSource`), lock-provenance inspection
  (`inspectInstalledSkills`), and grouped command generation
  (`generateInstallCommands`). Commands are project-local and always pass
  `--yes --json`, never `--global`.
- `src/features/skills/execute.ts` already runs a structured plan sequentially
  with `spawn('npx', args, {shell: false})`, forwards signals to the process
  group, and stops after the first failure.
- `src/commands/scan.ts` already resolves registries and produces a `Report`
  whose `skills` are the recommendations.
- `src/features/skills/context.tsx` duplicates the UI-side pipeline: detect,
  choose agents, inspect installed skills, attach `installSource`/`installation`.
- `src/commands/index.ts` currently rejects `--yes` for every non-registry
  command through `registryInitOptions`, so the guard needs narrowing before an
  install command can accept it.
- `--json` execution would be unsafe with the existing inherited stdio: child
  output would precede the wrapper's JSON document and make stdout unparsable.

## Command contract

| Flag                  | Meaning                                                                    | Default                     |
| --------------------- | -------------------------------------------------------------------------- | --------------------------- |
| `[path]`              | Project to scan and install into                                           | `.`                         |
| `--agent <id>`        | Target agent; repeatable. Validated by `validAgents`                       | config / discovered folders |
| `--yes`               | Execute the plan. Without it the command only prints the plan              | off                         |
| `--json`              | Emit one machine-readable document describing plan and result              | off                         |
| `--skills-only`       | Rejected; install plans are not ID lists                                   | —                           |
| `--dry-run`           | Alias for the default (no `--yes`); useful for CI readability              | —                           |
| `--skills-cli <spec>` | npm package spec used for `npx` (for example `skills@1.2.3`)               | `skills`                    |
| scan flags            | `--registry`, `--depth`, `--max-files`, `--no-frontend-bonus` pass through | existing defaults           |
| `--config <path>`     | Existing configuration file                                                | existing behavior           |

Execution is opt-in because Nosey's documented invariant is that printing a plan
never installs. `nosey install` therefore previews; `nosey install --yes`
installs. This also matches `registry init --yes` in the existing CLI.

### Recommendation semantics

1. Resolve registries exactly as `scan` does, including `--registry` and
   warnings to stderr.
2. Detect the project with `detectProject` using the same bounds and
   `frontendBonus`.
3. Treat every `report.skills` entry as recommended.
4. Target agents, in precedence order:
   - repeatable `--agent` values (deduplicated, validated);
   - `skillsCli.defaultAgents` from config;
   - `discoverProjectSkillAgents(root)`;
   - otherwise fail with exit code 2 and a hint to pass `--agent`.
5. Inspect installed skills with `inspectInstalledSkills`; fully installed
   skills produce no command, partially installed skills target only missing
   agents. This makes reruns idempotent.
6. Generate commands with `generateInstallCommands`; source-resolution errors
   are fatal and reported before anything runs.
7. Without `--yes`, print the structured plan and exit 0.
8. With `--yes`, run the plan with `completeSelection` and return its status.

### JSON shape

```json
{
  "project": "/abs/project",
  "agents": ["codex"],
  "skills": [
    {"id": "antfu/skills/vite", "action": "install", "agents": ["codex"]},
    {"id": "acme/skills/alpha", "action": "installed", "agents": []}
  ],
  "commands": [
    "cd /abs/project && npx skills add antfu/skills --skill vite --agent codex --yes --json"
  ],
  "executed": false,
  "results": []
}
```

When `--yes` is present, `results` contains one entry per command
(`command`, `exitCode`, `ok`, and a bounded output tail). Sorting skills by ID
keeps CI diffs stable. Registry warnings always go to stderr; stdout stays a
single JSON document.

### Exit codes

| Code | Condition                                                       |
| ---- | --------------------------------------------------------------- |
| 0    | Plan printed, nothing to install, or every command succeeded    |
| 1    | A Skills CLI command failed, or the plan could not be generated |
| 2    | Usage/config error (invalid agent, no agents, invalid flags)    |
| 130  | Interrupted with SIGINT                                         |
| 143  | Terminated with SIGTERM                                         |

## Implementation steps

### 1. Extract the shared plan builder

Add `src/features/skills/plan.ts` (pure, no React, no spawning):

```ts
export interface InstallPlanInput {
  root: string;
  skills: SuggestedSkill[];
  agents: string[];
  explicitAgents: boolean;
}

export interface InstallPlan {
  agents: string[];
  skills: Array<{id: string; action: 'install' | 'installed'; agents: string[]}>;
  commands: InstallCommands;
}
```

- `resolveInstallAgents(root, explicit, configured)` implements the precedence
  above.
- `buildInstallPlan(...)` calls `inspectInstalledSkills` then
  `generateInstallCommands` and derives per-skill actions from the groups.
- Move the matching pipeline out of `src/features/skills/context.tsx` if it can
  be done without changing UI behavior; otherwise leave the context untouched
  for this PR and reuse only the new pure builder in the command. Avoid a
  large refactor inside a feature PR.

### 2. Add the headless command

New `src/commands/install.ts`:

```ts
export interface InstallCommandOptions extends ScanCommandOptions {
  agent?: string[];
  yes?: boolean;
  json?: boolean;
  skillsCli?: string;
}

export async function runInstall(args: string[], options: InstallCommandOptions): Promise<void>;
```

- Reject more than one positional path and conflicting flags (`--skills-only`,
  `--setup`, `--screen`).
- Resolve registries and detect the project through the existing functions.
- Build the plan, print text or JSON, and call `completeSelection` only when
  `yes` is true.
- Set `process.exitCode` for failures; do not call `process.exit`.
- Validate `--skills-cli` with a narrow allowlist
  (`/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+(@[^\s]+)?$/`) and reject leading `-`,
  newlines, and shell metacharacters. Pass it to `spawn` as an argument, never
  through a shell.

### 3. Make execution JSON-safe

Extend `runInstallCommand` with an optional output mode:

- Default (interactive/CI text): keep `stdio: 'inherit'`.
- `--json`: `stdio: ['ignore', 'pipe', 'pipe']`, collect a bounded tail
  (for example 64 KiB, dropping the middle), and include it in the result.
- `completeSelection` gains an optional reporter/runner so the command can
  aggregate results without changing the interactive call path.
- Keep signal forwarding and sequential stop-on-failure behavior unchanged.

`--skills-cli` changes the spawned args from `['skills', 'add', ...]` to
`[spec, 'add', ...]` while preserving the existing `npm_config_yes: 'true'`.
Default remains `skills`, so current behavior is unchanged.

### 4. Register the command and flags

- `src/commands/index.ts`: route `install`; narrow the `--yes` guard so it
  applies only to registry initialization. `--global`, `--project`, and `--ref`
  remain registry-only.
- `src/cli.tsx`: add `install` to the usage text, add `agent` (`isMultiple`),
  `skillsCli`, and `dryRun` to the meow flag schema and the allowed-flag set.
  Route `install` before the path/interactive fallback and reject `--screen`
  and `--setup` with it.
- Do not add an `install` boolean default that could make `--no-yes` ambiguous.

### 5. Tests

Add `tests/install-command.test.ts` and extend `tests/commands.test.ts`:

- No `--yes`: no process is spawned, text/JSON plan is printed, exit code 0.
- `--yes` with a fake `npx` on `PATH`: commands run sequentially; success,
  partial failure, nonzero exit, and signal forwarding are covered.
- `--json --yes`: stdout parses as exactly one JSON document; child output is
  captured, not interleaved.
- Agent precedence: explicit beats config, config beats discovery, no agents is
  exit 2 with a hint.
- Idempotency: a second run with a matching `skills-lock.json` and agent files
  generates no commands.
- Partially installed skills target only missing agents.
- Invalid `--agent`, duplicate agents, invalid `--skills-cli`, unknown paths,
  multiple paths, and incompatible flags exit 2 before any file changes.
- Registry warnings appear on stderr and never corrupt `--json` stdout.
- Reuse `generateInstallCommands` tests; do not duplicate their assertions.

### 6. CI flow

Add a safe smoke step to `.github/workflows/ci.yml` after the existing scan:

```yaml
- name: Plan recommended skills
  run: node dist/cli.js install . --agent codex --json > install-plan.json
```

This never spawns `npx` and verifies the command in the built package. Document
the executing form for consumers:

```yaml
- uses: actions/checkout@v7
- uses: actions/setup-node@v7
  with:
    node-version: '24'
    cache: npm
- run: npm ci && npm run build
- name: Install recommended skills
  run: node dist/cli.js install . --agent codex --yes --skills-cli skills@1.2.3
```

For reproducibility, pin `--skills-cli`; record the resulting
`skills-lock.json` as the CI artifact or commit it when agent skills are part of
the repository. A failed download or unknown source fails the step with exit 1.
Add `concurrency` or npm caching only if the workflow becomes slow; do not add
a retry loop, because a deterministic failure should surface.

### 7. Documentation

- README "CLI and automation": add both examples, the `--yes` distinction,
  exit codes, and the `--skills-cli` pin.
- `src/cli.tsx` help text: new usage line and flags.
- `docs/architecture.md`: add `src/commands/install.ts` and the shared plan
  builder to the command list.
- `docs/adding-a-feature.md` needs no change; the command is not a template
  feature.

## Security and edge cases

- Never interpolate a project path or skill source into a shell; all execution
  stays `spawn` with an argv array and `shell: false`.
- Keep project-local installation only; reject `--global` with `install`.
- Do not read or execute scanned project code. Registry loading keeps its
  existing Git-object and schema boundaries.
- Unverified existing skill folders remain "present (unverified)" rather than
  "installed"; the plan may target them, matching current UI behavior. State
  this explicitly in the docs.
- Shared agent directories (`.agents/skills` for Codex/Cursor/OpenCode/etc.)
  are already deduplicated by `SKILLS_CLI_AGENTS`; do not pass duplicate
  `--agent` values.
- CI environments without a TTY are already noninteractive; the command must
  never depend on `isInteractive()`.
- Keep `npm_config_yes: 'true'` so CI does not hang if `npx` needs to fetch the
  Skills CLI.

## Sequencing

1. **PR 1:** pure plan builder + unit tests, no CLI surface.
2. **PR 2:** `install` command, flag routing, JSON output, execution tests.
3. **PR 3:** README/CI examples and the safe CI smoke step.
4. **PR 4 (optional):** `--skills-cli` pinning and bounded output tail if not
   included in PR 2.

Each PR should pass `npm run typecheck`, `npm run lint -- --deny-warnings`,
`npm run test`, and `npm run build`.

## Decisions to confirm

1. **Execution gating:** default is plan-only; `--yes` installs. Alternative:
   `nosey install` installs and `--dry-run` previews. The plan recommends the
   former to preserve Nosey's "printing never installs" invariant.
2. **Command name:** `nosey install` vs. `nosey skills install`. The plan
   recommends `install` for CI ergonomics and reserves `skills` for a future
   namespace.
3. **Recommendation set:** all scanned suggestions. A future `--only <id>`
   filter is deliberately out of scope.
4. **Unpinned Skills CLI:** the default `skills` spec follows the current
   behavior. CI users should pass `--skills-cli`; the plan does not change the
   default to a pinned version.

## Acceptance criteria

- `nosey install . --agent codex` prints the same grouped commands the
  interactive Scan would print for the same selection, and spawns nothing.
- `nosey install . --agent codex --yes` installs only missing agents, stops on
  the first failure, and returns the command's exit status.
- `nosey install . --agent codex --json` emits one valid JSON document with
  stable ordering and stderr-only warnings.
- A second run is a no-op when the lock provenance and agent files match.
- The command is documented in help, README, and the architecture guide, and CI
  exercises the non-executing plan path.

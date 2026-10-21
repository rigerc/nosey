# Architecture

Nosey is an Ink 8/React 19 command-line application with a single, branded UI framework.
The scanner and registry services were ported from SkillSense; all interactive feature
screens use Nosey's existing components, hooks, router and theme.

## Program entry points

- `src/cli.tsx`: parses CLI options; dispatches headless scanning, registry commands,
  diagnostics, or the interactive Nosey application.
- `src/app.tsx`: composes the Nosey theme, configuration, router, input-capture,
  scan and registry providers. The shell owns global keys and tab navigation.
- `src/screens/index.ts`: screen registry and visible navigation order.
- `src/commands/index.ts`: noninteractive diagnostics.
- `src/screens/Home.tsx`: unified scan summary, filtered MultiSelect, review and skill evidence views.
- `src/screens/RegistryManager.tsx`: registry browse/edit workflow.
- `src/screens/RegistrySetup.tsx`: Nosey-native registry initialization wizard.
- `src/components/`, `src/hooks/`, `src/theme/`: the **only** generic Ink UI layer.

## Pure domain services

- `src/lib/scanner.ts`: bounded project traversal without symlink following or code execution.
- `src/lib/manifests.ts`: ecosystem dependency extraction.
- `src/lib/detect.ts`: evidence-based technology and skill matching; JSON report model.
- `src/data/skills-map.ts`: built-in mappings.
- `src/features/skills/groups.ts` and `filter.ts`: pure grouping/filtering helpers.
- `src/lib/registry/`: configuration, validation, read-only Git snapshot retrieval,
  merge logic, initialization and registry commands.
- `src/lib/report.ts`: plain text formatter, deliberately distinct from UI presentation.

Scan and skill selection share a single screen and selection state. `MultiSelect` accepts
`allItems` when displaying a filtered subset, so hidden selections are retained when toggling
or submitting visible items. Grouped skill rows have technology/combination headings and
spacing, while duplicate IDs across groups share one checked state and review entry.
The `d` shortcut inspects the currently focused `MultiSelect` row rather than opening
another searchable picker. Only `/` opens the filter input. The filter uses a controlled Nosey `TextField` and input capture
suspends the shell's shortcuts while editing.

React screens call pure services through feature/context boundaries. Services never
import Ink or React, and the CLI does not create a terminal UI when producing JSON
or plain-text output.

## Registry configuration

Nosey's normal appearance settings remain versioned and validated under
`src/config/`. Registry configuration uses a separate, versioned document:
project `.nosey.json` or global `nosey/registries.json`.

The registry resolver additionally discovers legacy SkillSense configuration files
for compatibility, without editing them. Git caches are written under the Nosey
namespace; validated SkillSense snapshots remain usable as a read-only fallback.

## Brand and interaction

The palette is sourced from `assets/nosey-brand-kit/` and exposed through
`src/theme/`. Global key handling is owned by the app shell and suspended while
Nosey text controls hold input capture.

## Safety

Project scanning never writes to the scanned project, follows symlinks, or executes
project code. Reads are limited by maximum depth, files, individual file size and cache.
Registry validation rejects unsafe paths and inconsistent manifests. Git snapshot
retrieval does not checkout remote content. Registry creation and publishing are separate,
explicitly requested write actions.

## Validation

```sh
npm run typecheck
npm test
npm run build
npm run check
```

Domain regression tests are migrated from SkillSense. New interactive behavior is
implemented with Nosey primitives, never by copying SkillSense's UI code.

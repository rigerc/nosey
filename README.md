# :^) Nosey

**Nosey sniffs your workspace and suggests AI agent skills.**

Nosey detects technologies by scanning dependency manifests, project files, and configuration
signals. It matches them to built-in skill mappings and optional local/Git skill registries.
Use its branded [Ink](https://github.com/vadimdemedes/ink) terminal interface to review and
select suggestions, or run it headlessly in a script.

The scan is **read-only**. Nosey never executes the target project's code or installs skills.

## Install and run

Requires Node.js **24+**.

```sh
npm install
npm run build
npm link
nosey .
```

During development:

```sh
npm run dev -- .
npm run dev -- ../another-project --json
```

## Detect and select skills

```sh
nosey .                          # Scan and open the terminal UI
nosey ../project --explain       # View evidence for matches
nosey . --json                   # Structured scan report
nosey . --skills-only            # One suggested skill ID per line
nosey . --no-interactive         # Plain-text report
nosey . --plain                  # Equivalent noninteractive report
nosey . --no-frontend-bonus
nosey . --depth 6 --max-files 5000
nosey . --registry ./team-skills
nosey . --registry https://github.com/org/skills.git
```

A noninteractive terminal automatically produces the plain-text report. Only an interactive
session launches the skill picker. The skill selection screen supports individual toggles,
search, group toggles, skill evidence, and confirmation. Confirmed selections print skill IDs
to stdout after the Ink interface exits. No skills are installed.

### Nosey interface

Navigation uses **Tab** or **1–5** across the Scan, Skills, Registries, Settings and Help
screens. Use **t** to cycle themes and **q** to quit. Within the Skills screen,
**Space** toggles an item, **Enter** reviews the selection, **f** finds a skill,
**g** toggles by technology group, and **d** opens its details. The UI uses Nosey's
components, hooks, navigation, and theme; none of SkillSense's TUI code is included.

## Skill registries

```sh
nosey registry                      # Interactive registry manager
nosey registry init ./team-skills --registry-id acme/team-skills --yes --no-git
nosey registry add ./team-skills
nosey registry add https://github.com/org/skills.git --ref v1
nosey registry list --json
nosey registry show ./team-skills
nosey registry validate ./team-skills --json
nosey registry build ./team-skills
nosey registry remove ./team-skills
```

Use `--global` with `list`, `add`, or `remove` to manage global registry references.
Registry initialization optionally initializes Git and creates a remote with the GitHub CLI
when explicitly selected. The registry template is included in the published package.
Local and remote registries are validated before their mappings are merged.

The registry UI uses Nosey's own `Select`, `Confirm`, `TextField`, `Stepper`,
`Panel`, and keyboard hooks.

### Configuration and migration

- Project registry configuration: `<project>/.nosey.json`
- Global registry configuration: `$XDG_CONFIG_HOME/nosey/registries.json` (or
  `~/.config/nosey/registries.json`; on Windows, under `%APPDATA%`)
- App appearance/settings: `$XDG_CONFIG_HOME/nosey/config.json` (or the equivalent home directory)
- Remote registry cache: the platform user cache directory under `nosey/registries`

Nosey **also reads** existing SkillSense registry settings from `.skillsense.json`
and its global config path, and can reuse valid cached Git snapshots from SkillSense.
Legacy files are never automatically changed or deleted; new registry edits write only
Nosey's config files.

A registry reference can be a local directory or an HTTPS/SSH Git repository, optionally
pinned to a revision. Git snapshots are read through Git objects, without checking out the
repository or executing any remote code.

## Diagnostics, themes, and development

```sh
nosey doctor --json
nosey --setup
nosey --theme nosey
nosey --theme dark
nosey --screen gallery      # Development component gallery

npm run typecheck
npm test
npm run build
npm run check
```

Nosey retains the existing brand kit in `assets/nosey-brand-kit` and the branded
appearance themes. Domain logic is kept separate from React and Ink; scans and registry
operations are shared by the CLI and the UI.

For architecture and implementation conventions, see
[docs/architecture.md](docs/architecture.md) and
[docs/adding-a-feature.md](docs/adding-a-feature.md).

SkillSense's detection and registry domain modules were ported from
[rigerc/skillsense](https://github.com/rigerc/skillsense). See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for provenance and license.

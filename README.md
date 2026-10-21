<div align="center">
  <h1>
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/nosey-brand-kit/svg/logo/nosey-logo-for-dark.svg">
      <img src="assets/nosey-brand-kit/svg/logo/nosey-logo-for-light.svg" alt="Nosey" width="360">
    </picture>
  </h1>

  <p><strong>Find agent skills that match the technologies in your workspace.</strong></p>
  <p>Nosey scans project files, groups matching skill suggestions, and lets you review them in an interactive terminal. Scanning and selecting never install skills.</p>

  <p>
    <img src="https://img.shields.io/badge/Node.js-24%2B-417e38?style=flat-square" alt="Node.js 24 or newer">
    <img src="https://img.shields.io/badge/Ink-8-555?style=flat-square" alt="Ink 8">
    <img src="https://img.shields.io/badge/React-19-087ea4?style=flat-square" alt="React 19">
  </p>

  <p>
    <a href="#quick-start">Quick start</a> ·
    <a href="#terminal-workflow">Terminal workflow</a> ·
    <a href="#screenshots">Screenshots</a> ·
    <a href="#cli-and-automation">CLI and automation</a> ·
    <a href="#development">Development</a>
  </p>
</div>

<div align="center">
  <a href="assets/recordings/home-nosey-100-video.mp4">
    <img src="assets/recordings/home-nosey-100-video.gif" alt="Nosey terminal walkthrough: slowly browse skill suggestions, filter React skills, then open Registries" width="920">
  </a>
  <p><sub>Slow Scan + Registries demo · <a href="assets/recordings/home-nosey-100-video.mp4">Watch MP4</a> · <a href="assets/recordings/home-nosey-100-video.png">View still frame</a></sub></p>
</div>

## Quick start

Requires **Node.js 24+**. Run Nosey from this repository; a published package installation is not assumed.

~~~bash
git clone https://github.com/rigerc/nosey.git
cd nosey
npm ci
npm run dev -- ../your-project
~~~

In an interactive terminal, Nosey opens **Scan** for the supplied directory. Omit the path to scan the current directory.

To get a text report instead of opening the interface:

~~~bash
npm run dev -- scan ../your-project --explain
~~~

Nosey reads manifests and configuration signals without executing the scanned project's code. It reports detected technologies, matching agent skills, and supporting evidence. It does not install recommended skills.

## Terminal workflow

Navigate four tabs in one terminal session:

| Tab | What you can do |
| --- | --- |
| **Scan** | See detected technologies and grouped suggestions, filter results, inspect details, and select skill IDs. |
| **Registries** | Manage local and Git-based skill registry references, inspect their contents, and initialize a registry. |
| **Settings** | Preview themes and adjust appearance or configuration with save/discard controls. |
| **Help** | Look up shortcuts and available actions. |

### Essential keys

| Keys | Action |
| --- | --- |
| `Tab` / `Shift+Tab` or `1`–`4` | Switch tabs |
| `Ctrl+K` | Open the command menu |
| `↑` / `↓` or `j` / `k` | Move through Scan suggestions |
| `/` or `f` | Filter Scan suggestions |
| `c` | Clear the Scan filter |
| `Space` | Select or deselect a skill |
| `d` | View skill details in Scan |
| `Enter` | Review selected skill IDs |
| `t` | Preview a theme |
| `?` | Open Help |
| `q` | Quit without confirming a selection |

Selections stay intact when you filter results or switch tabs. Confirming the selection prints distinct skill IDs after the terminal UI exits. Confirmation defaults to **No**.

### Optional Skills CLI commands

Open **Settings → Skills CLI** to enable installation command generation and select one or more default agents. This feature is **off by default**. After selecting skills, Scan previews copy-pasteable project-local commands instead of installing anything. Confirming prints the commands only after the terminal UI exits.

~~~bash
cd /path/to/your-project && npx skills add vercel-labs/agent-skills --skill react-best-practices --agent claude-code --agent codex --yes --json
~~~

The generated commands always use the scanned project directory, include `--yes --json`, and never use `--global`. **Running a generated command yourself installs skills; printing it in Nosey does not.** Multiple repositories or differing agent requirements yield multiple commands.

Scan also checks project-local skill directories and `skills-lock.json` without launching the Skills CLI. Skills with matching lock provenance and local files are marked **Installed** (all inspected agents) or **Partial** (some agents). Matching file names without verified provenance are marked **Present (unverified)**; Nosey will not silently treat them as installed. Global installations do not count. Fully installed targets are omitted from generated commands; partially installed skills target only missing agents.

## Screenshots

These tracked captures use the Nosey terminal theme. Scan shows a demo React, TypeScript, Vite, and Vitest workspace. The Registries image shows the initial state before references are added.

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/home-nosey-96.png" alt="Nosey Scan with detected technologies and grouped agent skill suggestions">
      <p><sub><strong>Scan</strong> · Technology groups and selectable skill suggestions</sub></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/registry-nosey-96.png" alt="Nosey Registries screen with project scope and registry references">
      <p><sub><strong>Registries</strong> · Project scope and reference management</sub></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/settings-nosey-96.png" alt="Nosey Settings screen with appearance preferences">
      <p><sub><strong>Settings</strong> · Appearance preferences and save/discard actions</sub></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/help-nosey-96.png" alt="Nosey Help screen with navigation and action shortcuts">
      <p><sub><strong>Help</strong> · Keyboard shortcuts in the app</sub></p>
    </td>
  </tr>
</table>

## CLI and automation

The same detection engine works without the interactive interface, including in pipes and CI.

~~~bash
# Human-readable report with detection evidence
npm run dev -- scan ../your-project --explain

# Structured report
npm run dev -- scan ../your-project --json

# Suggested skill IDs only
npm run dev -- scan ../your-project --skills-only

# Scan with a custom bound
npm run dev -- scan ../your-project --depth 6 --max-files 5000

# Diagnostics
npm run dev -- doctor --json
~~~

The explicit `scan` subcommand is always headless. A project path alone opens the UI in a TTY; `--json`, `--skills-only`, `--plain`, `--no-interactive`, and non-TTY environments use noninteractive output.

Use `npm run dev -- --help` for the complete command and option reference.

### Skill registries

Add local folders or Git repositories as sources of recommendations:

~~~bash
npm run dev -- registry add ./team-skills
npm run dev -- registry add https://github.com/org/skills.git --ref v1
npm run dev -- registry list --json
npm run dev -- registry validate ./team-skills --json
~~~

To create a registry in a **new** directory:

~~~bash
npm run dev -- registry init ./team-skills --registry-id acme/team-skills --yes --no-git
~~~

Registry changes are separate from scanning and skill selection. The interactive manager shows write targets and requests confirmation. Git registries are read through Git objects without executing remote code. See `npm run dev -- registry --help` for available subcommands, or `npm run dev -- --help` for the main CLI help.

## Appearance

Five themes are available: `nosey`, `dark`, `light`, `contrast`, and `mono`. The terminal can also use ASCII symbols and borders.

~~~bash
npm run dev -- ../your-project --theme nosey
npm run dev -- ../your-project --theme contrast --ascii
npm run dev -- --setup
~~~

Settings are saved only when you choose to save them. Theme previews do not change saved preferences.

**Compact mode** is an optional toggle in Settings (off by default). When enabled, launching the interactive Scan directly with `nosey [path]` opens a minimal interface without application tabs or the command menu. You can still select skills with Space, review them with Enter, rescan with `r`, or quit with `q`. The compact Scan supports the same opt-in Skills CLI commands and installed status labels as the full Scan. Launches that start on another screen retain the standard interface. The explicit `nosey scan [path]` command, `--plain`, and noninteractive reports remain headless and unchanged. Restart Nosey after saving this setting.

## Development

Build the CLI, then run it without the development runner:

~~~bash
npm run typecheck
npm test
npm run build
npm run start -- ../your-project
~~~

You can also run `npm link` after building to use the `nosey` executable locally.

### Capture the terminal UI

The repository includes a [VHS-based recording workflow](docs/recording.md) and an editable [interaction tape](scripts/tapes/workflow.tape).

~~~bash
# Static screenshots in the default capture matrix
npm run screenshot

# Interactive journey exported as GIF and MP4
npm run record

# Use the tracked Nosey theme and 96-column layout
npm run screenshot -- --theme nosey --columns 96 --output-dir docs/screenshots
~~~

Capture tooling requires VHS, ttyd, FFmpeg, and Chromium. The demo GIF, MP4, and still frame above are checked into [`assets/recordings/`](assets/recordings/). New captures normally go to the ignored `screenshots/` directory; they are not automatically published or committed. The [capture workflow](.github/workflows/screenshots.yml) uploads media as CI artifacts.

For internals and extensions, see [Architecture](docs/architecture.md), [UI framework](docs/ui-framework.md), and [Add a feature](docs/adding-a-feature.md). The catalog and skill-mapping utilities are documented in [scripts/README.md](scripts/README.md).

## Notices

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the imported SkillSense engine's provenance and third-party license information.

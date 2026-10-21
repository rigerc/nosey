# Terminal screenshots and recordings

## Install once

Use Node.js 24+ and install the project's dependencies first. Capture requires
[VHS 0.12.1 or newer](https://github.com/charmbracelet/vhs#installation),
[ttyd](https://github.com/tsl0922/ttyd#installation), FFmpeg, Chromium, and the
DejaVu Sans Mono font. VHS supplies the browser automation; Playwright is not used.

On macOS with Homebrew:

```sh
brew install vhs ttyd ffmpeg
```

On Debian/Ubuntu, install `ttyd`, `ffmpeg`, `fonts-dejavu-core` and a Chromium
browser from your distribution, then install VHS from its release packages or
`go install github.com/charmbracelet/vhs@v0.12.1`. Make sure all three commands
are on PATH. VHS finds a supported browser on the system or downloads Chromium on its first
run. A sandboxed Linux container may also need
`VHS_NO_SANDBOX=1`. See the [VHS documentation](https://github.com/charmbracelet/vhs).

## Capture images

Run the package.json `screenshot` script with your chosen package manager.
The examples below use npm; pnpm/bun use `run`, while Yarn also accepts `yarn screenshot`.

```sh
npm run screenshot
npm run screenshot -- --screen home --theme dark --columns 100
npm run screenshot -- --screen help --theme mono --ascii --rows 60
npm run screenshot -- --output-dir ./screenshots/review
```

Screens, themes and columns can be repeated to select a matrix. Defaults are the four visible tabs (Scan, Registries, Settings, Help), all five
themes, and 80/120 columns. Hidden routes and the `skills` alias can be requested
with `--screen`. App terminal height defaults to 40 rows. Static PNG viewports expand to fit the
rendered frame; videos use exactly the requested dimensions (60 rows by default).

Images use Ink's static `renderToString()` output, with a seeded React/TypeScript/Vite/Vitest demo scan, isolated configuration
and stable display paths. VHS displays that ANSI output in its terminal and takes a PNG.
There is no HTML conversion. Initial state is stable; font/OS/browser versions can
still change pixels, so use CI for comparable review artifacts.

## Record an interactive journey

```sh
npm run record
npm run record -- --screen home --theme contrast --columns 120 --ascii
npm run record -- --format webm --format mp4
npm run record -- --tape scripts/tapes/workflow.tape
```

`record` invokes the screenshot runner with `--video`. Defaults are Home (Scan), Nosey,
100 columns and 60 rows and GIF + MP4, plus an initial PNG. Use repeatable `--format` for GIF,
MP4 or WebM. Names include screen, theme, columns, optional `-ascii`, and `-video`.
`--output-dir` selects the destination. For `docs/screenshots`, the runner keeps
replay tapes and demo fixtures in the ignored `screenshots/tapes/` directory.

The video runs the source CLI in a real PTY, clears CI/NO_COLOR/CLI_ASCII/NOSEY_THEME overrides,
passes explicit theme flags, a demo project and isolated temporary configuration, and leaves the
user's settings untouched. Normal capture removes that temporary config on exit.
Video captures include live animation and state changes; they are not pixel-stable
snapshots. The runner stops the app after the interaction tape finishes.

## Adapt the workflow

Start with `scripts/tapes/workflow.tape`. It waits for Scan to finish, filters suggestions for React, clears the filter,
then visits Registries, Settings and Help using the command menu. Replace its VHS key presses, `Type`, `Wait` and `Sleep` commands with your journey.
Prefer `Wait+Screen@10s /expected text/` for asynchronous transitions, then a short
`Sleep` for a readable pause. Add `Screenshot "screenshots/checkpoint.png"` for
checkpoints. Paths in interactions resolve from the project root. Keep launch,
Output and Set commands in the runner; interaction snippets run after launch.

`--project ../project` scans a real workspace in both capture modes. Static previews
retain the existing empty registry state; video runs the actual CLI, including any
project-scoped registry references. The default journey stays read-only. Custom
tapes operate the real app, so review any write/confirmation steps before running
against a real project. Without `--project`, the runner keeps a demo workspace
beside the tapes so dry-run recordings remain replayable. Appearance and global
registry configuration use an isolated temporary XDG config directory.

```sh
# Write tapes/fixtures without VHS. Useful for review and debugging.
npm run record -- --dry-run --tape scripts/tapes/workflow.tape
# Replay a generated tape from the project root (requires capture tools).
vhs screenshots/tapes/home-nosey-100-video.tape
# Record your own key sequence, then edit it into an interaction-only snippet.
vhs record > /tmp/my-session.tape
```

Generated tapes include absolute local output/fixture paths and the original XDG config path and inline the selected
interaction snippet. They are replayable in the same checkout; regenerate after
moving or copying the checkout. A replay uses a fresh config at the tape's recorded
temporary path; remove it yourself if the scenario writes settings during replay.
Dry-run does not verify VHS dependencies or produce images/videos. For a portable
workflow, commit the source interaction tape and regenerate on each machine.

## Continuous integration

`.github/workflows/screenshots.yml` installs pinned VHS 0.12.1, ttyd, FFmpeg and
fonts through the official VHS action, runs Nosey's typecheck, complete test script
and build, then captures all 40 default PNGs and the interactive demo. Manual inputs
select the video screen/theme/width/height/tape. Uploads retain images, videos and generated
tapes/demo fixtures for 14 days. Media is not published or committed automatically.
The existing `.github/workflows/ci.yml` continues to run its CLI smoke tests.

Adapt the source tape and package scripts for another project. With no `path`,
`charmbracelet/vhs-action@v2` installs capture tools without running a tape. Keep
its VHS version and fonts aligned with local development. See the
[VHS action documentation](https://github.com/charmbracelet/vhs-action).

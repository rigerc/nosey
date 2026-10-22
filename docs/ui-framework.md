# UI framework guide

This guide explains how to build terminal interfaces with the local **Ink 8 / React 19** UI framework. It applies to both this starter and generated applications. The framework lives in `src/`; it is **not** a separately installed package.

For feature walkthroughs, see `docs/adding-a-feature.md` and
`docs/architecture.md`. Reusable components and hooks are maintained in `src/`.

## Start here

1. Run `npm run dev` in an interactive terminal; use `--plain` for one-shot output in pipes and CI.
2. Read `src/app.tsx`, `src/screens/Home.tsx` and `src/screens/index.ts` to see the application shell, screen composition and registration.
3. Discover reusable exports in `src/components/index.ts` and `src/hooks/index.ts`.
4. Add domain logic outside the React/Ink layer so noninteractive commands can reuse it.

## Architecture and ownership

| Location                   | Responsibility                                                      |
| -------------------------- | ------------------------------------------------------------------- |
| `src/cli.tsx`              | Parse flags and select interactive or plain rendering               |
| `src/app.tsx`              | Install providers, shared shell, navigation and global shortcuts    |
| `src/screens/index.ts`     | Register screen IDs, labels, tab order and contextual hints         |
| `src/screens/*.tsx`        | Compose reusable UI into screens                                    |
| `src/components/`          | Themed layout, presentation and input controls                      |
| `src/hooks/`               | Router, keys, input capture, async work, toast and terminal helpers |
| `src/theme/`               | Semantic colors, symbols and ASCII compatibility                    |
| `src/features/` (optional) | Domain models and operations independent of Ink                     |

`AppProviders` installs configuration, theme, input capture, keymap, toast, router and error-boundary providers. The regular `App` already renders `AppShell`, which owns the application header, tabs, command menu, toast area and status footer. **Do not nest a second shell, header, tab bar or footer in your screen.** Instead, use `ScreenLayout` for title, description, actions and consistent content padding. Use `InlineLayout` for an independent compact wizard.

## Create and register a screen

Add `src/screens/Jobs.tsx`:

```tsx
import {Text} from 'ink';
import {useState} from 'react';
import {Panel, ScreenLayout, Stack, StatusMessage} from '../components';
import {useKeymap, useToast} from '../hooks';

export function JobsScreen() {
  const [refreshes, setRefreshes] = useState(0);
  const toast = useToast();

  useKeymap(
    [
      {
        key: 'r',
        run: () => {
          setRefreshes((count) => count + 1);
          toast.push('View refreshed', 'success');
        },
      },
    ],
    {scope: 'screen'},
  );

  return (
    <ScreenLayout title="Jobs" description="Recent activity">
      <Stack gap={1}>
        <Panel title="Overview">
          <Text>Refreshes: {refreshes}</Text>
        </Panel>
        <StatusMessage tone="info">Press r to refresh.</StatusMessage>
      </Stack>
    </ScreenLayout>
  );
}
```

Import `JobsScreen` in `src/screens/index.ts`, then add to the `screens` array:

```ts
{id: 'jobs', label: 'Jobs', Component: JobsScreen, hints: [
  {key: 'r', label: 'refresh'},
]},
```

A visible screen gets a tab, a numeric shortcut and a `--screen jobs` flag. `showInNav: false` makes a screen addressable through `--screen` without putting it in the tab bar. The `hints` property describes contextual actions in the footer but **does not register key handlers**; use `useKeymap` for those. Global keys are defined in `src/keys.ts`, not copied into each screen.

## Which components to use

| Goal               | Components                                                                              |
| ------------------ | --------------------------------------------------------------------------------------- |
| Layout and spacing | `Stack`, `Row`, Ink `Box`                                                               |
| Screen structure   | `ScreenLayout`, `ScreenHeader`                                                          |
| Grouping           | `Panel`, `Card`, `Divider`                                                              |
| Text and key hints | `Heading`, `Label`, `Muted`, `Code`, `Kbd`, `Icon`                                      |
| Status             | `Badge`, `StatusMessage`, `Alert`, `Spinner`, `ProgressBar`, `EmptyState`, `ErrorPanel` |
| Data               | `KeyValue`, `Table`, `TaskList`, `PaginatedList`                                        |
| Result states      | `ScreenState`                                                                           |
| Input              | `Select`, `MultiSelect`, `SearchSelect`, `TextField`, `Toggle`, `Confirm`               |
| Wizards            | `Stepper`, `Step`, `StepperProgress`, `StepperNavigation`, `InlineLayout`               |

Import components through `../components` and hooks through `../hooks` from a screen. Review the local TypeScript props to select the right abstraction. Give selection options unique `value` fields and paginated items stable keys. Use `isActive={false}` to disable a control while another owns keyboard input. Prefer shared panels, controls and indicators over custom ad-hoc renderers.

## Keyboard routing and focus

`AppProviders` installs a `KeymapProvider` and `InputCaptureProvider`. The provider dispatches **one** matching shortcut per keypress, with priority **control > screen > global**. Use `{scope: 'screen'}` for screen shortcuts, `{scope: 'global'}` for shell shortcuts; controls default to `control`. Avoid overlapping shortcuts between simultaneously active controls.

Free-form input must own the keyboard. `SearchSelect` automatically captures input while active, which pauses regular shortcuts (including Tab, q, t and numeric screen keys). Close or deactivate the search on selection and cancellation:

```tsx
import {Text} from 'ink';
import {useState} from 'react';
import {SearchSelect} from '../components';
import {useKeymap} from '../hooks';

export function PackagePicker() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('none');

  useKeymap([{key: '/', run: () => setOpen(true)}], {scope: 'screen', isActive: !open});

  return open ? (
    <SearchSelect
      items={[
        {value: 'ink', label: 'Ink'},
        {value: 'react', label: 'React'},
      ]}
      onSelect={(value) => {
        setSelected(value);
        setOpen(false);
      }}
      onCancel={() => setOpen(false)}
    />
  ) : (
    <Text>Selected: {selected} (press / to choose)</Text>
  );
}
```

For another text editor, handle characters with `useKeyboardInput(handler, {isActive: isEditing})` and call `useInputCapture(isEditing)` while it owns input. Both hooks release ownership when editing stops. The shared dispatcher delivers one event per React commit so characters typed immediately after opening an editor reach its new owner. Avoid a separate Ink `useInput` listener inside the shell; it bypasses this ordering. Only nested controls explicitly owned by a capturing editor should use `allowWhenCaptured` with `Select` or `MultiSelect`; don't bypass focus management generally. Keep **one text-input control active** at a time. When a child field owns Enter/Escape in a `Stepper`, set `keyboardNav={false}` and navigate using `useStepper()` or the step render callback.

## Async states and notifications

`useAsync(fn)` returns `run` and a state with `status` (`idle`, `loading`, `success`, `error`); it ignores stale results after unmount or superseding runs. Start operations from an event or effect, **not during render**. `ScreenState` renders loading, empty, error and success views, but the caller determines whether a successful result is empty.

```tsx
// Inside a screen with useEffect, Text, useAsync, ScreenState imported.
// loadJobs is a domain operation returning records with id and name.
const jobs = useAsync(loadJobs);
useEffect(() => {
  void jobs.run();
}, [jobs.run]);

const status =
  jobs.status === 'idle'
    ? 'loading'
    : jobs.status === 'success' && jobs.data.length === 0
      ? 'empty'
      : jobs.status;

return (
  <ScreenState
    status={status}
    error={jobs.status === 'error' ? jobs.error : undefined}
    title={status === 'empty' ? 'No jobs yet' : undefined}
  >
    {jobs.status === 'success' && jobs.data.map((job) => <Text key={job.id}>{job.name}</Text>)}
  </ScreenState>
);
```

Use `useToast().push(message, tone)` for transient messages, and `StatusMessage` or `Alert` for persistent feedback. Headless subcommands belong in `src/commands/` and must not import Ink. `--plain`, pipes and CI render **one frame without input**: do not rely on a keypress or delayed async update for essential plain output.

## Theme, accessibility and width

Use semantic theme tokens instead of hardcoded colors: `primary`, `accent`, `success`, `warn`, `danger`, `info` and `muted`. For custom rendering use `useTheme()` or `useTone(tone)`. Status must not be communicated by color alone. Respect `NO_COLOR`, `mono` and `--ascii`, including glyph and border fallbacks.

`useTerminalSize()` exposes the current column count. Prefer stacking panels at narrow widths and using Ink flex layouts over rigid dimensions. Wrap or truncate unbounded text. Test around 40, 80 and 120 columns.

Semantic palettes live in `src/theme/palettes.json` and the project fallback in `src/theme/defaults.json`. The `theme:list`, `theme:token` and `theme:default` scripts inspect and edit project source. A runtime theme can be overridden by CLI flag, environment or saved config.

## Nosey application contracts

The visible tabs are Scan, Registries, Settings, and Help. `skills` is an alias for
Scan, with a hidden `registry-setup` route. `Header` uses `BrandMark`
and the `nosey` name. Dark terminals resolve `auto` to the Nosey palette; light
terminals use the burnt accent. `NO_COLOR` locks runtime cycling to mono.

Visited screens stay mounted under `InputActivityProvider`. Every screen handler
must use `useKeymap`; raw text controls must use `useKeyboardInput`, which also respects `useInputActivity()`.
`useInputCapture()` automatically releases capture for inactive screens. This
preserves drafts and cursor state while making hidden screens inert. The command
menu deactivates all screen providers until it closes.

`Confirm` captures input exclusively and dispatches through the shared keymap;
No is the default, Escape cancels, and callers deactivate it during writes.
An explicitly owned `PaginatedList allowWhenCaptured` can page a confirmation's
review content without enabling unrelated handlers. `Stepper` uses screen scope,
and its existing lock prevents duplicate transitions or submissions. When a choice
adds or removes conditional steps, commit that choice before calling `goNext()`.

Both Scan views seed each new report with skills whose installation label is `Installed`,
using configured default agents or the report's inspected agents. Partial and unverified
installations stay unchecked. Users can deselect installed skills; filtering and tab
changes preserve their choices, while rescanning restores the installed defaults.

For filtered multi-selection, pass `allItems` as the canonical option set and
`items` as the visible subset. Changes retain selected IDs outside the filter.
`cursor` / `onCursorChange` preserve list position, and `submitWhenEmpty` enables
explicit zero-selection review. `Select` and `MultiSelect` window long lists.
`TextField` captures shortcuts while editing and supports Enter, Escape, and Ctrl+U.

`MultiSelectItem.group` adds non-selectable technology headings with spacing above
their options. Repeated values share a canonical selection; pass a unique `allItems`
list to preserve report order and filtered-out values. `maxVisibleRows` bounds the
physical menu height, including headings, and repeats the current heading when
the viewport starts inside a group. Arrows skip headings; Home/End and PageUp/PageDown
navigate options. Controls retain the latest input between React renders so rapid
navigation, toggles, typing, and confirmation do not read stale values.

Use `useScreenHints(route, hints)` for mode-specific footer actions. Command-menu
actions travel through the UI feature context and run on the selected active screen.
Reusable input controls publish their own actions with `useFooterHints` under
`FooterHintsProvider`. Hidden controls release their hints along with input capture.
`StatusBar` shows these actions before its separate `globalHints` row; captured
editors omit global hints. Keep shortcut instructions in the footer rather than
repeating them inside panels. Ctrl+K toggles the command menu, and Escape closes it.
Scanning is shared through `ScanProvider`; the `report` seed and `static` app option
support deterministic previews without launching asynchronous work. Production
scans use `useAsync` so superseded results cannot overwrite a newer scan.

Scan keeps a three-row project summary above the skill picker in one column at every
terminal width. Ordinary browsing uses `Panel variant="plain" compact`; reviews and
details use a quiet outline. `MultiSelect compact` removes blank rows below headings
and around list metadata. `showSelectedCount={false}` omits the duplicate selected
total when the screen already displays it. Selected markers use the success tone;
focused labels use a primary pointer and bold text. Hints stay muted independently
of focus and selection. The physical row budget includes headings and inter-group
spacing; the focused option stays visible. Below 60 columns, skill names lead each
option and the full ID remains in its searchable hint and detail view. Long project
paths truncate in the shared screen header; full paths remain available in headless
reports.

### Component presentation

The visual roles follow [Ink UI's component patterns](https://github.com/vadimdemedes/ink-ui),
using the local controls and keyboard dispatcher. `src/theme/components.ts` defines
typed label, indicator, selection and hint styles from the active semantic palette.
Internal `OptionRow` and `InputLine` primitives in `src/components/control-parts.tsx`
share presentation without registering input handlers.

- Options reserve a pointer column. Checkbox markers use `◼` / `◻` in Unicode
  and `[x]` / `[ ]` in ASCII output, independent of focus or color. Single-select controls reserve a check
  column when `current` is provided. Inactive controls omit active pointers.
- Input labels and entered values use readable text; placeholders and hints use
  muted text. Active editors show an inverse underscore cursor. Long values
  truncate from the beginning to keep their editing end visible. Inactive editors
  omit the cursor. Input capture, submission and cancellation stay with the owner.
- `Panel` defaults to `outline`; use `variant="plain"` for ordinary sections.
  Outlines use the base border and muted border color even when focused. `focused`
  emphasizes the title; an explicit `tone` overrides that title color. Plain panels
  add no horizontal padding, so their contents align with `ScreenLayout`.
- `StatusMessage`, `Alert` and spinner labels wrap instead of clipping diagnostics.
  Icons retain their own column; alert bodies indent under the title text.
  Empty states align with the surrounding content. Progress bars keep the numeric
  percentage visible while shrinking to the containing width; values remain 0–1.
- Tabs and wizard steps keep the same primary/bold current state and semantic
  success state. Contextual key instructions belong in the shared footer.

Settings previews only its active section and resolves nested configuration paths
with `getAtPath`. Editing, save/discard, draft retention, and override sources use
the existing configuration controls. Help uses screen-scoped up/down or j/k to
browse topics, with a sidebar at 80 columns and wrapping topic labels below that.
Compact Scan uses the same dense selection rows and narrow skill-name labels, with
an unbordered list, one selection total, a two-row brand/project header, and essential
controls only. Its row budget reserves the summary and footer at 24 rows. Full IDs
remain unchanged in review and confirmed output. Compact mode has no tabs or command
menu; partial-scan warnings remain explicit and may extend into scrollback. See the
[compact Scan capture](../assets/screenshots/compact-nosey-96.png).

Registry context and write targets sit above the reference list, separate from its
active input control. The shell keeps header/navigation and footer hint rows adjacent.

Test primary screens at 40, 60, 80, 96, and 120 columns, including 24-row terminals,
and verify mono/ASCII output as well as the Nosey and light palettes. Longer warning
or detail content can extend into terminal scrollback; do not clip diagnostics to
force the frame to fit.

## Testing and quality

- Run the `typecheck` and `build` scripts, plus `test` when the generated project's `tests` feature is installed. Check `package.json` before assuming optional scripts are available.
- Where installed, use `ink-testing-library` for keyboard/focus assertions, and Ink `renderToString()` for deterministic width-specific frames.
- Exercise TTY interactions, `--plain` output, loading/error/empty states, long text, narrow widths, mono/ASCII and multiple themes.
- Never call `console.log` while Ink is rendering; use the logger for diagnostics and keep headless output separate.
- When changing a framework convention, update this guide, relevant scaffold documentation, and regression tests.

For the next implementation step, consult `docs/adding-a-feature.md` in a
generated app or `templates/app/docs/adding-a-feature.md` in the starter.

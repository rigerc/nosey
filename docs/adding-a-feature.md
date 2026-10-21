# Add your first feature

The skeleton has no predefined business domain. Add only the pieces needed by
your application. Read [the UI framework guide](ui-framework.md) before adding interactive
controls; it explains provider ownership, component selection, input capture,
semantic styling and async states.

1. Create `src/features/example/` for pure models and operations if needed.
2. Add `src/screens/Example.tsx` and register the screen in `src/screens/index.ts`.
3. If required, add a noninteractive subcommand to `src/commands/index.ts`.
4. Add typed configuration in `src/config/schema.ts` only when necessary.
5. When the `tests` feature is installed, write tests under `tests/`. Run the
   project's typecheck and build scripts, plus its test script if present.

## Minimal screen

```tsx
// src/screens/Example.tsx
import {Text} from 'ink';
import {Panel, ScreenLayout} from '../components';

export function ExampleScreen() {
  return (
    <ScreenLayout title="Example" description="An example feature">
      <Panel title="Overview">
        <Text>Your content goes here.</Text>
      </Panel>
    </ScreenLayout>
  );
}
```

Import and register it in `src/screens/index.ts`:

```ts
import {ExampleScreen} from './Example';

// Add to the exported screens array:
{id: 'example', label: 'Example', Component: ExampleScreen},
```

The screen now has a tab, numeric shortcut, and `--screen example`. The
footer and Help derive the numeric shortcut range from the screen registry;
no edits to `src/keys.ts` are needed. Add optional `hints` to the `ScreenDef`
when a screen has local actions, and use `ScreenState` for async states.

## Minimal headless command

In `runCommand()` of `src/commands/index.ts`:

```ts
if (name === 'example') {
  if (args.length) throw new AppError('example takes no arguments', {exitCode: 2});
  console.log('Example command');
  return true;
}
```

A real command should call a pure feature operation. Import that same operation
from an Ink screen when interactive access is useful. Do not couple business
logic to React hooks or terminal rendering.

## UI conventions for features

- The shared `AppShell` already supplies header, tabs, toasts, command palette and footer. Keep a new screen inside `ScreenLayout`.
- Use `useKeymap([{key: 'r', run: refresh}], {scope: 'screen'})` for screen actions. Add corresponding footer `hints` to the screen registry. Don't wire a second global keyboard handler.
- Interactive `Select`, `MultiSelect`, `Toggle` and `PaginatedList` controls accept `isActive={false}` when another control owns input. `SearchSelect` captures text input while active; deactivate or unmount it on selection/cancel.
- Use `useAsync` and `ScreenState` for loading, empty, error and success results; call your domain operation from events/effects rather than render.
- Use `useTheme` / `useTone` for colors and `useTerminalSize` for responsive layouts. Test `--plain`, mono/ASCII and narrow widths.

See [the UI framework guide](ui-framework.md) for runnable screen, focus and async examples.

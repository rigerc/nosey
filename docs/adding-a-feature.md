# Add your first feature

The skeleton has no predefined business domain. Add only the pieces needed by
your application.

1. Create `src/features/example/` for pure models and operations if needed.
2. Add `src/screens/Example.tsx` and register the screen in `src/screens/index.ts`.
3. If required, add a noninteractive subcommand to `src/commands/index.ts`.
4. Add typed configuration in `src/config/schema.ts` only when necessary.
5. Write tests under `tests/` and run the typecheck, tests, and build.

## Minimal screen

```tsx
// src/screens/Example.tsx
import {Text} from 'ink';
import {Panel} from '../components';

export function ExampleScreen() {
  return (
    <Panel title="Example">
      <Text>Your content goes here.</Text>
    </Panel>
  );
}
```

Import and register it in `src/screens/index.ts`:

```ts
import {ExampleScreen} from './Example';

// Add to the exported screens array:
{id: 'example', label: 'Example', Component: ExampleScreen},
```

The screen now has a tab, numeric shortcut, and `--screen example`. Update
`src/keys.ts` to keep the shortcut range displayed in the footer and Help
accurate.

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

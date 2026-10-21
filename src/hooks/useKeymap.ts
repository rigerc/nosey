import {useInput, type Key} from 'ink';

export interface Binding {
  /** "q", "tab", "shift+tab", "ctrl+r", "enter", "esc", "up", "down", "space"… */
  key: string;
  run: () => void;
}

function matches(spec: string, input: string, key: Key): boolean {
  const parts = spec.split('+');
  const name = parts.pop()!;
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const named: Record<string, boolean> = {
    tab: key.tab,
    esc: key.escape,
    escape: key.escape,
    enter: key.return,
    return: key.return,
    up: key.upArrow,
    down: key.downArrow,
    home: key.home,
    end: key.end,
    pageup: key.pageUp,
    pagedown: key.pageDown,
    left: key.leftArrow,
    right: key.rightArrow,
    backspace: key.backspace,
    delete: key.delete,
    space: input === ' ',
  };
  const lower = name.toLowerCase();
  if (lower in named) {
    if (lower === 'tab' && mods.has('shift') !== key.shift) return false;
    return mods.has('ctrl') === key.ctrl && Boolean(named[lower]);
  }
  return mods.has('ctrl') === key.ctrl && !key.meta && input === name;
}

/** Declarative key bindings. First match wins. Ctrl+C is handled by Ink itself. */
export function useKeymap(bindings: Binding[], options: {isActive?: boolean} = {}) {
  useInput(
    (input, key) => {
      // A disabled listener may still be attached until its effect cleanup runs.
      if (options.isActive === false) return;
      for (const binding of bindings) {
        if (matches(binding.key, input, key)) {
          binding.run();
          return;
        }
      }
    },
    {isActive: options.isActive ?? true},
  );
}

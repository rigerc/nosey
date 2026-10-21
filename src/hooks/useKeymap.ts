import {useInput, type Key} from 'ink';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {useHasInputCapture} from './useInputCapture';
import {useInputActivity} from './useInputActivity';

export interface Binding {
  /** "q", "tab", "shift+tab", "ctrl+r", "enter", "esc", "up", "down", "space"… */
  key: string;
  run: () => void;
}

export type KeymapScope = 'global' | 'screen' | 'control';
export interface KeymapOptions {
  isActive?: boolean;
  /** When bindings overlap, controls win over screens, then global shortcuts. */
  scope?: KeymapScope;
  /** Only for controls explicitly owned by a capturing editor. */
  allowWhenCaptured?: boolean;
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
    if (mods.has('shift') !== Boolean(key.shift)) return false;
    return mods.has('ctrl') === Boolean(key.ctrl) && !key.meta && Boolean(named[lower]);
  }
  return mods.has('ctrl') === Boolean(key.ctrl) && !key.meta && input === name;
}

interface Listener {
  id: number;
  getBindings: () => Binding[];
  getOptions: () => KeymapOptions;
  getInput?: () => (input: string, key: Key) => void;
}
type Register = (listener: Omit<Listener, 'id'>) => () => void;
const KeymapContext = createContext<Register | null>(null);
const priority: Record<KeymapScope, number> = {global: 0, screen: 1, control: 2};

/**
 * Dispatch registered keymaps once per keypress, with explicit scope priority.
 * Captured text input suspends shortcuts except controls explicitly owned by
 * the capturing editor.
 * Standalone components can still use useKeymap without this provider.
 */
export function KeymapProvider({children}: {children: ReactNode}) {
  const listeners = useRef(new Map<number, Listener>());
  const nextId = useRef(0);
  const captured = useHasInputCapture();
  const latestCapture = useRef(captured);
  latestCapture.current = captured;
  const [inputRevision, setInputRevision] = useState(0);
  const committed = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    const resolve = committed.current;
    committed.current = undefined;
    resolve?.();
  }, [inputRevision]);
  const pending = useRef<Array<{input: string; key: Key}>>([]);
  const processing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current = [];
      committed.current?.();
    };
  }, []);

  const register = useCallback<Register>((listener) => {
    const id = ++nextId.current;
    listeners.current.set(id, {...listener, id});
    return () => {
      listeners.current.delete(id);
    };
  }, []);

  const dispatch = (input: string, key: Key) => {
    const ordered = [...listeners.current.values()].sort((a, b) => {
      const scopeA = priority[a.getOptions().scope ?? 'control'];
      const scopeB = priority[b.getOptions().scope ?? 'control'];
      return scopeB - scopeA || b.id - a.id;
    });
    for (const listener of ordered) {
      if (listener.getOptions().isActive === false) continue;
      if (latestCapture.current && !listener.getOptions().allowWhenCaptured) continue;
      for (const binding of listener.getBindings()) {
        if (matches(binding.key, input, key)) {
          binding.run();
          return;
        }
      }
    }
    // Text editors receive unmatched keys through the same ordered dispatcher.
    // A key must never reach both a binding and an editor.
    const editor = ordered.find(
      (listener) =>
        listener.getInput &&
        listener.getOptions().isActive !== false &&
        (!latestCapture.current || listener.getOptions().allowWhenCaptured),
    );
    editor?.getInput?.()(input, key);
  };
  useInput((input, key) => {
    pending.current.push({input, key});
    if (processing.current) return;
    processing.current = true;
    void (async () => {
      try {
        while (mounted.current && pending.current.length) {
          const event = pending.current.shift()!;
          // Deliver one event per React commit. New editors and active-screen
          // registrations must own input before the next queued key is routed.
          await new Promise<void>((resolve) => {
            committed.current = resolve;
            dispatch(event.input, event.key);
            setInputRevision((revision) => revision + 1);
          });
        }
      } finally {
        processing.current = false;
      }
    })();
  });

  return createElement(KeymapContext.Provider, {value: register}, children);
}

/**
 * Declarative bindings. In KeymapProvider, only the highest-priority matching
 * callback runs. Without it, standalone controls retain their original behavior.
 * In both modes, text input capture pauses non-owner shortcuts.
 */
export function useKeymap(bindings: Binding[], options: KeymapOptions = {}) {
  const active = useInputActivity();
  options = {...options, isActive: active && options.isActive !== false};
  const register = useContext(KeymapContext);
  const captured = useHasInputCapture();
  const latest = useRef({bindings, options});
  latest.current = {bindings, options};

  useLayoutEffect(() => {
    if (!register) return;
    return register({
      getBindings: () => latest.current.bindings,
      getOptions: () => latest.current.options,
    });
  }, [register]);

  useInput(
    (input, key) => {
      if (register || (captured && !options.allowWhenCaptured) || options.isActive === false)
        return;
      for (const binding of bindings) {
        if (matches(binding.key, input, key)) {
          binding.run();
          return;
        }
      }
    },
    {
      isActive:
        !register &&
        (!captured || options.allowWhenCaptured === true) &&
        (options.isActive ?? true),
    },
  );
}

/** Raw editor input participates in keymap ordering and mode-transition flushing. */
export function useKeyboardInput(
  handler: (input: string, key: Key) => void,
  {isActive = true}: {isActive?: boolean} = {},
) {
  const active = useInputActivity() && isActive;
  const register = useContext(KeymapContext);
  const latest = useRef({handler, active});
  latest.current = {handler, active};
  useLayoutEffect(() => {
    if (!register) return;
    return register({
      getBindings: () => [],
      getOptions: () => ({isActive: latest.current.active, allowWhenCaptured: true}),
      getInput: () => latest.current.handler,
    });
  }, [register]);
  useInput(handler, {isActive: !register && active});
}

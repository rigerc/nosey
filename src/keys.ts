import type {Binding} from './hooks/useKeymap';

export interface KeyHint {
  key: string;
  label: string;
}

type Action = 'next' | 'previous' | 'jump' | 'commands' | 'theme' | 'help' | 'quit';

/** The single registry for global key behavior, footer hints, and Help. */
export const globalKeys: ReadonlyArray<KeyHint & {action: Action}> = [
  {action: 'next', key: 'tab', label: 'next screen'},
  {action: 'previous', key: 'shift+tab', label: 'previous screen'},
  {action: 'jump', key: '1-9', label: 'jump to screen'},
  {action: 'commands', key: 'ctrl+k', label: 'commands'},
  {action: 'theme', key: 't', label: 'cycle theme'},
  {action: 'help', key: '?', label: 'help'},
  {action: 'quit', key: 'q', label: 'quit'},
];

export type GlobalHandlers = Record<Exclude<Action, 'jump'>, () => void>;

export function getGlobalKeys(count: number): KeyHint[] {
  return globalKeys.map(({action, key, label}) => ({
    key: action === 'jump' ? `1-${count}` : key,
    label,
  }));
}

export function getGlobalBindings(
  count: number,
  handlers: GlobalHandlers,
  onJump: (index: number) => void,
): Binding[] {
  return globalKeys.flatMap(({action, key}) =>
    action === 'jump'
      ? Array.from({length: Math.min(count, 9)}, (_, i) => ({
          key: String(i + 1),
          run: () => onJump(i),
        }))
      : [{key, run: handlers[action]}],
  );
}

import {Box, Text} from 'ink';
import {useState} from 'react';
import {useKeymap} from '../hooks/useKeymap';
import {listIndex, listSize, listWindow} from '../lib/list';
import {useTheme} from '../theme/context';
import type {SelectItem} from './Select';
import {Muted} from './typography';

export interface MultiSelectProps<T extends string> {
  items: readonly SelectItem<T>[];
  value?: readonly T[];
  defaultValue?: readonly T[];
  onChange?: (value: T[]) => void;
  onSubmit?: (value: T[]) => void;
  isActive?: boolean;
  maxVisible?: number;
  emptyMessage?: string;
}

/** Space toggles, arrows or j/k move, Enter submits. Values follow item order. */
export function MultiSelect<T extends string>({
  items,
  value,
  defaultValue = [],
  onChange,
  onSubmit,
  isActive = true,
  maxVisible = 6,
  emptyMessage = 'No options available.',
}: MultiSelectProps<T>) {
  const t = useTheme();
  const [internal, setInternal] = useState<readonly T[]>(defaultValue);
  const [cursor, setCursor] = useState(0);
  const index = listIndex(cursor, items.length);
  if (cursor !== index) setCursor(index);
  const selected = new Set(value ?? internal);
  const values = () => items.filter((item) => selected.has(item.value)).map((item) => item.value);
  const move = (delta: number) => {
    if (items.length) setCursor((index + delta + items.length) % items.length);
  };
  const toggle = () => {
    const item = items[index];
    if (!item) return;
    const next = new Set(selected);
    if (next.has(item.value)) next.delete(item.value);
    else next.add(item.value);
    const result = items.filter((item) => next.has(item.value)).map((item) => item.value);
    if (value === undefined) setInternal(result);
    onChange?.(result);
  };
  useKeymap(
    [
      {key: 'up', run: () => move(-1)},
      {key: 'k', run: () => move(-1)},
      {key: 'down', run: () => move(1)},
      {key: 'j', run: () => move(1)},
      {key: 'home', run: () => setCursor(0)},
      {key: 'end', run: () => setCursor(items.length - 1)},
      {key: 'space', run: toggle},
      {
        key: 'enter',
        run: () => {
          if (items.length) onSubmit?.(values());
        },
      },
    ],
    {isActive},
  );
  const {start, end} = listWindow(index, items.length, listSize(maxVisible, 6));
  return (
    <Box flexDirection="column">
      {items.length === 0 && <Muted>{emptyMessage}</Muted>}
      {items.slice(start, end).map((item, offset) => {
        const focused = isActive && start + offset === index;
        return (
          <Text
            key={item.value}
            bold={focused}
            color={focused ? t.color.primary : t.color.text}
            wrap="truncate-end"
          >
            {focused ? t.symbols.pointer : ' '} [{selected.has(item.value) ? 'x' : ' '}]{' '}
            {item.label}
            {item.hint ? ` - ${item.hint}` : ''}
          </Text>
        );
      })}
      {items.length > 0 && (
        <Muted>
          {values().length} selected / {start + 1}-{end} of {items.length}
        </Muted>
      )}
    </Box>
  );
}

import {Box, Text} from 'ink';
import {useState} from 'react';
import {useKeymap} from '../hooks/useKeymap';
import {listIndex, listSize, listWindow} from '../lib/list';
import {useTheme} from '../theme/context';
import type {SelectItem} from './Select';
import {Muted} from './typography';

/** A selectable row may appear in several technology groups without duplicating its selection. */
export type GroupedSelectItem<T extends string> = SelectItem<T> & {
  group?: {key: string; label: string};
};

export interface MultiSelectProps<T extends string> {
  /** Items visible in the current view, optionally filtered. */
  items: readonly GroupedSelectItem<T>[];
  /** Full item order for preserving selections hidden by a filter. */
  allItems?: readonly SelectItem<T>[];
  value?: readonly T[];
  defaultValue?: readonly T[];
  onChange?: (value: T[]) => void;
  onSubmit?: (value: T[]) => void;
  /** Inspect the focused row without opening a separate search control. */
  onInspect?: (value: T) => void;
  isActive?: boolean;
  maxVisible?: number;
  emptyMessage?: string;
}

/** Space toggles; arrows/j/k move; Enter submits every selected item, including filtered-out ones. */
export function MultiSelect<T extends string>({
  items,
  allItems,
  value,
  defaultValue = [],
  onChange,
  onSubmit,
  onInspect,
  isActive = true,
  maxVisible = 6,
  emptyMessage = 'No options available.',
}: MultiSelectProps<T>) {
  const t = useTheme();
  const [internal, setInternal] = useState<readonly T[]>(defaultValue);
  const [cursor, setCursor] = useState(0);
  const index = listIndex(cursor, items.length);
  if (cursor !== index) setCursor(index);
  const sourceItems = allItems ?? items;
  const selected = new Set(value ?? internal);
  const values = () => [...new Set(sourceItems.filter((item) => selected.has(item.value)).map((item) => item.value))];
  const move = (delta: number) => {
    if (items.length) setCursor((index + delta + items.length) % items.length);
  };
  const toggle = () => {
    const item = items[index];
    if (!item) return;
    const next = new Set(selected);
    if (next.has(item.value)) next.delete(item.value);
    else next.add(item.value);
    const result = [...new Set(sourceItems.filter((entry) => next.has(entry.value)).map((entry) => entry.value))];
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
      {key: 'd', run: () => {
        const item = items[index];
        if (item) onInspect?.(item.value);
      }},
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
        const row = start + offset;
        const focused = isActive && row === index;
        const groupStart = item.group && (
          row === start || items[row - 1]?.group?.key !== item.group.key
        );
        return (
          <Box
            key={item.group ? item.group.key + '/' + item.value : item.value}
            flexDirection="column"
            marginTop={groupStart && row > start ? 1 : 0}
          >
            {groupStart && <Text bold color={t.color.accent} wrap="truncate-end">
              {item.group!.label}
            </Text>}
            <Text
              bold={focused}
              color={focused ? t.color.primary : t.color.text}
              wrap="truncate-end"
            >
              {focused ? t.symbols.pointer : ' '} [{selected.has(item.value) ? 'x' : ' '}]{' '}
              {item.label}
              {item.hint ? ' - ' + item.hint : ''}
            </Text>
          </Box>
        );
      })}
      {sourceItems.length > 0 && (
        <Muted>
          {values().length} selected / {items.length === 0 ? '0' : start + 1 + '-' + end} of {items.length} visible
        </Muted>
      )}
    </Box>
  );
}

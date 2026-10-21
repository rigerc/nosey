import {Box, Text} from 'ink';
import {useRef, useState} from 'react';
import {listIndex, listWindow} from '../lib/list';
import {useKeymap} from '../hooks/useKeymap';
import {useTheme, useTone} from '../theme/context';
import {Icon, Muted} from './typography';

export interface SelectItem<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** Vertical single-select. Arrows or j/k to move, enter to choose. */
export function Select<T extends string>({
  items,
  initialValue,
  current,
  onSelect,
  isActive = true,
  allowWhenCaptured = false,
  maxVisible = 8,
}: {
  items: SelectItem<T>[];
  initialValue?: T;
  /** Value to mark with a check (e.g. the active theme). */
  current?: T;
  onSelect: (value: T) => void;
  isActive?: boolean;
  allowWhenCaptured?: boolean;
  maxVisible?: number;
}) {
  const t = useTheme();
  const primary = useTone('primary');
  const [position, setIndex] = useState(
    Math.max(
      0,
      items.findIndex((i) => i.value === initialValue),
    ),
  );
  const index = listIndex(position, items.length);
  const cursor = useRef(index);
  cursor.current = index;
  const jump = (next: number) => {
    cursor.current = listIndex(next, items.length);
    setIndex(cursor.current);
  };
  const move = (delta: number) => {
    if (items.length) jump((cursor.current + delta + items.length) % items.length);
  };
  const {start, end} = listWindow(index, items.length, maxVisible);

  useKeymap(
    [
      {key: 'up', run: () => move(-1)},
      {key: 'k', run: () => move(-1)},
      {key: 'down', run: () => move(1)},
      {key: 'j', run: () => move(1)},
      {key: 'home', run: () => jump(0)},
      {key: 'end', run: () => jump(items.length - 1)},
      {
        key: 'enter',
        run: () => {
          const item = items[cursor.current];
          if (item) onSelect(item.value);
        },
      },
    ],
    {isActive, allowWhenCaptured},
  );

  return (
    <Box flexDirection="column">
      {items.slice(start, end).map((item, i) => {
        const active = start + i === index;
        return (
          <Box key={item.value} gap={1} flexShrink={1}>
            <Text {...primary}>{active ? t.symbols.pointer : ' '}</Text>
            <Text wrap="truncate-end" bold={active} {...(active ? primary : {})}>
              {item.label}
            </Text>
            {item.value === current && <Icon name="success" />}
            {item.hint && (
              <Text wrap="truncate-end" color={t.color.muted}>
                {item.hint}
              </Text>
            )}
          </Box>
        );
      })}
      {items.length > maxVisible && (
        <Muted>
          {start + 1}-{end} of {items.length}
        </Muted>
      )}
    </Box>
  );
}

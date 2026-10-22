import {Box} from 'ink';
import {useRef, useState} from 'react';
import {listIndex, listWindow} from '../lib/list';
import {useKeymap} from '../hooks/useKeymap';
import {useInputActivity} from '../hooks/useInputActivity';
import {OptionRow} from './control-parts';
import {Muted} from './typography';

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
  isActive = useInputActivity() && isActive;

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
      {items.slice(start, end).map((item, i) => (
        <OptionRow
          key={item.value}
          label={item.label}
          hint={item.hint}
          focused={isActive && start + i === index}
          selected={item.value === current}
          marker={current === undefined ? undefined : 'check'}
        />
      ))}
      {items.length > maxVisible && (
        <Muted>
          {start + 1}-{end} of {items.length}
        </Muted>
      )}
    </Box>
  );
}

import {Box, Text} from 'ink';
import {useState} from 'react';
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
}: {
  items: SelectItem<T>[];
  initialValue?: T;
  /** Value to mark with a check (e.g. the active theme). */
  current?: T;
  onSelect: (value: T) => void;
  isActive?: boolean;
}) {
  const t = useTheme();
  const primary = useTone('primary');
  const [index, setIndex] = useState(
    Math.max(
      0,
      items.findIndex((i) => i.value === initialValue),
    ),
  );
  const move = (delta: number) => setIndex((i) => (i + delta + items.length) % items.length);

  useKeymap(
    [
      {key: 'up', run: () => move(-1)},
      {key: 'k', run: () => move(-1)},
      {key: 'down', run: () => move(1)},
      {key: 'j', run: () => move(1)},
      {key: 'enter', run: () => onSelect(items[index]!.value)},
    ],
    {isActive},
  );

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const active = i === index;
        return (
          <Box key={item.value} gap={1}>
            <Text {...primary}>{active ? t.symbols.pointer : ' '}</Text>
            <Text bold={active} {...(active ? primary : {})}>
              {item.label}
            </Text>
            {item.value === current && <Icon name="success" />}
            {item.hint && <Muted>{item.hint}</Muted>}
          </Box>
        );
      })}
    </Box>
  );
}

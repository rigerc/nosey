import {Box, Text} from 'ink';
import {useRef, useState} from 'react';
import {useKeymap} from '../hooks/useKeymap';
import {listIndex, listSize, listWindow} from '../lib/list';
import {useTheme} from '../theme/context';
import {OptionRow} from './control-parts';
import type {SelectItem} from './Select';
import {Muted} from './typography';

export interface MultiSelectItem<T extends string> extends SelectItem<T> {
  /** Non-selectable heading, repeated when a window starts partway through a group. */
  group?: {key: string; label: string};
}

export interface MultiSelectProps<T extends string> {
  items: readonly MultiSelectItem<T>[];
  value?: readonly T[];
  defaultValue?: readonly T[];
  onChange?: (value: T[]) => void;
  onSubmit?: (value: T[]) => void;
  isActive?: boolean;
  allowWhenCaptured?: boolean;
  maxVisible?: number;
  /** Bound physical rows as well as option count when headings add vertical space. */
  maxVisibleRows?: number;
  emptyMessage?: string;
  /** Canonical options retain selections outside a filtered viewport. */
  allItems?: readonly SelectItem<T>[];
  cursor?: number;
  onCursorChange?: (index: number) => void;
  submitWhenEmpty?: boolean;
  /** Dense group spacing for results screens; option and heading rows remain distinct. */
  compact?: boolean;
  /** Omit the duplicate selected total when a screen already presents it. */
  showSelectedCount?: boolean;
}

/** Space toggles, arrows or j/k move, Enter submits. Values follow item order. */
export function MultiSelect<T extends string>({
  items,
  value,
  defaultValue = [],
  onChange,
  onSubmit,
  isActive = true,
  allowWhenCaptured = false,
  maxVisible = 6,
  maxVisibleRows,
  emptyMessage = 'No options available.',
  allItems = items,
  cursor: controlledCursor,
  onCursorChange,
  submitWhenEmpty = false,
  compact = false,
  showSelectedCount = true,
}: MultiSelectProps<T>) {
  const t = useTheme();
  const grouped = items.some((item) => item.group);
  const [internal, setInternal] = useState<readonly T[]>(defaultValue);
  const [internalCursor, setInternalCursor] = useState(0);
  const cursor = controlledCursor ?? internalCursor;
  const currentCursor = useRef(cursor);

  const setCursor = (next: number) => {
    currentCursor.current = listIndex(next, items.length);

    if (controlledCursor === undefined) setInternalCursor(currentCursor.current);
    onCursorChange?.(currentCursor.current);
  };

  const index = listIndex(cursor, items.length);
  currentCursor.current = index;
  const selected = new Set(value ?? internal);
  const currentSelection = useRef(selected);
  currentSelection.current = selected;
  const canonicalValues = [...new Set(allItems.map((item) => item.value))];
  const values = () => canonicalValues.filter((value) => currentSelection.current.has(value));

  const move = (delta: number) => {
    if (items.length) setCursor((currentCursor.current + delta + items.length) % items.length);
  };

  const toggle = () => {
    const item = items[currentCursor.current];

    if (!item) return;
    const next = new Set(currentSelection.current);

    if (next.has(item.value)) next.delete(item.value);
    else next.add(item.value);
    currentSelection.current = next;
    const result = canonicalValues.filter((value) => next.has(value));

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
      {
        key: 'pageup',
        run: () => setCursor(Math.max(0, currentCursor.current - listSize(maxVisible, 6))),
      },
      {
        key: 'pagedown',
        run: () =>
          setCursor(Math.min(items.length - 1, currentCursor.current + listSize(maxVisible, 6))),
      },
      {key: 'space', run: toggle},
      {
        key: 'enter',
        run: () => {
          if (items.length || submitWhenEmpty) onSubmit?.(values());
        },
      },
    ],
    {isActive, allowWhenCaptured},
  );
  let {start, end} = listWindow(index, items.length, listSize(maxVisible, 6));

  const rowBudget =
    maxVisibleRows === undefined ? Infinity : Math.max(4, listSize(maxVisibleRows, 12));

  const rowCount = () => {
    let count = end - start;

    for (let offset = start; offset < end; offset++) {
      const item = items[offset]!;

      if (item.group && (offset === start || item.group.key !== items[offset - 1]?.group?.key))
        count += compact ? (offset === start ? 1 : 2) : 3;
    }

    return count;
  };

  // Keep the focused option visible; headings never become keyboard stops.
  while (end - start > 1 && rowCount() > rowBudget) {
    if (index - start > end - index - 1) start++;
    else end--;
  }

  return (
    <Box flexDirection="column" marginTop={compact && !grouped ? 0 : 1}>
      {items.length === 0 && <Muted>{emptyMessage}</Muted>}
      {items.slice(start, end).map((item, offset) => {
        const focused = isActive && start + offset === index;

        return (
          <Box
            key={`${item.group?.key ?? ''}/${item.value}/${start + offset}`}
            flexDirection="column"
          >
            {item.group &&
              (offset === 0 || item.group.key !== items[start + offset - 1]?.group?.key) && (
                <Box marginTop={offset === 0 ? 0 : 1} marginBottom={compact ? 0 : 1}>
                  <Text bold color={t.color.muted} wrap="truncate-end">
                    {item.group.label}
                  </Text>
                </Box>
              )}
            <OptionRow
              label={item.label}
              hint={item.hint}
              focused={focused}
              selected={selected.has(item.value)}
              marker="checkbox"
            />
          </Box>
        );
      })}
      {items.length > 0 && (
        <Box marginTop={compact && !grouped ? 0 : 1}>
          <Muted>
            {showSelectedCount ? `${values().length} selected / ` : ''}
            {start + 1}-{end} of {items.length}
            {grouped ? ' entries' : ''}
          </Muted>
        </Box>
      )}
    </Box>
  );
}

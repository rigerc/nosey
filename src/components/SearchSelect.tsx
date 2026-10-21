import {Box, Text, useInput} from 'ink';
import {useState} from 'react';
import {useInputCapture} from '../hooks/useInputCapture';
import {listIndex, listSize, listWindow} from '../lib/list';
import {useTheme} from '../theme/context';
import type {SelectItem} from './Select';
import {Muted} from './typography';

export interface SearchSelectProps<T extends string> {
  items: readonly SelectItem<T>[];
  onSelect: (value: T) => void;
  onCancel?: () => void;
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  isActive?: boolean;
  maxVisible?: number;
  placeholder?: string;
  emptyMessage?: string;
}

const segments = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
const trimLast = (text: string) =>
  [...segments.segment(text)]
    .slice(0, -1)
    .map((part) => part.segment)
    .join('');

/** Type to filter labels/hints, arrows navigate, Enter selects, Escape cancels. */
export function SearchSelect<T extends string>({
  items,
  onSelect,
  onCancel,
  query: controlledQuery,
  defaultQuery = '',
  onQueryChange,
  isActive = true,
  maxVisible = 6,
  placeholder = 'Type to filter...',
  emptyMessage = 'No matches found.',
}: SearchSelectProps<T>) {
  const t = useTheme();
  const [internalQuery, setQuery] = useState(defaultQuery);
  const query = controlledQuery ?? internalQuery;
  const [position, setPosition] = useState({query, index: 0});
  const normalized = query.toLocaleLowerCase();
  const matches = items.filter((item) =>
    `${item.label} ${item.hint ?? ''}`.toLocaleLowerCase().includes(normalized),
  );
  const index = listIndex(position.query === query ? position.index : 0, matches.length);
  if (position.query !== query || position.index !== index) setPosition({query, index});
  const changeQuery = (next: string) => {
    if (controlledQuery === undefined) setQuery(next);
    if (controlledQuery === undefined) setPosition({query: next, index: 0});
    onQueryChange?.(next);
  };
  useInputCapture(isActive);
  useInput(
    (input, key) => {
      if (key.ctrl && input === 'u') {
        changeQuery('');
        return;
      }
      if (key.ctrl || key.meta) return;
      if (key.escape) {
        onCancel?.();
        return;
      }
      if (key.return) {
        const item = matches[index];
        if (item) onSelect(item.value);
        return;
      }
      if (key.upArrow || key.downArrow) {
        if (matches.length)
          setPosition({
            query,
            index: (index + (key.upArrow ? -1 : 1) + matches.length) % matches.length,
          });
        return;
      }
      if (key.backspace || key.delete) {
        changeQuery(trimLast(query));
        return;
      }
      // Strip control characters Ink delivers for special keys.
      // oxlint-disable-next-line no-control-regex
      const printable = input.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
      if (printable) changeQuery(query + printable);
    },
    {isActive},
  );
  const {start, end} = listWindow(index, matches.length, listSize(maxVisible, 6));
  return (
    <Box flexDirection="column">
      <Text color={isActive ? t.color.primary : t.color.muted} wrap="truncate-end">
        Search: {query || placeholder}
      </Text>
      {matches.length === 0 && <Muted>{emptyMessage}</Muted>}
      {matches.slice(start, end).map((item, offset) => {
        const focused = isActive && start + offset === index;
        return (
          <Text
            key={item.value}
            bold={focused}
            color={focused ? t.color.primary : t.color.text}
            wrap="truncate-end"
          >
            {focused ? t.symbols.pointer : ' '} {item.label}
            {item.hint ? ` - ${item.hint}` : ''}
          </Text>
        );
      })}
      {matches.length > 0 && (
        <Muted>
          {start + 1}-{end} of {matches.length} matches
        </Muted>
      )}
    </Box>
  );
}

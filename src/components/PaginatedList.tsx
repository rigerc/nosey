import {isString, isNumber} from '../lib/values';
import {Box, Text} from 'ink';
import {useState, type ReactNode} from 'react';
import {useKeymap} from '../hooks/useKeymap';
import {listIndex, listSize} from '../lib/list';
import {Muted} from './typography';

export interface PaginatedListProps<T> {
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string | number;
  pageSize?: number;
  /** Zero-based page index. */
  page?: number;
  initialPage?: number;
  onPageChange?: (page: number) => void;
  isActive?: boolean;
  emptyMessage?: string;
  allowWhenCaptured?: boolean;
}

/** Left/right or PageUp/PageDown change pages; Home/End jump to first/last. */
export function PaginatedList<T>({
  items,
  renderItem,
  getKey,
  pageSize = 5,
  page,
  initialPage = 0,
  onPageChange,
  isActive = true,
  emptyMessage = 'No items.',
  allowWhenCaptured = false,
}: PaginatedListProps<T>) {
  const [internal, setInternal] = useState(initialPage);
  const size = listSize(pageSize, 5);
  const count = Math.ceil(items.length / size);
  const current = listIndex(page ?? internal, count);

  if (page === undefined && internal !== current) setInternal(current);

  const change = (next: number) => {
    const target = listIndex(next, count);

    if (!count || target === current) return;

    if (page === undefined) setInternal(target);
    onPageChange?.(target);
  };

  useKeymap(
    [
      {key: 'left', run: () => change(current - 1)},
      {key: 'pageup', run: () => change(current - 1)},
      {key: 'right', run: () => change(current + 1)},
      {key: 'pagedown', run: () => change(current + 1)},
      {key: 'home', run: () => change(0)},
      {key: 'end', run: () => change(count - 1)},
    ],
    {isActive, allowWhenCaptured},
  );

  if (!items.length) return <Muted>{emptyMessage}</Muted>;
  const start = current * size;
  const end = Math.min(start + size, items.length);

  return (
    <Box flexDirection="column">
      {items.slice(start, end).map((item, offset) => {
        const content = renderItem(item, start + offset);

        return (
          <Box key={getKey(item, start + offset)} flexDirection="column">
            {isString(content) || isNumber(content) ? <Text>{content}</Text> : content}
          </Box>
        );
      })}
      <Muted>
        Page {current + 1}/{count} / {start + 1}-{end} of {items.length}
      </Muted>
    </Box>
  );
}

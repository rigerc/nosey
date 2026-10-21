import {Box, Text} from 'ink';
import type {ReactNode} from 'react';
import stringWidth from 'string-width';
import {useTheme, useTone} from '../theme/context';
import type {Tone} from '../theme/tokens';
import {Divider} from './typography';

export type Cell = string | number | {text: string; tone?: Tone};
export interface Column {
  key: string;
  header: string;
  align?: 'left' | 'right';
  maxWidth?: number;
}

const textOf = (cell: Cell | undefined) =>
  cell === undefined ? '' : typeof cell === 'object' ? cell.text : String(cell);

function CellText({cell}: {cell: Cell | undefined}) {
  const style = useTone(typeof cell === 'object' ? (cell.tone ?? 'primary') : 'primary');
  return (
    <Text wrap="truncate-end" {...(typeof cell === 'object' ? style : {})}>
      {textOf(cell)}
    </Text>
  );
}

/**
 * Auto-sized table. Columns take their natural width; the widest column is
 * allowed to shrink (and truncate with an ellipsis) so the table always fits
 * its container, with no dependency on the terminal width.
 */
export function Table({
  columns,
  rows,
  selected,
}: {
  columns: Column[];
  rows: Record<string, Cell>[];
  selected?: number;
}) {
  const t = useTheme();
  const primary = useTone('primary');

  const widths = columns.map((c) =>
    Math.min(
      c.maxWidth ?? Infinity,
      Math.max(stringWidth(c.header), ...rows.map((r) => stringWidth(textOf(r[c.key])))),
    ),
  );
  const shrinkable = widths.indexOf(Math.max(...widths));

  const renderRow = (key: string, cells: (c: Column) => ReactNode, isSelected = false) => (
    <Box key={key} columnGap={2}>
      <Box width={1} flexShrink={0}>
        <Text {...primary}>{isSelected ? t.symbols.pointer : ' '}</Text>
      </Box>
      {columns.map((c, i) => (
        <Box
          key={c.key}
          width={widths[i]}
          minWidth={i === shrinkable ? 6 : widths[i]}
          flexShrink={i === shrinkable ? 1 : 0}
          justifyContent={c.align === 'right' ? 'flex-end' : 'flex-start'}
        >
          {cells(c)}
        </Box>
      ))}
    </Box>
  );

  return (
    <Box flexDirection="column">
      {renderRow('header', (c) => (
        <Text bold wrap="truncate-end" color={t.color.text}>
          {c.header}
        </Text>
      ))}
      <Divider />
      {rows.map((row, i) =>
        renderRow(String(i), (c) => <CellText cell={row[c.key]} />, i === selected),
      )}
    </Box>
  );
}

import {Box, Text, useWindowSize} from 'ink';
import {useTheme, useTone} from '../theme/context';
import type {Tone} from '../theme/tokens';

export function ProgressBar({
  value,
  width = 24,
  tone = 'primary',
}: {
  value: number;
  width?: number;
  tone?: Tone;
}) {
  const t = useTheme();
  const {columns} = useWindowSize();
  const v = Number.isNaN(value) ? 0 : Math.max(0, Math.min(1, value));

  const barWidth = Math.max(
    1,
    Math.min(Number.isFinite(width) ? Math.floor(width) : 24, columns - 5),
  );

  return (
    <Box gap={1}>
      <Box width={barWidth} flexShrink={1} minWidth={1} height={1} overflow="hidden">
        <Box width={`${v * 100}%`} height={1} overflow="hidden">
          <Text {...useTone(tone)}>{t.symbols.barFull.repeat(barWidth)}</Text>
        </Box>
        <Box flexGrow={1} flexBasis={0} height={1} overflow="hidden">
          <Text {...useTone('muted')}>{t.symbols.barEmpty.repeat(barWidth)}</Text>
        </Box>
      </Box>
      <Box width={4} flexShrink={0} justifyContent="flex-end">
        <Text>{Math.round(v * 100)}%</Text>
      </Box>
    </Box>
  );
}

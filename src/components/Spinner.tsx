import {Box, Text, useAnimation} from 'ink';
import {isInteractive} from '../lib/terminal';
import {useTheme, useTone} from '../theme/context';
import type {Tone} from '../theme/tokens';

/** Animated spinner; renders a static glyph when output is not a TTY. */
export function Spinner({label, tone = 'primary'}: {label?: string; tone?: Tone}) {
  const t = useTheme();
  const animated = isInteractive();
  const {frame} = useAnimation({interval: t.motion.intervalMs, isActive: animated});
  const glyph = animated ? t.motion.spinner[frame % t.motion.spinner.length] : t.symbols.ellipsis;
  return (
    <Box gap={1}>
      <Text {...useTone(tone)}>{glyph}</Text>
      {label && <Text wrap="truncate-end">{label}</Text>}
    </Box>
  );
}

import {Text} from 'ink';
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
  const v = Math.max(0, Math.min(1, value));
  const filled = Math.round(v * width);
  return (
    <Text>
      <Text {...useTone(tone)}>{t.symbols.barFull.repeat(filled)}</Text>
      <Text {...useTone('muted')}>{t.symbols.barEmpty.repeat(width - filled)}</Text>
      <Text> {String(Math.round(v * 100)).padStart(3)}%</Text>
    </Text>
  );
}

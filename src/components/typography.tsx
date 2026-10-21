import {Box, Text} from 'ink';
import type {ReactNode} from 'react';
import {useTheme, useTone} from '../theme/context';
import type {Tone} from '../theme/tokens';

export function Heading({children, tone = 'primary'}: {children: ReactNode; tone?: Tone}) {
  return (
    <Text bold {...useTone(tone)}>
      {children}
    </Text>
  );
}

export function Label({children}: {children: ReactNode}) {
  return (
    <Text bold color={useTheme().color.text}>
      {children}
    </Text>
  );
}

export function Muted({children}: {children: ReactNode}) {
  return <Text {...useTone('muted')}>{children}</Text>;
}

export function Code({children}: {children: ReactNode}) {
  return <Text {...useTone('accent')}>{children}</Text>;
}

/** Key cap: [ctrl+c] */
export function Kbd({children}: {children: ReactNode}) {
  return (
    <Text bold color={useTheme().color.text}>
      [{children}]
    </Text>
  );
}

type IconName = 'success' | 'error' | 'warn' | 'info' | 'pointer' | 'bullet' | 'pending';
const iconTone: Record<IconName, Tone> = {
  success: 'success',
  error: 'danger',
  warn: 'warn',
  info: 'info',
  pointer: 'primary',
  bullet: 'muted',
  pending: 'muted',
};

/** Resolves a glyph from the theme, so ASCII mode just works. */
export function Icon({name, tone}: {name: IconName; tone?: Tone}) {
  const t = useTheme();
  return <Text {...useTone(tone ?? iconTone[name])}>{t.symbols[name]}</Text>;
}

/** Full-width rule, optionally with a leading label. */
export function Divider({label}: {label?: string}) {
  const t = useTheme();
  const line = (
    <Box
      flexGrow={1}
      borderStyle={t.symbols.line === '─' ? 'single' : 'classic'}
      borderColor={t.color.border}
      borderDimColor={t.mono}
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
    />
  );
  if (!label) return line;
  return (
    <Box gap={1}>
      <Muted>{label}</Muted>
      {line}
    </Box>
  );
}

import {isString} from '../lib/values';
import {Box, Text} from 'ink';
import type {ReactNode} from 'react';
import {useTheme, useTone} from '../theme/context';
import type {Tone} from '../theme/tokens';
import {Muted} from './typography';

export interface PanelProps {
  title?: string;
  footer?: ReactNode;
  /** Tone of the title. */
  tone?: Tone;
  focused?: boolean;
  /** Use a tighter title row for task-focused screens. */
  compact?: boolean;
  width?: number | string;
  children: ReactNode;
}

/** Bordered container. Ink has no border titles, so the title is the first row. */
export function Panel({
  title,
  footer,
  tone = 'primary',
  focused = false,
  compact = false,
  width,
  children,
}: PanelProps) {
  const t = useTheme();
  const titleStyle = useTone(tone);

  return (
    <Box
      flexDirection="column"
      borderStyle={focused ? t.border.focus : t.border.base}
      borderColor={focused ? t.color.focus : t.color.border}
      paddingX={1}
      width={width}
    >
      {title && (
        <Box marginBottom={compact ? 0 : 1}>
          <Text bold wrap="truncate-end" {...titleStyle}>
            {title}
          </Text>
        </Box>
      )}
      {children}
      {footer && <Box marginTop={1}>{isString(footer) ? <Muted>{footer}</Muted> : footer}</Box>}
    </Box>
  );
}

/** Lightweight alternative to Panel: a colored accent bar on the left. */
export function Card({tone = 'primary', children}: {tone?: Tone; children: ReactNode}) {
  const t = useTheme();

  return (
    <Box
      flexDirection="column"
      borderStyle={t.mono ? 'single' : 'bold'}
      borderColor={t.color[tone]}
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingLeft={1}
    >
      {children}
    </Box>
  );
}

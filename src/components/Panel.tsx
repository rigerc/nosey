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
  /** Open sections for content, outlines for dialogs and review. */
  variant?: 'plain' | 'outline';
  /** Use a tighter title row for task-focused screens. */
  compact?: boolean;
  width?: number | string;
  children: ReactNode;
}

/** Shared section title and spacing, with an optional quiet outline. */
export function Panel({
  title,
  footer,
  tone,
  focused = false,
  variant = 'outline',
  compact = false,
  width,
  children,
}: PanelProps) {
  const t = useTheme();
  const titleStyle = useTone(tone ?? (focused ? 'primary' : 'muted'));

  return (
    <Box
      flexDirection="column"
      borderStyle={variant === 'outline' ? t.border.base : undefined}
      borderColor={t.color.border}
      borderDimColor={t.mono}
      paddingX={variant === 'outline' ? 1 : 0}
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

import {Box, Text} from 'ink';
import type {ReactNode} from 'react';
import type {ToastTone} from '../hooks/useToast';
import {useTheme, useTone} from '../theme/context';
import {Icon} from './typography';

const iconFor = {success: 'success', danger: 'error', warn: 'warn', info: 'info'} as const;

/** One-line status: icon + message. Never relies on color alone. */
export function StatusMessage({tone = 'info', children}: {tone?: ToastTone; children: ReactNode}) {
  return (
    <Box gap={1}>
      <Icon name={iconFor[tone]} tone={tone} />
      <Text wrap="truncate-end">{children}</Text>
    </Box>
  );
}

/** Bordered callout with a title and optional body. */
export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: ToastTone;
  title: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  const color = t.color[tone];
  return (
    <Box flexDirection="column" borderStyle={t.border.base} borderColor={color} paddingX={1}>
      <Box gap={1}>
        <Icon name={iconFor[tone]} tone={tone} />
        <Text bold wrap="truncate-end" {...useTone(tone)}>
          {title}
        </Text>
      </Box>
      {typeof children === 'string' ? <Text>{children}</Text> : children}
    </Box>
  );
}

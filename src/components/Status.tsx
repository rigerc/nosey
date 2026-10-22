import {isString} from '../lib/values';
import {Box, Text} from 'ink';
import type {ReactNode} from 'react';
import type {ToastTone} from '../hooks/useToast';
import {useTheme, useTone} from '../theme/context';
import {Icon} from './typography';

const iconFor = {success: 'success', danger: 'error', warn: 'warn', info: 'info'} as const;

/** Icon and wrapping message. Diagnostics remain readable at narrow widths. */
export function StatusMessage({tone = 'info', children}: {tone?: ToastTone; children: ReactNode}) {
  return (
    <Box gap={1}>
      <Box flexShrink={0}>
        <Icon name={iconFor[tone]} tone={tone} />
      </Box>
      <Box flexShrink={1} minWidth={0}>
        <Text>{children}</Text>
      </Box>
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
        <Box flexShrink={0}>
          <Icon name={iconFor[tone]} tone={tone} />
        </Box>
        <Box flexShrink={1} minWidth={0}>
          <Text bold {...useTone(tone)}>
            {title}
          </Text>
        </Box>
      </Box>
      {children && (
        <Box flexDirection="column" paddingLeft={2}>
          {isString(children) ? <Text>{children}</Text> : children}
        </Box>
      )}
    </Box>
  );
}

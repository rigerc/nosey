import {Box, Text} from 'ink';
import type {ReactNode} from 'react';
import {Icon, Muted} from './typography';

export function EmptyState({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Box flexShrink={0}>
          <Icon name="info" tone="muted" />
        </Box>
        <Box flexShrink={1}>
          <Text bold>{title}</Text>
        </Box>
      </Box>
      {hint && (
        <Box paddingLeft={2}>
          <Muted>{hint}</Muted>
        </Box>
      )}
      {children}
    </Box>
  );
}

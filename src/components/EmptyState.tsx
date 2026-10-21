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
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Box gap={1}>
        <Icon name="info" tone="muted" />
        <Text bold>{title}</Text>
      </Box>
      {hint && <Muted>{hint}</Muted>}
      {children}
    </Box>
  );
}

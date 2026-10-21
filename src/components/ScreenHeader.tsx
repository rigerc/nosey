import {Box, Text} from 'ink';
import type {ReactNode} from 'react';
import {Muted} from './typography';

export interface ScreenHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** Consistent title and optional actions for an individual screen. */
export function ScreenHeader({title, description, actions}: ScreenHeaderProps) {
  return (
    <Box justifyContent="space-between" gap={1} paddingX={1}>
      <Box flexDirection="column" flexShrink={1}>
        <Text bold wrap="truncate-end">
          {title}
        </Text>
        {description && <Muted>{description}</Muted>}
      </Box>
      {actions && <Box flexShrink={0}>{actions}</Box>}
    </Box>
  );
}

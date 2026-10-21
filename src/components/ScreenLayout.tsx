import {Box} from 'ink';
import type {PropsWithChildren} from 'react';
import {ScreenHeader, type ScreenHeaderProps} from './ScreenHeader';

/** Shared content spacing without taking over the terminal's scrollback. */
export function ScreenLayout({
  title,
  description,
  actions,
  children,
}: PropsWithChildren<ScreenHeaderProps>) {
  return (
    <Box flexDirection="column" gap={1}>
      <ScreenHeader title={title} description={description} actions={actions} />
      <Box flexDirection="column" paddingX={1} gap={1}>
        {children}
      </Box>
    </Box>
  );
}

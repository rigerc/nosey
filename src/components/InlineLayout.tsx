import {Box} from 'ink';
import type {ReactNode} from 'react';

export interface InlineLayoutProps {
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
}

/** Content-sized layout for short commands; no terminal-height or alternate-screen handling. */
export function InlineLayout({title, footer, children, maxWidth = 72}: InlineLayoutProps) {
  return (
    <Box flexDirection="column" width="100%" maxWidth={maxWidth} gap={1}>
      {title}
      <Box flexDirection="column">{children}</Box>
      {footer}
    </Box>
  );
}

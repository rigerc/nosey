import {Box} from 'ink';
import type {ReactNode} from 'react';
import {EmptyState} from './EmptyState';
import {ErrorPanel} from './ErrorPanel';
import {Spinner} from './Spinner';
import {StatusMessage} from './Status';

/** Reusable async result states; callers own data fetching and transitions. */
export type ScreenStatus = 'loading' | 'empty' | 'error' | 'success';

export interface ScreenStateProps {
  status: ScreenStatus;
  title?: string;
  message?: string;
  error?: unknown;
  children?: ReactNode;
}

export function ScreenState({status, title, message, error, children}: ScreenStateProps) {
  if (status === 'loading') return <Spinner label={message ?? title ?? 'Loading'} />;
  if (status === 'empty')
    return (
      <EmptyState title={title ?? 'Nothing here yet'} hint={message}>
        {children}
      </EmptyState>
    );
  if (status === 'error')
    return <ErrorPanel error={error ?? new Error(message ?? title ?? 'Something went wrong')} />;
  return (
    <Box flexDirection="column">
      {(title || message) && <StatusMessage tone="success">{title ?? message}</StatusMessage>}
      {children}
    </Box>
  );
}

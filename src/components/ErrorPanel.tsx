import {Box, Text} from 'ink';
import {Component, type ReactNode} from 'react';
import {toAppError} from '../lib/errors';
import {logger} from '../lib/logger';
import {Alert} from './Status';
import {Muted} from './typography';

/** Friendly error; stack trace only in debug mode. */
export function ErrorPanel({error, debug = false}: {error: unknown; debug?: boolean}) {
  const err = toAppError(error);

  return (
    <Alert tone="danger" title={err.message}>
      {err.hint && <Text>{err.hint}</Text>}
      {debug && err.stack && <Muted>{err.stack.split('\n').slice(1, 6).join('\n')}</Muted>}
      {!debug && (
        <Box>
          <Muted>Run with --debug for details.</Muted>
        </Box>
      )}
    </Alert>
  );
}

interface BoundaryState {
  error?: Error;
}

export class ErrorBoundary extends Component<
  {debug?: boolean; children: ReactNode},
  BoundaryState
> {
  override state: BoundaryState = {};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  override componentDidCatch(error: Error) {
    logger.error(error);
  }

  override render() {
    if (this.state.error)
      return <ErrorPanel error={this.state.error} debug={this.props.debug ?? false} />;

    return this.props.children;
  }
}

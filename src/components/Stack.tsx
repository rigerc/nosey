import {Box, type BoxProps} from 'ink';
import type {PropsWithChildren} from 'react';

type StackProps = PropsWithChildren<
  Omit<BoxProps, 'flexDirection' | 'gap'> & {gap?: 0 | 1 | 2 | 3 | 4}
>;

/** Vertical layout with a gap on the spacing scale (cells). */
export const Stack = ({gap = 0, ...rest}: StackProps) => (
  <Box flexDirection="column" gap={gap} {...rest} />
);

/** Horizontal layout with a gap on the spacing scale (cells). */
export const Row = ({gap = 0, ...rest}: StackProps) => (
  <Box flexDirection="row" gap={gap} {...rest} />
);

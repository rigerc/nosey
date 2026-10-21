import {Box, Text} from 'ink';
import type {ReactNode} from 'react';
import stringWidth from 'string-width';
import {Muted} from './typography';

export function KeyValue({items}: {items: {label: string; value: ReactNode}[]}) {
  const labelWidth = Math.max(...items.map((i) => stringWidth(i.label)));
  return (
    <Box flexDirection="column">
      {items.map((item) => (
        <Box key={item.label} gap={2}>
          <Box width={labelWidth} flexShrink={0}>
            <Muted>{item.label}</Muted>
          </Box>
          <Box flexShrink={1}>
            {typeof item.value === 'string' ? (
              <Text wrap="truncate-middle">{item.value}</Text>
            ) : (
              item.value
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

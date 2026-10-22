import {Box, Text} from 'ink';
import {useTone} from '../theme/context';

export function Tabs({items, activeId}: {items: {id: string; label: string}[]; activeId: string}) {
  const primary = useTone('primary');
  const muted = useTone('muted');
  return (
    <Box columnGap={1} paddingX={1} flexWrap="wrap">
      {items.map((item, i) =>
        item.id === activeId ? (
          <Text key={item.id} bold {...primary}>
            [{i + 1} {item.label}]
          </Text>
        ) : (
          <Text key={item.id} {...muted}>
            {i + 1} {item.label}
          </Text>
        ),
      )}
    </Box>
  );
}

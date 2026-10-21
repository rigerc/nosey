import {Box, Text} from 'ink';
import pkg from '../../package.json';
import {BrandMark, Muted, Panel, Stack} from '../components';
import {brandTagline} from '../lib/brand';

export function HomeScreen() {
  return (
    <Stack gap={1}>
      <Panel
        title={
          <>
            <BrandMark bold /> {pkg.name}
          </>
        }
        tone="accent"
      >
        <Text>{brandTagline}</Text>
        <Box marginTop={1}>
          <Muted>Your CLI application is ready.</Muted>
        </Box>
        <Muted>Replace this screen with your application's experience.</Muted>
      </Panel>
      <Panel title="Build your app">
        <Text>Add a screen in src/screens/ and register it in src/screens/index.ts.</Text>
        <Text>Add headless commands in src/commands/.</Text>
        <Text>See docs/adding-a-feature.md for an example.</Text>
      </Panel>
    </Stack>
  );
}

import {Box, Text} from 'ink';
import pkg from '../../package.json';
import {BrandMark, Kbd, Muted, Panel, Stack} from '../components';
import {globalKeys} from '../keys';
import {brandTagline} from '../lib/brand';
import {screenIds} from './index';

export function HelpScreen() {
  return (
    <Stack gap={1}>
      <Panel
        title={
          <>
            <BrandMark bold /> {pkg.name} v{pkg.version}
          </>
        }
        tone="accent"
      >
        <Text>{brandTagline}</Text>
        <Muted>Terminal UI, no alt screen. Every screen fits the current width.</Muted>
      </Panel>
      <Panel title="Keyboard">
        {globalKeys.map((binding) => (
          <Box key={binding.key} gap={2}>
            <Box width={5}>
              <Kbd>{binding.key}</Kbd>
            </Box>
            <Text>{binding.label}</Text>
          </Box>
        ))}
      </Panel>
      <Panel title="Flags and commands">
        <Text>--theme nosey|dark|light|contrast|mono|auto</Text>
        <Text>{`--screen ${screenIds.join('|')}`}</Text>
        <Text>--setup --config path --plain --ascii --debug</Text>
        <Text>--json --skills-only --explain --no-interactive</Text>
        <Text>--depth N --max-files N --registry SOURCE</Text>
        <Text>registry init|list|add|remove|show|validate|build</Text>
        <Text>doctor [--json] Environment and configuration checks</Text>
      </Panel>
    </Stack>
  );
}

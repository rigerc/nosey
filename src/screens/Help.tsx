import {Box, Text} from 'ink';
import {useState} from 'react';
import {Kbd, Muted, Panel, ScreenLayout} from '../components';
import {useScreenHints} from '../features/ui/context';
import {useKeymap, useTerminalSize} from '../hooks';
import {getGlobalKeys} from '../keys';
import {useTheme} from '../theme/context';
import {navScreens} from './index';
import {scanHints} from './Home';

const topics = ['Global keys', 'Scan and selection', 'Registries', 'Settings', 'CLI / safety'];

export function HelpScreen() {
  const [topic, setTopic] = useState(0);
  const theme = useTheme();
  const {columns} = useTerminalSize();
  useKeymap(
    [
      {key: 'up', run: () => setTopic((index) => (index + topics.length - 1) % topics.length)},
      {key: 'k', run: () => setTopic((index) => (index + topics.length - 1) % topics.length)},
      {key: 'down', run: () => setTopic((index) => (index + 1) % topics.length)},
      {key: 'j', run: () => setTopic((index) => (index + 1) % topics.length)},
    ],
    {scope: 'screen'},
  );
  useScreenHints('help', [{key: 'up/down', label: 'topic'}]);
  const shortcuts = topic === 0 ? getGlobalKeys(navScreens.length) : scanHints;

  return (
    <ScreenLayout title="Help" description="Scanning and selecting never installs skills.">
      <Box flexDirection={columns >= 80 ? 'row' : 'column'} gap={1}>
        <Box
          flexDirection={columns >= 80 ? 'column' : 'row'}
          width={columns >= 80 ? 22 : undefined}
          flexShrink={0}
          columnGap={2}
          flexWrap="wrap"
        >
          {topics.map((name, index) => (
            <Text
              key={name}
              bold={topic === index}
              color={topic === index ? theme.color.primary : theme.color.muted}
            >
              {topic === index
                ? `${theme.symbols.pointer} ${name}`
                : columns >= 80
                  ? `  ${name}`
                  : name}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Panel title={topics[topic]} compact variant="plain">
            {(topic === 0 || topic === 1) &&
              shortcuts.map((hint) => (
                <Text key={hint.key}>
                  <Kbd>{hint.key}</Kbd> {hint.label}
                </Text>
              ))}
            <Box flexDirection="column" marginTop={topic === 1 ? 1 : 0}>
              {topic === 0 && <Muted>Text fields and confirmations capture shortcuts.</Muted>}
              {topic === 1 && (
                <>
                  <Text>f or / filters by skill ID and source. c clears the filter.</Text>
                  <Text>
                    Hidden selections stay selected. g toggles groups; d searches skill details.
                  </Text>
                  <Text>
                    Enter reviews; choose Yes then Enter to print IDs or commands, or install when
                    Skills CLI execution is enabled.
                  </Text>
                  <Text>Escape or b returns from details/groups. Ctrl+U clears active text.</Text>
                </>
              )}
              {topic === 2 && (
                <>
                  <Text>
                    <Kbd>a</Kbd> Add globally / <Kbd>i</Kbd> Initialize
                  </Text>
                  <Text>
                    <Kbd>r</Kbd> Reload references / <Kbd>enter</Kbd> Details
                  </Text>
                  <Text>
                    In details: v validates local registries, u builds metadata, d removes a
                    reference, b goes back.
                  </Text>
                  <Text>
                    a in local details edits Always recommend skills. Space toggles, / filters, s
                    reviews.
                  </Text>
                  <Muted>
                    Additions go to global config. Removing a reference never deletes registry
                    files. Ctrl+X cancels initialization.
                  </Muted>
                </>
              )}
              {topic === 3 && (
                <>
                  <Text>Up/down selects a section; Enter edits it. Escape returns.</Text>
                  <Text>
                    <Kbd>s</Kbd> Save / <Kbd>d</Kbd> Discard / <Kbd>w</Kbd> Wizard
                  </Text>
                  <Text>Drafts survive tab changes. Preview themes without saving.</Text>
                  <Text>
                    Skills CLI configures project-only commands, target agents and optional
                    execution.
                  </Text>
                  <Text>
                    Execution is off by default and requires selection confirmation. Startup
                    registry checks suggest updates for you to run.
                  </Text>
                  <Muted>NO_COLOR forces mono. --ascii uses ASCII borders and symbols.</Muted>
                </>
              )}
              {topic === 4 && (
                <>
                  <Text>nosey [path] [--explain | --json | --skills-only | --plain]</Text>
                  <Text>nosey scan [path] --depth 8 --max-files 20000</Text>
                  <Text>nosey registry init|list|add|remove|show|validate|refresh</Text>
                  <Text>nosey doctor --json / nosey --setup</Text>
                  <Muted>
                    --no-interactive produces a plain report. Piped output never prompts.
                  </Muted>
                  <Muted>
                    Scan targets are read-only. Installed indicators use project-local files and
                    lock metadata. Partial results show limits, skipped files, or registry warnings.
                  </Muted>
                </>
              )}
            </Box>
          </Panel>
        </Box>
      </Box>
    </ScreenLayout>
  );
}

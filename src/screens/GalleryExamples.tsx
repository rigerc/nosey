import {Box, Text} from 'ink';
import {useState} from 'react';
import {
  Alert,
  Badge,
  Card,
  Confirm,
  Divider,
  EmptyState,
  Heading,
  InlineLayout,
  KeyValue,
  MultiSelect,
  Muted,
  PaginatedList,
  Panel,
  ProgressBar,
  ScreenState,
  SearchSelect,
  Spinner,
  StatusMessage,
  StepperProgress,
  Table,
  Toggle,
  TextField,
  BrandMark,
} from '../components';
import {useKeymap, useTerminalSize} from '../hooks';
import {formatBytes, formatDuration} from '../lib/format';
import {tones} from '../theme/tokens';
import {SetupWizard} from '../demos/SetupWizard';

/** One mounted example at a time. The gallery navigator owns switching. */
export const galleryItems = [
  {id: 'panel', label: 'Panel', hint: 'Bordered container'},
  {id: 'card', label: 'Card', hint: 'Accent container'},
  {id: 'badge', label: 'Badge', hint: 'Status variants'},
  {id: 'status', label: 'StatusMessage', hint: 'Inline feedback'},
  {id: 'alert', label: 'Alert', hint: 'Callout'},
  {id: 'spinner', label: 'Spinner', hint: 'Loading indicator'},
  {id: 'progress', label: 'ProgressBar', hint: 'Progress indicator'},
  {id: 'state', label: 'ScreenState', hint: 'Async result states'},
  {id: 'empty', label: 'EmptyState', hint: 'Empty content'},
  {id: 'keyvalue', label: 'KeyValue', hint: 'Labelled values'},
  {id: 'table', label: 'Table', hint: 'Tabular data'},
  {id: 'stepper-progress', label: 'StepperProgress', hint: 'Step indicator'},
  {id: 'confirm', label: 'Confirm', hint: 'Yes/no decision'},
  {id: 'multi', label: 'MultiSelect', hint: 'Multiple choices'},
  {id: 'search', label: 'SearchSelect', hint: 'Filtered selection'},
  {id: 'toggle', label: 'Toggle', hint: 'Boolean choice'},
  {id: 'pages', label: 'PaginatedList', hint: 'Paged content'},
  {id: 'wizard', label: 'Stepper', hint: 'Interactive wizard'},
  {id: 'typography', label: 'Typography', hint: 'Text and separators'},
  {id: 'text', label: 'TextField', hint: 'Captured text input'},
  {id: 'brand', label: 'BrandMark', hint: 'Nosey identity'},
] as const;

export type GalleryId = (typeof galleryItems)[number]['id'];

const packages = [
  {value: 'ink', label: 'Ink', hint: 'Terminal rendering'},
  {value: 'react', label: 'React', hint: 'Components and hooks'},
  {value: 'typescript', label: 'TypeScript', hint: 'Static types'},
  {value: 'vitest', label: 'Vitest', hint: 'Testing'},
  {value: 'zod', label: 'Zod', hint: 'Validation'},
  {value: 'meow', label: 'Meow', hint: 'CLI flags'},
  {value: 'vite-plus', label: 'Vite+', hint: 'Build tooling'},
];

export function GalleryExample({
  id,
  searchActive,
  onSearchActiveChange,
}: {
  id: GalleryId;
  searchActive: boolean;
  onSearchActiveChange: (active: boolean) => void;
}) {
  const [selected, setSelected] = useState<string[]>(['ink']);
  const [searchValue, setSearchValue] = useState('None');
  const [enabled, setEnabled] = useState(true);
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  const [stateIndex, setStateIndex] = useState(0);
  const {columns} = useTerminalSize();
  const states = ['success', 'loading', 'empty', 'error'] as const;

  useKeymap([{key: 's', run: () => setStateIndex((value) => (value + 1) % states.length)}], {
    isActive: id === 'state',
    scope: 'control',
  });

  switch (id) {
    case 'panel':
      return (
        <Panel title="Panel example" tone="accent" footer="Footers are optional">
          <Text>A themed, bordered container with a title and footer.</Text>
        </Panel>
      );
    case 'card':
      return (
        <Card tone="info">
          <Text>Cards use a colored left edge for lighter grouping.</Text>
        </Card>
      );
    case 'badge':
      return (
        <Box flexDirection="column" gap={1}>
          {(['solid', 'subtle', 'outline'] as const).map((variant) => (
            <Box key={variant} columnGap={1} flexWrap="wrap">
              {tones.map((tone) => (
                <Badge key={tone} tone={tone} variant={variant}>
                  {tone}
                </Badge>
              ))}
            </Box>
          ))}
        </Box>
      );
    case 'status':
      return (
        <Box flexDirection="column">
          <StatusMessage tone="success">Build completed</StatusMessage>
          <StatusMessage tone="warn">Cache is stale</StatusMessage>
          <StatusMessage tone="danger">Request failed</StatusMessage>
          <StatusMessage tone="info">Updates available</StatusMessage>
        </Box>
      );
    case 'alert':
      return (
        <Alert tone="warn" title="Heads up">
          This is a themed alert with a title and an optional message.
        </Alert>
      );
    case 'spinner':
      return <Spinner label="Installing dependencies" />;
    case 'progress':
      return <ProgressBar value={0.65} width={columns < 60 ? 12 : 24} />;
    case 'state':
      return (
        <Box flexDirection="column" gap={1}>
          <ScreenState
            status={states[stateIndex]!}
            title={states[stateIndex] === 'empty' ? 'No queued jobs' : undefined}
            message={
              states[stateIndex] === 'loading'
                ? 'Loading sample results'
                : states[stateIndex] === 'error'
                  ? 'Example failure'
                  : states[stateIndex] === 'success'
                    ? 'All checks passed'
                    : 'Nothing to run'
            }
          />
          <Muted>Press s to cycle success, loading, empty and error.</Muted>
        </Box>
      );
    case 'empty':
      return <EmptyState title="No results" hint="Try a different filter." />;
    case 'keyvalue':
      return (
        <KeyValue
          items={[
            {label: 'Size', value: formatBytes(48_213_000)},
            {label: 'Duration', value: formatDuration(83_400)},
          ]}
        />
      );
    case 'table':
      return (
        <Table
          selected={0}
          columns={[
            {key: 'name', header: 'Package'},
            {key: 'version', header: 'Version', align: 'right'},
            {key: 'status', header: 'Status'},
          ]}
          rows={[
            {name: 'ink', version: '8.0.0', status: {text: 'Ready', tone: 'success'}},
            {name: 'react', version: '19.3.0', status: {text: 'Ready', tone: 'success'}},
          ]}
        />
      );
    case 'stepper-progress':
      return (
        <StepperProgress
          steps={[
            {id: 'install', name: 'Install'},
            {id: 'configure', name: 'Configure'},
            {id: 'finish', name: 'Finish'},
          ]}
          currentStep={1}
        />
      );
    case 'confirm':
      return (
        <Box flexDirection="column">
          <Confirm
            message="Continue with deployment?"
            isActive={confirmed === null}
            onConfirm={setConfirmed}
          />
          {confirmed !== null && <Text>Answer: {confirmed ? 'Yes' : 'No'}</Text>}
          <Muted>Left/right chooses, Enter confirms.</Muted>
        </Box>
      );
    case 'multi':
      return (
        <Box flexDirection="column">
          <MultiSelect
            items={packages.map((item, index) => ({
              ...item,
              group:
                index < 3
                  ? {key: 'stack', label: 'Application stack'}
                  : {key: 'tooling', label: 'Development tools'},
            }))}
            allItems={packages}
            value={selected}
            onChange={setSelected}
            maxVisible={3}
            maxVisibleRows={8}
          />
          <Muted>Arrows move, Space toggles, {selected.length} packages selected.</Muted>
        </Box>
      );
    case 'search':
      return (
        <Box flexDirection="column" gap={1}>
          <SearchSelect
            items={packages}
            isActive={searchActive}
            maxVisible={3}
            onSelect={(value) => {
              setSearchValue(value);
              onSearchActiveChange(false);
            }}
            onCancel={() => onSearchActiveChange(false)}
          />
          <Text>Selected: {searchValue}</Text>
          <Muted>
            {searchActive
              ? 'Type to filter; Enter selects; Escape exits the input.'
              : 'Press Enter to focus search; shortcuts remain available until then.'}
          </Muted>
        </Box>
      );
    case 'toggle':
      return (
        <Box flexDirection="column">
          <Toggle label="Enable caching" value={enabled} onChange={setEnabled} />
          <Muted>Space/Enter toggles, left turns off, right turns on.</Muted>
        </Box>
      );
    case 'pages':
      return (
        <Box flexDirection="column">
          <PaginatedList
            items={packages}
            pageSize={3}
            getKey={(item) => item.value}
            renderItem={(item) => item.label}
          />
          <Muted>Left/right or PageUp/PageDown changes pages.</Muted>
        </Box>
      );
    case 'wizard':
      return (
        <InlineLayout title={<Heading>Setup wizard</Heading>}>
          <SetupWizard />
        </InlineLayout>
      );
    case 'typography':
      return (
        <Box flexDirection="column">
          <Heading>Heading</Heading>
          <Muted>Muted supporting copy</Muted>
          <Divider label="Divider" />
          <Text>Body text</Text>
        </Box>
      );
    case 'text':
      return (
        <Box flexDirection="column">
          <TextField
            label="Example text"
            isActive={searchActive}
            onSubmit={(value) => {
              setSearchValue(value);
              onSearchActiveChange(false);
            }}
            onCancel={() => onSearchActiveChange(false)}
          />
          <Text>Accepted: {searchValue}</Text>
          <Muted>
            {searchActive
              ? 'Type to edit; Enter accepts; Escape returns.'
              : 'Press Enter to focus text input.'}
          </Muted>
        </Box>
      );
    case 'brand':
      return (
        <Box gap={1}>
          <BrandMark bold />
          <Text>nosey / one accent, ASCII mark</Text>
        </Box>
      );
  }
}

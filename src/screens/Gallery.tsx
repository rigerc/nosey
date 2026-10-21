import {Box} from 'ink';
import {
  Alert,
  Badge,
  Divider,
  KeyValue,
  Muted,
  Panel,
  ProgressBar,
  Spinner,
  Stack,
  StatusMessage,
  Table,
  Heading,
  type BadgeVariant,
  Confirm,
  StepperProgress,
} from '../components';
import {CollectionGallery} from '../demos/CollectionGallery';
import {formatBytes, formatDuration} from '../lib/format';
import {tones} from '../theme/tokens';

const variants: BadgeVariant[] = ['solid', 'subtle', 'outline'];

/** Every component and variant in one place: docs + manual QA. Press t to switch themes. */
export function GalleryScreen() {
  return (
    <Stack gap={1}>
      <Panel title="Badges">
        {variants.map((variant) => (
          <Box key={variant} columnGap={1} flexWrap="wrap">
            {tones.map((tone) => (
              <Badge key={tone} tone={tone} variant={variant}>
                {tone}
              </Badge>
            ))}
          </Box>
        ))}
      </Panel>

      <Panel title="Feedback" tone="success">
        <StatusMessage tone="success">Build completed</StatusMessage>
        <StatusMessage tone="warn">Cache is stale</StatusMessage>
        <StatusMessage tone="danger">Request failed</StatusMessage>
        <StatusMessage tone="info">3 updates available</StatusMessage>
        <Divider label="progress" />
        <Spinner label="Installing dependencies" />
        <ProgressBar value={0.65} />
      </Panel>

      <Panel title="Data" tone="info">
        <KeyValue
          items={[
            {label: 'Size', value: formatBytes(48_213_000)},
            {label: 'Duration', value: formatDuration(83_400)},
          ]}
        />
        <Divider />
        <Table
          selected={0}
          columns={[
            {key: 'name', header: 'Package'},
            {key: 'version', header: 'Version', align: 'right'},
            {key: 'status', header: 'Status'},
          ]}
          rows={[
            {name: 'ink', version: '8.0.0', status: {text: 'up to date', tone: 'success'}},
            {name: 'react', version: '19.3.0', status: {text: 'up to date', tone: 'success'}},
            {
              name: 'a-very-long-package-name-that-needs-truncating',
              version: '1.2.3',
              status: {text: 'outdated', tone: 'warn'},
            },
          ]}
        />
      </Panel>

      <Panel title="Stepper progress">
        <StepperProgress
          steps={[
            {id: 'install', name: 'Install'},
            {id: 'configure', name: 'Configure'},
            {id: 'done', name: 'Done'},
          ]}
          currentStep={1}
        />
        <Divider label="vertical" />
        <StepperProgress
          steps={[
            {id: 'first', name: 'First'},
            {id: 'second', name: 'Second'},
          ]}
          currentStep={1}
          orientation="vertical"
        />
      </Panel>

      <Panel title="Confirm" footer="Static example; press w to open the interactive wizard">
        <Confirm message="Continue with deployment?" onConfirm={() => {}} isActive={false} />
      </Panel>

      <CollectionGallery />

      <Alert tone="warn" title="Heads up">
        <Muted>Alerts carry a title and optional body.</Muted>
      </Alert>
      <Heading tone="muted">End of gallery</Heading>
    </Stack>
  );
}

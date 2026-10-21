import {useEffect, useState} from 'react';
import {resolve} from 'node:path';
import {Text} from 'ink';
import {
  Confirm,
  Muted,
  Panel,
  ScreenLayout,
  Select,
  Spinner,
  Stack,
  StatusMessage,
  Step,
  Stepper,
  TextField,
  type StepContext,
} from '../components';
import {useRegistryInitOptions} from '../features/registry/context';
import {useScan} from '../features/skills/context';
import {useScreenHints} from '../features/ui/context';
import {useInputCapture, useKeymap, useRouter} from '../hooks';
import {runRegistryInit, validateRegistryId} from '../lib/registry/init';

export function RegistrySetupScreen() {
  const original = useRegistryInitOptions();
  const {config} = useScan();
  const router = useRouter();
  const [directory, setDirectory] = useState(
    original.directory ? resolve(original.directory) : resolve(config.root, 'my-skills-registry'),
  );
  const [registryId, setRegistryId] = useState(original.registryId ?? '');
  const [git, setGit] = useState(original.git ?? true);
  const [github, setGithub] = useState(original.github ?? false);
  const [visibility, setVisibility] = useState<'private' | 'public'>(
    original.visibility ?? 'private',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');
  useInputCapture(!created);
  useKeymap([{key: 'ctrl+x', run: () => router.replace('registry')}], {
    scope: 'screen',
    isActive: !busy,
    allowWhenCaptured: true,
  });
  useScreenHints(
    'registry-setup',
    busy
      ? []
      : created
        ? [{key: 'enter', label: 'return to registries'}]
        : [
            {key: 'enter', label: 'continue'},
            {key: 'esc', label: 'back'},
            {key: 'ctrl+x', label: 'cancel'},
          ],
  );
  const failed = (reason: unknown) =>
    setError(reason instanceof Error ? reason.message : String(reason));
  return (
    <ScreenLayout
      title="Initialize registry"
      description="Review every write before creating files"
    >
      <Panel title={created ? 'Registry created' : 'New registry'}>
        {error && <StatusMessage tone="danger">{error}</StatusMessage>}
        {busy && <Spinner label="Creating registry..." />}
        {created ? (
          <Stack gap={1}>
            <StatusMessage tone="success">{created}</StatusMessage>
            <Select
              items={[{value: 'return', label: 'Return to Registries'}]}
              onSelect={() => router.replace('registry')}
            />
          </Stack>
        ) : (
          <Stepper
            keyboardNav={false}
            onError={failed}
            onCancel={() => router.replace('registry')}
            onComplete={() => {}}
          >
            <Step name="Destination">
              {(step: StepContext) => (
                <TextField
                  key="dir"
                  label="Directory"
                  initialValue={directory}
                  isActive={!busy}
                  onCancel={step.cancel}
                  onSubmit={(value) => {
                    if (!value) {
                      setError('Directory is required.');
                      return;
                    }
                    setDirectory(resolve(config.root, value));
                    setError('');
                    void step.goNext();
                  }}
                />
              )}
            </Step>
            <Step name="Identity">
              {(step: StepContext) => (
                <TextField
                  key="id"
                  label="Owner/repository"
                  initialValue={registryId}
                  isActive={!busy}
                  onCancel={() => void step.goBack()}
                  onSubmit={(value) => {
                    try {
                      validateRegistryId(value);
                      setRegistryId(value);
                      setError('');
                      void step.goNext();
                    } catch (reason) {
                      failed(reason);
                    }
                  }}
                />
              )}
            </Step>
            <Step name="Local Git">
              {(step: StepContext) => (
                <WizardChoice
                  message="Initialize a local Git repository?"
                  value={git}
                  step={step}
                  change={(answer) => {
                    setGit(answer);
                    if (!answer) setGithub(false);
                  }}
                />
              )}
            </Step>
            {git && (
              <Step name="GitHub">
                {(step: StepContext) => (
                  <WizardChoice
                    message="Create and push a GitHub repository via gh?"
                    value={github}
                    step={step}
                    change={setGithub}
                  />
                )}
              </Step>
            )}
            {git && github && (
              <Step name="Visibility">
                {(step: StepContext) => (
                  <Visibility
                    current={visibility}
                    back={() => void step.goBack()}
                    choose={(value) => {
                      setVisibility(value);
                      void step.goNext();
                    }}
                  />
                )}
              </Step>
            )}
            <Step
              name="Review"
              canProceed={async () => {
                setBusy(true);
                setError('');
                try {
                  const result = await runRegistryInit(
                    {
                      directory,
                      registryId,
                      git,
                      github: git && github,
                      visibility: git && github ? visibility : undefined,
                      yes: true,
                    },
                    {interactive: false},
                  );
                  setCreated(
                    `Created ${result.registryId} at ${result.directory}. Git: ${result.gitInitialized ? 'initialized' : 'not requested'}. GitHub: ${result.githubCreated ? 'created' : 'not requested'}.`,
                  );
                  return true;
                } catch (reason) {
                  failed(reason);
                  return false;
                } finally {
                  setBusy(false);
                }
              }}
            >
              {(step: StepContext) => (
                <Stack gap={1}>
                  <Text>Directory: {directory}</Text>
                  <Text>Registry: {registryId}</Text>
                  <Text>Local Git: {git ? 'yes' : 'no'}</Text>
                  <Text>GitHub: {git && github ? visibility : 'no'}</Text>
                  <Muted>
                    Creates registry files. GitHub is created and pushed only when explicitly
                    enabled above.
                  </Muted>
                  <Confirm
                    message="Create this registry?"
                    isActive={!busy && !step.isValidating}
                    onCancel={() => void step.goBack()}
                    onConfirm={(answer) => {
                      if (answer) void step.goNext();
                      else void step.goBack();
                    }}
                  />
                </Stack>
              )}
            </Step>
          </Stepper>
        )}
      </Panel>
    </ScreenLayout>
  );
}
function WizardChoice({
  message,
  value,
  step,
  change,
}: {
  message: string;
  value: boolean;
  step: StepContext;
  change: (value: boolean) => void;
}) {
  const [advance, setAdvance] = useState(false);
  // Conditional GitHub/visibility steps must commit before Stepper chooses the next step.
  useEffect(() => {
    if (advance) {
      setAdvance(false);
      void step.goNext();
    }
  }, [advance, step]);
  return (
    <Confirm
      message={message}
      defaultValue={value}
      isActive={!step.isValidating}
      onCancel={() => void step.goBack()}
      onConfirm={(answer) => {
        change(answer);
        setAdvance(true);
      }}
    />
  );
}
function Visibility({
  current,
  back,
  choose,
}: {
  current: 'private' | 'public';
  back: () => void;
  choose: (value: 'private' | 'public') => void;
}) {
  useKeymap([{key: 'esc', run: back}], {scope: 'screen', allowWhenCaptured: true});
  return (
    <Select
      allowWhenCaptured
      items={[
        {value: 'private', label: 'Private'},
        {value: 'public', label: 'Public'},
      ]}
      initialValue={current}
      onSelect={choose}
    />
  );
}

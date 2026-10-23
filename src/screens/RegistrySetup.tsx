import {useEffect, useRef, useState} from 'react';
import {resolve} from 'node:path';
import {Text} from 'ink';
import {
  Alert,
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
import {suggestRegistryId} from '../lib/registry/suggest';
import {useScan} from '../features/skills/context';
import {useScreenHints} from '../features/ui/context';
import {useInputCapture, useKeymap, useRouter} from '../hooks';
import {
  RegistryInitError,
  runRegistryInit,
  validateRegistryDestination,
  validateRegistryId,
} from '../lib/registry/init';

export function RegistrySetupScreen() {
  const original = useRegistryInitOptions();
  const {config} = useScan();
  const router = useRouter();

  const [directory, setDirectory] = useState(
    original.directory ? resolve(original.directory) : resolve(config.root, 'my-skills-registry'),
  );

  const [registryId, setRegistryId] = useState(original.registryId ?? '');
  const suggestedId = useRef<string | undefined>(undefined);
  const [git, setGit] = useState(original.git ?? true);
  const [github, setGithub] = useState(original.github ?? false);

  const [visibility, setVisibility] = useState<'private' | 'public'>(
    original.visibility ?? 'private',
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{message: string; warning?: string}>();
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

  const failed = (cause: unknown) =>
    setError(cause instanceof Error ? cause.message : String(cause));

  return (
    <ScreenLayout
      title="Initialize registry"
      description="Review every write before creating files"
    >
      <Panel
        title={
          created?.warning ? 'Setup incomplete' : created ? 'Registry created' : 'New registry'
        }
      >
        {error && <StatusMessage tone="danger">{error}</StatusMessage>}
        {busy && <Spinner label="Creating registry..." />}
        {created ? (
          <Stack gap={1}>
            {created.warning ? (
              <Alert tone="warn" title="Setup incomplete">
                {created.warning}
              </Alert>
            ) : (
              <StatusMessage tone="success">{created.message}</StatusMessage>
            )}
            {created.warning && <Text>{created.message}</Text>}
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
                  onSubmit={async (value) => {
                    if (!value) {
                      setError('Directory is required.');

                      return;
                    }

                    setBusy(true);

                    try {
                      const destination = resolve(config.root, value);
                      await validateRegistryDestination(destination);
                      setDirectory(destination);

                      if (!registryId || registryId === suggestedId.current) {
                        const suggestion = await suggestRegistryId(destination);
                        suggestedId.current = suggestion;
                        setRegistryId(suggestion ?? '');
                      }

                      setError('');
                      await step.goNext();
                    } catch (reason) {
                      failed(reason);
                    } finally {
                      setBusy(false);
                    }
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
                    message="Create a GitHub repository from the Nosey template?"
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

                  setCreated({
                    message: `Created ${result.registryId} at ${result.directory}. Git: ${result.gitInitialized ? 'initialized' : 'not requested'}. GitHub: ${result.githubCreated ? 'created; identity pushed' : 'not requested'}.${result.templateCommit ? ' Template commit: ' + result.templateCommit : ''}`,
                  });

                  return true;
                } catch (reason) {
                  if (reason instanceof RegistryInitError) {
                    setCreated({
                      message: `GitHub: ${reason.result.creationStatus ?? (reason.result.githubCreated ? 'created' : 'not requested')}. Clone: ${reason.result.cloneCompleted ? 'complete' : 'incomplete'}. Configuration: ${reason.result.configured ? 'complete' : 'incomplete'}. Push: ${reason.result.pushCompleted ? 'complete' : 'incomplete'}. Follow the recovery instructions above.`,
                      warning: reason.message,
                    });

                    return true;
                  }

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
                    Downloads the Nosey registry template and requires network access, including
                    without Git. With GitHub enabled, the remote is created before local setup; a
                    later failure keeps the remote and any useful clone for recovery.
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

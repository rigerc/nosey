import {useState} from 'react';
import {Text} from 'ink';
import {Confirm, Muted, Panel, Spinner, Stack, StatusMessage, Step, Stepper, TextField, type StepContext} from '../components';
import {useRegistryInitOptions} from '../features/registry/context';
import {useRouter} from '../hooks/useRouter';
import {runRegistryInit, validateRegistryId} from '../lib/registry/init.js';

export function RegistrySetupScreen() {
  const original = useRegistryInitOptions();
  const router = useRouter();
  const [directory, setDirectory] = useState(original.directory ?? './my-skills-registry');
  const [registryId, setRegistryId] = useState(original.registryId ?? '');
  const [git, setGit] = useState(original.git ?? true);
  const [github, setGithub] = useState(original.github ?? false);
  const [visibility, setVisibility] = useState<'private' | 'public'>(original.visibility ?? 'private');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');
  if (created) return <Panel title="Registry created">
    <StatusMessage tone="success">{created}</StatusMessage>
    <Muted>Press Tab to navigate to the Registry screen.</Muted>
  </Panel>;
  return <Stack gap={1}>
    <Panel title="Initialize a skill registry" footer="enter next · esc back or cancel">
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {busy && <Spinner label="Creating registry..." />}
      <Stepper keyboardNav={false} onError={(reason) => {
        setBusy(false);
        setError(reason instanceof Error ? reason.message : String(reason));
      }} onCancel={() => router.replace('registry')} onComplete={() => {}}>
        <Step name="Destination">
          {(step: StepContext) => <TextField key="dir" label="Directory" initialValue={directory}
            onCancel={step.cancel}
            onSubmit={(value) => { if (value) {setDirectory(value); void step.goNext();} else setError('Directory is required.'); }} />}
        </Step>
        <Step name="Registry ID">
          {(step: StepContext) => <TextField key="id" label="Owner/repository" initialValue={registryId}
            onCancel={() => void step.goBack()}
            onSubmit={(value) => {
              try {validateRegistryId(value); setRegistryId(value); setError(''); void step.goNext();}
              catch (reason) {setError(reason instanceof Error ? reason.message : String(reason));}
            }} />}
        </Step>
        <Step name="Git">
          {(step: StepContext) => <Confirm message="Initialize a local Git repository?" defaultValue={git}
            onConfirm={(answer) => {setGit(answer); if (!answer) setGithub(false); void step.goNext();}} />}
        </Step>
        <Step name="GitHub">
          {(step: StepContext) => <Confirm message="Create a private GitHub repository via gh?"
            defaultValue={github && git}
            onConfirm={(answer) => {
              if (answer && !git) {setError('GitHub creation requires Git.'); return;}
              setGithub(answer);
              setVisibility('private');
              void step.goNext();
            }} />}
        </Step>
        <Step name="Review" canProceed={async () => {
          setBusy(true); setError('');
          try {
            const result = await runRegistryInit({
              directory, registryId, git, github,
              visibility: github ? visibility : undefined,
              yes: true,
            }, {interactive: false});
            setCreated('Created ' + result.registryId + ' at ' + result.directory);
            return true;
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
            return false;
          } finally {setBusy(false);}
        }}>
          {(step: StepContext) => <>
            <Text>Directory: {directory}</Text>
            <Text>Registry: {registryId}</Text>
            <Text>Initialize Git: {git ? 'yes' : 'no'}</Text>
            <Text>Create GitHub repository: {github ? 'private' : 'no'}</Text>
            <Confirm message="Create this registry?" onConfirm={(answer) => {
              if (answer) void step.goNext();
              else void step.goBack();
            }} />
          </>}
        </Step>
      </Stepper>
    </Panel>
  </Stack>;
}

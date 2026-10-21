import {Text} from 'ink';
import {BrandMark, Muted, Panel, Spinner, Stack, StatusMessage} from '../components';
import {useKeymap} from '../hooks/useKeymap';
import {useRouter} from '../hooks/useRouter';
import {useScan} from '../features/skills/context';

export function HomeScreen() {
  const {config, state, refresh} = useScan();
  const router = useRouter();
  useKeymap([
    {key: 'enter', run: () => { if (state.status === 'ready') router.push('skills'); }},
    {key: 'r', run: refresh},
  ]);
  return <Stack gap={1}>
    <Panel title={<><BrandMark bold /> Project detection</>} tone="accent"
      footer="r rescan · enter browse skills">
      <Text wrap="truncate-middle">{config.root}</Text>
      {state.status === 'loading' && <Spinner label="Scanning project..." />}
      {state.status === 'error' && <StatusMessage tone="danger">{state.message}</StatusMessage>}
      {state.status === 'ready' && <>
        <Text>Scanned {state.report.scannedFiles} files{state.report.truncated ? ' (scan limit reached)' : ''}</Text>
        <Text>{state.report.summary.technologies} technologies · {state.report.summary.combinations} combinations · {state.report.summary.suggestedSkills} suggested skills</Text>
        {state.report.technologies.slice(0, 9).map((tech) =>
          <Text key={tech.id}>• {tech.name}{tech.skills.length ? '' : ' (no mapped skills)'}</Text>)}
        {state.report.technologies.length > 9 && <Muted>More technologies are included in the report.</Muted>}
        {state.report.registryWarnings?.map((warning, i) =>
          <StatusMessage key={i} tone="warn">{warning.source}: {warning.message}</StatusMessage>)}
        <Muted>Suggestions only; scanning never installs skills.</Muted>
      </>}
    </Panel>
  </Stack>;
}

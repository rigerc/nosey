import {useMemo, useState} from 'react';
import {Text, useApp} from 'ink';
import {Confirm, MultiSelect, Muted, Panel, SearchSelect, Select, Spinner, Stack, StatusMessage} from '../components';
import {useScan} from '../features/skills/context';
import {deriveSkillGroups, orderedSelection} from '../features/skills/groups';
import {useKeymap} from '../hooks/useKeymap';
import {useRouter} from '../hooks/useRouter';

type Mode = 'browse' | 'groups' | 'search' | 'detail-pick' | 'detail' | 'review' | 'done';

export function SkillBrowserScreen() {
  const {state, config, confirm} = useScan();
  const {exit} = useApp();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('browse');
  const [selected, setSelected] = useState<string[]>([]);
  const [detailId, setDetailId] = useState('');
  const report = state.status === 'ready' ? state.report : undefined;
  const groups = useMemo(() => report ? deriveSkillGroups(report) : [], [report]);
  const items = useMemo(() => (report?.skills ?? []).map((skill) => ({
    value: skill.id,
    label: skill.id,
    hint: skill.sources.map((source) => source.name).join(', '),
  })), [report]);
  const chosen = report ? orderedSelection(report, new Set(selected)) : [];
  const toggle = (id: string) =>
    setSelected((current) => current.includes(id)
      ? current.filter((value) => value !== id) : [...current, id]);
  useKeymap([
    {key: 'b', run: () => mode === 'browse' ? router.pop() : setMode('browse')},
    {key: 'f', run: () => setMode('search')},
    {key: 'g', run: () => setMode('groups')},
    {key: 'd', run: () => setMode('detail-pick')},
    {key: 'enter', run: () => { if (mode === 'browse' && items.length === 0) setMode('review'); }},
  ], {isActive: mode === 'browse' || mode === 'groups' || mode === 'detail'});
  if (state.status === 'loading') return <Spinner label="Scanning project..." />;
  if (state.status === 'error') return <StatusMessage tone="danger">{state.message}</StatusMessage>;
  if (!report) return null;
  const picker = items.length ? items : [];
  const detail = report.skills.find((skill) => skill.id === detailId);
  return <Stack gap={1}>
    <Panel title="Skill selection" footer="space toggle · enter review · f filter · g groups · d detail · b back">
      <Text>{selected.length} of {report.skills.length} unique skills selected</Text>
      {mode === 'browse' && <MultiSelect
        items={picker}
        value={selected}
        onChange={setSelected}
        onSubmit={() => setMode('review')}
        emptyMessage="No matching skills detected in this project."
        maxVisible={12}
      />}
      {mode === 'groups' && <>
        <Muted>Enter toggles every skill matched by a group. Press b to return.</Muted>
        {groups.length === 0 ? <Muted>No skill groups were detected.</Muted> : <Select items={groups.map((group) => ({
          value: group.key, label: group.title,
          hint: String(group.skillIds.filter((id) => selected.includes(id)).length) + '/' + group.skillIds.length,
        }))} onSelect={(key) => {
          const group = groups.find((entry) => entry.key === key);
          if (!group) return;
          const old = new Set(selected);
          const allSelected = group.skillIds.every((id) => old.has(id));
          for (const id of group.skillIds) {
            if (allSelected) old.delete(id);
            else old.add(id);
          }
          setSelected([...old]);
        }} />}
      </>}
      {(mode === 'search' || mode === 'detail-pick') && <SearchSelect
        items={picker}
        maxVisible={12}
        placeholder="Find by skill ID or detected technology..."
        onSelect={(id) => {
          if (mode === 'search') { toggle(id); setMode('browse'); }
          else { setDetailId(id); setMode('detail'); }
        }}
        onCancel={() => setMode('browse')}
      />}
      {mode === 'detail' && <>
        <Text bold>{detail?.id}</Text>
        {detail?.sources.map((source) => <Text key={source.type + source.id}>
          {source.type}: {source.name}
        </Text>)}
        {config.explain && <Muted>Detection evidence is available in the report with --explain.</Muted>}
        <Muted>b back · f filter · g groups</Muted>
      </>}
      {mode === 'review' && <>
        <Text bold>Review selection</Text>
        {chosen.length === 0 ? <Muted>No skills selected.</Muted> :
          chosen.map((id) => <Text key={id}>• {id}</Text>)}
        <Confirm message="Confirm these skill IDs and exit?" onConfirm={(yes) => {
          if (yes) {
            confirm(chosen);
            setMode('done');
            exit();
          } else setMode('browse');
        }} />
      </>}
      {mode === 'done' && <Muted>Selection confirmed.</Muted>}
    </Panel>
  </Stack>;
}

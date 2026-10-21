import {useEffect, useMemo, useState} from 'react';
import {Text, useApp} from 'ink';
import {
  BrandMark, Confirm, MultiSelect, Muted, Panel, SearchSelect,
  Select, Spinner, Stack, StatusMessage, TextField,
} from '../components';
import {useScan} from '../features/skills/context';
import {filterSkills} from '../features/skills/filter';
import {deriveSkillGroups, orderedSelection} from '../features/skills/groups';
import {useHasInputCapture} from '../hooks/useInputCapture';
import {useKeymap} from '../hooks/useKeymap';

type Mode = 'browse' | 'filter' | 'groups' | 'detail-pick' | 'detail' | 'review';

/** Scan results and skill selection share one screen and one selection state. */
export function HomeScreen() {
  const {config, state, refresh, confirm} = useScan();
  const {exit} = useApp();
  const inputCaptured = useHasInputCapture();
  const [mode, setMode] = useState<Mode>('browse');
  const [filter, setFilter] = useState('');
  const [previousFilter, setPreviousFilter] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [detailId, setDetailId] = useState('');
  const report = state.status === 'ready' ? state.report : undefined;

  const allItems = useMemo(() => (report?.skills ?? []).map((skill) => ({
    value: skill.id,
    label: skill.id,
    hint: skill.sources.map((source) => source.name).join(', '),
  })), [report]);
  const visibleIds = useMemo(
    () => new Set(filterSkills(report?.skills ?? [], filter).map((skill) => skill.id)),
    [report, filter],
  );
  const visibleItems = useMemo(
    () => allItems.filter((item) => visibleIds.has(item.value)),
    [allItems, visibleIds],
  );
  const groups = useMemo(() => report ? deriveSkillGroups(report) : [], [report]);
  const chosen = report ? orderedSelection(report, new Set(selected)) : [];
  const detail = report?.skills.find((skill) => skill.id === detailId);

  // A new scan invalidates the previous project's selections and filter.
  useEffect(() => {
    setSelected([]);
    setFilter('');
    setMode('browse');
    setDetailId('');
  }, [report]);

  const beginFilter = () => {
    setPreviousFilter(filter);
    setMode('filter');
  };
  useKeymap([
    {key: 'r', run: refresh},
    {key: 'f', run: () => { if (report) beginFilter(); }},
    {key: '/', run: () => { if (report) beginFilter(); }},
    {key: 'g', run: () => { if (report) setMode('groups'); }},
    {key: 'd', run: () => { if (report && report.skills.length > 0) setMode('detail-pick'); }},
    {key: 'c', run: () => setFilter('')},
    // MultiSelect doesn't submit when its filtered list is empty.
    {key: 'enter', run: () => { if (report && visibleItems.length === 0) setMode('review'); }},
  ], {isActive: mode === 'browse' && !inputCaptured});
  useKeymap([
    {key: 'esc', run: () => setMode('browse')},
    {key: 'b', run: () => setMode('browse')},
  ], {isActive: (mode === 'groups' || mode === 'detail') && !inputCaptured});

  return <Stack gap={1}>
    <Panel title={<><BrandMark bold /> Project scan</>} tone="accent"
      footer={mode === 'browse' ? 'r rescan' : undefined}>
      <Text wrap="truncate-middle">{config.root}</Text>
      {state.status === 'loading' && <Spinner label="Scanning project..." />}
      {state.status === 'error' && <StatusMessage tone="danger">{state.message}</StatusMessage>}
      {report && <>
        <Text>
          Scanned {report.scannedFiles} files{report.truncated ? ' (limit reached)' : ''}
        </Text>
        <Text>{report.technologies.length} technologies · {report.combinations.length} combinations · {report.skills.length} suggested skills</Text>
        <Text wrap="truncate-end">
          Technologies: {report.technologies.map((tech) => tech.name).join(', ') || 'none'}
        </Text>
        {report.combinations.length > 0 && <Text wrap="truncate-end">
          Combinations: {report.combinations.map((combo) => combo.name).join(', ')}
        </Text>}
        {report.skippedFiles.length > 0 &&
          <Muted>{report.skippedFiles.length} skipped files (detection may be incomplete)</Muted>}
        {report.registryWarnings?.map((warning, index) =>
          <StatusMessage key={index} tone="warn">{warning.source}: {warning.message}</StatusMessage>)}
      </>}
    </Panel>
    {report && <Panel title="Suggested skills"
      footer={mode === 'browse'
        ? '↑↓ move · space select · enter review · / or f filter · c clear · g groups · d details'
        : mode === 'filter' ? 'type to filter · enter return to list · esc cancel'
          : mode === 'groups' || mode === 'detail' ? 'b or esc back' : undefined}>
      <Text>{chosen.length} of {report.skills.length} unique skills selected</Text>
      {filter && <Muted>Filter: {filter} ({visibleItems.length} matches) · c to clear</Muted>}
      {mode === 'filter' && <TextField
        label="Filter skills"
        value={filter}
        onChange={setFilter}
        placeholder="type a skill or technology..."
        onSubmit={() => setMode('browse')}
        onCancel={() => { setFilter(previousFilter); setMode('browse'); }}
      />}
      {(mode === 'browse' || mode === 'filter') && <MultiSelect
        items={visibleItems}
        allItems={allItems}
        value={selected}
        isActive={mode === 'browse'}
        onChange={setSelected}
        onSubmit={() => setMode('review')}
        emptyMessage={report.skills.length === 0
          ? 'No mapped skills found.'
          : 'No skills match this filter. Press f to edit or c to clear.'}
        maxVisible={12}
      />}
      {mode === 'groups' && <>
        <Muted>Enter toggles all suggestions for the selected technology or combination.</Muted>
        {groups.length === 0
          ? <Muted>No skill groups were detected.</Muted>
          : <Select items={groups.map((group) => ({
            value: group.key,
            label: group.title,
            hint: group.skillIds.filter((id) => selected.includes(id)).length + '/' + group.skillIds.length,
          }))} onSelect={(key) => {
            const group = groups.find((item) => item.key === key);
            if (!group) return;
            const updated = new Set(selected);
            const all = group.skillIds.every((id) => updated.has(id));
            for (const id of group.skillIds) {
              if (all) updated.delete(id);
              else updated.add(id);
            }
            setSelected(report.skills.filter((skill) => updated.has(skill.id)).map((skill) => skill.id));
          }} />}
      </>}
      {mode === 'detail-pick' && <SearchSelect
        items={allItems}
        placeholder="Find a skill to inspect..."
        onSelect={(id) => { setDetailId(id); setMode('detail'); }}
        onCancel={() => setMode('browse')}
        maxVisible={10}
      />}
      {mode === 'detail' && detail && <>
        <Text bold wrap="truncate-end">{detail.id}</Text>
        {detail.sources.map((source) => {
          const evidence = source.type === 'technology'
            ? report.technologies.find((tech) => tech.id === source.id)?.evidence ?? []
            : source.type === 'combination'
              ? report.technologies.filter((tech) =>
                  report.combinations.find((combo) => combo.id === source.id)?.requires.includes(tech.id))
                .flatMap((tech) => tech.evidence)
              : [];
          return <Stack key={source.type + source.id}>
            <Text>{source.type}: {source.name}</Text>
            {(config.explain ? evidence : evidence.slice(0, 2)).map((reason, index) =>
              <Muted key={index}>• {reason}</Muted>)}
            {!config.explain && evidence.length > 2 && <Muted>Use --explain for full evidence.</Muted>}
          </Stack>;
        })}
      </>}
      {mode === 'review' && <>
        <Text bold>Review selection</Text>
        {chosen.length === 0 ? <Muted>No skills selected.</Muted>
          : chosen.map((id) => <Text key={id} wrap="truncate-end">• {id}</Text>)}
        <Confirm message="Confirm these skill IDs and exit?" onConfirm={(yes) => {
          if (yes) {
            confirm(chosen);
            exit();
          } else setMode('browse');
        }} />
      </>}
      <Muted>Suggestions only — no skills were installed.</Muted>
    </Panel>}
  </Stack>;
}

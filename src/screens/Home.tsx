import {useEffect, useMemo, useState} from 'react';
import {Text, useApp} from 'ink';
import {
  BrandMark, Confirm, MultiSelect, Muted, Panel,
  Select, Spinner, Stack, StatusMessage, TextField,
} from '../components';
import {useScan} from '../features/skills/context';
import {filterSkills} from '../features/skills/filter';
import {deriveSkillGroups, orderedSelection} from '../features/skills/groups';
import {useHasInputCapture} from '../hooks/useInputCapture';
import {useKeymap} from '../hooks/useKeymap';

type Mode = 'browse' | 'filter' | 'groups' | 'detail' | 'review';

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
  const groups = useMemo(() => report ? deriveSkillGroups(report) : [], [report]);
  // A skill can appear in several technology groups with one shared checked state.
  const groupedItems = useMemo(() => {
    const byId = new Map(allItems.map((item) => [item.value, item]));
    const assigned = new Set<string>();
    const rows = groups.flatMap((group) => {
      const matching = group.skillIds.filter((id) => visibleIds.has(id));
      for (const id of matching) assigned.add(id);
      return matching.flatMap((id) => {
        const skill = byId.get(id);
        return skill ? [{
          value: skill.value,
          label: skill.label,
          group: {key: group.key, label: group.title + ' (' + matching.length + ')'},
        }] : [];
      });
    });
    // Unmapped custom-registry suggestions still need a home.
    const remaining = allItems.filter((item) => visibleIds.has(item.value) && !assigned.has(item.value));
    rows.push(...remaining.map((item) => ({
      value: item.value,
      label: item.label,
      group: {key: 'other', label: 'Other suggestions (' + remaining.length + ')'},
    })));
    return rows;
  }, [groups, allItems, visibleIds]);
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
    // Search uses only '/', so letter shortcuts cannot accidentally open it.
    {key: '/', run: () => { if (report) beginFilter(); }},
    {key: 'g', run: () => { if (report) setMode('groups'); }},
    {key: 'c', run: () => setFilter('')},
    // MultiSelect doesn't submit when its filtered list is empty.
    {key: 'enter', run: () => { if (report && groupedItems.length === 0) setMode('review'); }},
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
        <Muted>Detected technologies</Muted>
        {report.technologies.length === 0 && <Muted>None found</Muted>}
        {report.technologies.slice(0, 4).map((tech) =>
          <Text key={tech.id} wrap="truncate-end">
            • {tech.name}{tech.skills.length === 0 ? ' (no mapped skills)' : ''}
          </Text>)}
        {report.technologies.length > 4 &&
          <Muted>+{report.technologies.length - 4} more detected technologies</Muted>}
        {report.combinations.length > 0 && <>
          <Muted>Matching combinations</Muted>
          {report.combinations.slice(0, 2).map((combo) =>
            <Text key={combo.id} wrap="truncate-end">• {combo.name}</Text>)}
          {report.combinations.length > 2 &&
            <Muted>+{report.combinations.length - 2} more combinations</Muted>}
        </>}
        {report.skippedFiles.length > 0 &&
          <Muted>{report.skippedFiles.length} skipped files (detection may be incomplete)</Muted>}
        {report.registryWarnings?.map((warning, index) =>
          <StatusMessage key={index} tone="warn">{warning.source}: {warning.message}</StatusMessage>)}
      </>}
    </Panel>
    {report && <Panel title="Suggested skills"
      footer={mode === 'browse'
        ? '↑↓ move · space select · enter review · / search · c clear · g groups · d details'
        : mode === 'filter' ? 'type to filter · enter return to list · esc cancel'
          : mode === 'groups' || mode === 'detail' ? 'b or esc back' : undefined}>
      <Text>{chosen.length} of {report.skills.length} unique skills selected</Text>
      {filter && <Muted>Filter: {filter} ({visibleIds.size} matches) · c to clear</Muted>}
      {mode === 'filter' && <TextField
        label="Filter skills"
        value={filter}
        onChange={setFilter}
        placeholder="type a skill or technology..."
        onSubmit={() => setMode('browse')}
        onCancel={() => { setFilter(previousFilter); setMode('browse'); }}
      />}
      {(mode === 'browse' || mode === 'filter') && <MultiSelect
        items={groupedItems}
        allItems={allItems}
        value={selected}
        isActive={mode === 'browse'}
        onChange={setSelected}
        onInspect={(id) => { setDetailId(id); setMode('detail'); }}
        onSubmit={() => setMode('review')}
        emptyMessage={report.skills.length === 0
          ? 'No mapped skills found.'
          : 'No skills match this filter. Press / to edit or c to clear.'}
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

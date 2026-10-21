import {useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp} from 'ink';
import {
  Badge,
  Confirm,
  MultiSelect,
  Muted,
  PaginatedList,
  Panel,
  ScreenLayout,
  ScreenState,
  SearchSelect,
  Select,
  Stack,
  StatusMessage,
  TextField,
} from '../components';
import {useScan} from '../features/skills/context';
import {generateInstallCommands, installationLabel} from '../features/skills/install';
import {filterSkills} from '../features/skills/filter';
import {deriveSkillGroups, orderedSelection, selectedInGroup} from '../features/skills/groups';
import {useScreenHints, useUiAction} from '../features/ui/context';
import {useKeymap, useTerminalSize} from '../hooks';
import {useTheme} from '../theme/context';

type Mode = 'browse' | 'filter' | 'groups' | 'search' | 'detail' | 'review';
export const scanHints = [
  {key: 'space', label: 'select'},
  {key: 'enter', label: 'review'},
  {key: 'up/down', label: 'move'},
  {key: '/', label: 'filter'},
  {key: 'd', label: 'details'},
  {key: 'g', label: 'groups'},
  {key: 'r', label: 'rescan'},
];

export function HomeScreen() {
  const {config, scan, refresh, confirm, installSettings} = useScan();
  const {exit} = useApp();
  const {rows} = useTerminalSize();
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('browse');
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [previousFilter, setPreviousFilter] = useState('');
  const [cursor, setCursor] = useState(0);
  const [detailId, setDetailId] = useState('');
  const [notice, setNotice] = useState('');
  const report = scan.status === 'success' ? scan.data : undefined;
  const visible = useMemo(() => filterSkills(report?.skills ?? [], filter), [report, filter]);
  const groups = useMemo(() => (report ? deriveSkillGroups(report) : []), [report]);
  const defaultAgents = installSettings.defaultAgents ?? [];
  const statusAgents = defaultAgents.length ? defaultAgents : (report?.inspectedAgents ?? []);
  const allItems = useMemo(
    () => (report?.skills ?? []).map((skill) => {
      const label = installationLabel(skill.installation, statusAgents);
      return {value: skill.id, label: skill.id + (label ? ' [' + label + ']' : '')};
    }),
    [report, statusAgents.join(',')],
  );
  const chosen = report ? orderedSelection(report, new Set(selected)) : [];
  const installPlan = installSettings.enabled
    ? generateInstallCommands(chosen, report?.skills ?? [], defaultAgents, config.root)
    : undefined;
  const groupedItems = useMemo(() => {
    const matches = new Set(visible.map((skill) => skill.id));
    const assigned = new Set<string>();
    const byId = new Map(allItems.map((item) => [item.value, item]));
    const checked = new Set(selected);
    const items = groups.flatMap((group) => {
      const heading = {
        key: group.key,
        label: `${group.title}  ${selectedInGroup(group, checked)}/${group.skillIds.length}`,
      };
      return group.skillIds.flatMap((id) => {
        const item = byId.get(id);
        if (!item || !matches.has(id)) return [];
        assigned.add(id);
        return [{...item, group: heading}];
      });
    });
    return [
      ...items,
      ...allItems
        .filter((item) => matches.has(item.value) && !assigned.has(item.value))
        .map((item) => ({
          ...item,
          group: {key: 'other', label: 'Other suggestions'},
        })),
    ];
  }, [visible, groups, allItems, selected]);
  const detail = report?.skills.find((skill) => skill.id === detailId);
  const partial =
    report &&
    (report.truncated ||
      report.skippedFiles.length > 0 ||
      (report.registryWarnings?.length ?? 0) > 0);
  const pageSize = Math.max(3, Math.min(10, rows - 18));
  useEffect(() => {
    if (report) {
      setSelected([]);
      setFilter('');
      setCursor(0);
      setMode('browse');
    }
  }, [report]);
  const beginFilter = () => {
    setPreviousFilter(filter);
    setMode('filter');
  };
  useUiAction('scan:filter', beginFilter);
  useUiAction('scan:review', () => setMode('review'));
  useUiAction('scan:refresh', () => {
    void refresh();
  });
  useKeymap(
    [
      {key: '/', run: beginFilter},
      {key: 'f', run: beginFilter},
      {key: 'g', run: () => setMode('groups')},
      {key: 'd', run: () => setMode('search')},
      {
        key: 'c',
        run: () => {
          setFilter('');
          setCursor(0);
        },
      },
    ],
    {scope: 'screen', isActive: mode === 'browse' && Boolean(report)},
  );
  useKeymap(
    [
      {
        key: 'r',
        run: () => {
          if (selected.length) setNotice('New scan: selection was cleared.');
          void refresh();
        },
      },
    ],
    {scope: 'screen', isActive: mode === 'browse' && scan.status !== 'loading'},
  );
  useKeymap(
    [
      {key: 'esc', run: () => setMode('browse')},
      {key: 'b', run: () => setMode('browse')},
    ],
    {
      scope: 'screen',
      isActive: mode === 'groups' || mode === 'detail',
    },
  );
  useKeymap([
    {key: 'esc', run: () => setMode('browse')},
    {key: 'b', run: () => setMode('browse')},
  ], {scope: 'screen', isActive: mode === 'review' && Boolean(installPlan?.errors.length)});
  useScreenHints(
    'home',
    mode === 'browse'
      ? report
        ? [
            ...(groupedItems.length
              ? scanHints.slice(0, 4)
              : [
                  {key: 'enter', label: 'review'},
                  ...(report.skills.length ? [{key: '/', label: 'filter'}] : []),
                ]),
            ...(filter ? [{key: 'c', label: 'clear filter'}] : []),
            ...scanHints.slice(4).filter((hint) => hint.key === 'r' || report.skills.length > 0),
            ...(groupedItems.length > pageSize ? [{key: 'pageup/down', label: 'page'}] : []),
          ]
        : scan.status === 'error'
          ? [{key: 'r', label: 'retry scan'}]
          : []
      : mode === 'filter'
        ? [
            {key: 'enter', label: 'apply filter'},
            {key: 'esc', label: 'cancel'},
            {key: 'ctrl+u', label: 'clear text'},
          ]
        : mode === 'review'
          ? [
              {key: 'y/n', label: 'choose'},
              {key: 'enter', label: 'confirm'},
              {key: 'esc', label: 'back'},
              ...(chosen.length > pageSize ? [{key: 'pageup/down', label: 'page'}] : []),
            ]
          : mode === 'search'
            ? [
                {key: 'enter', label: 'open detail'},
                {key: 'esc', label: 'back'},
              ]
            : [
                {key: 'esc', label: 'back'},
                ...(mode === 'groups'
                  ? [
                      {key: 'up/down', label: 'move'},
                      {key: 'enter', label: 'toggle group'},
                    ]
                  : []),
              ],
  );

  const overview = (
    <Panel title="Project" tone="muted">
      <Stack>
        <Text bold color={partial ? theme.color.warn : theme.color.success}>
          {partial ? '! Partial scan' : `${theme.symbols.success} Scan complete`}
        </Text>
        <Text>{report?.scannedFiles ?? 0} files scanned</Text>
        <Text>
          {report?.technologies.length ?? 0} technologies / {report?.combinations.length ?? 0}{' '}
          combinations
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold>Technologies</Text>
          <Text>
            {report?.technologies
              .slice(0, 4)
              .map((tech) => tech.name)
              .join(', ') || 'No technologies detected'}
          </Text>
          {(report?.technologies.length ?? 0) > 4 && (
            <Muted>+{report!.technologies.length - 4} more technologies</Muted>
          )}
          {!!report?.combinations.length && (
            <>
              <Text bold>Combinations</Text>
              <Text>
                {report.combinations
                  .slice(0, 2)
                  .map((combo) => combo.name)
                  .join(', ')}
              </Text>
              {report.combinations.length > 2 && (
                <Muted>+{report.combinations.length - 2} more combinations</Muted>
              )}
            </>
          )}
        </Box>
        {report?.truncated && (
          <StatusMessage tone="warn">
            Limit reached. Detection may be incomplete; increase --depth or --max-files.
          </StatusMessage>
        )}
        {!!report?.skippedFiles.length && (
          <StatusMessage tone="warn">
            {report.skippedFiles.length} skipped inputs; detection may be incomplete.
          </StatusMessage>
        )}
        {report?.registryWarnings?.map((warning, i) => (
          <StatusMessage key={i} tone="warn">
            {warning.source}: {warning.message}
          </StatusMessage>
        ))}
        {notice && <Muted>{notice}</Muted>}
      </Stack>
    </Panel>
  );

  const picker = (
    <Panel
      title={
        mode === 'review'
          ? 'Review selection'
          : mode === 'detail'
            ? 'Skill detail'
            : mode === 'groups'
              ? 'Technology groups'
              : mode === 'search'
                ? 'Find skill details'
                : 'Suggested skills'
      }
      focused
    >
      <Text bold>
        {chosen.length} selected of {report?.skills.length ?? 0} suggested
      </Text>
      {filter && (
        <Muted>
          Filter: {filter} / {visible.length} matches
        </Muted>
      )}
      {mode === 'filter' && (
        <TextField
          label="Filter"
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setCursor(0);
          }}
          placeholder="skill or technology"
          onSubmit={() => setMode('browse')}
          onCancel={() => {
            setFilter(previousFilter);
            setMode('browse');
          }}
        />
      )}
      {(mode === 'browse' || mode === 'filter') && (
        <MultiSelect
          items={groupedItems}
          allItems={allItems}
          value={selected}
          onChange={setSelected}
          cursor={cursor}
          onCursorChange={setCursor}
          isActive={mode === 'browse'}
          maxVisible={pageSize}
          maxVisibleRows={Math.max(7, rows - 21)}
          submitWhenEmpty
          onSubmit={() => setMode('review')}
          emptyMessage={
            report?.skills.length === 0
              ? report.technologies.length === 0
                ? 'No technologies detected in this project.'
                : 'Technologies detected but no mapped skills.'
              : 'No suggestions match this filter.'
          }
        />
      )}
      {mode === 'groups' &&
        (groups.length ? (
          <Select
            items={groups.map((group) => ({
              value: group.key,
              label: group.title,
              hint: `${group.skillIds.filter((id) => selected.includes(id)).length}/${group.skillIds.length}`,
            }))}
            onSelect={(key) => {
              const group = groups.find((item) => item.key === key);
              if (!group) return;
              const next = new Set(selected);
              const remove = group.skillIds.every((id) => next.has(id));
              for (const id of group.skillIds) {
                if (remove) next.delete(id);
                else next.add(id);
              }
              setSelected(
                report!.skills.filter((skill) => next.has(skill.id)).map((skill) => skill.id),
              );
            }}
            maxVisible={pageSize}
          />
        ) : (
          <Muted>No skill groups were detected.</Muted>
        ))}
      {mode === 'search' && (
        <SearchSelect
          items={allItems}
          maxVisible={pageSize}
          placeholder="Find a skill to inspect"
          onSelect={(id) => {
            setDetailId(id);
            setMode('detail');
          }}
          onCancel={() => setMode('browse')}
        />
      )}
      {mode === 'detail' && detail && (
        <Stack gap={1}>
          <Text bold>{detail.id}</Text>
          {detail.sources.map((source) => {
            const evidence =
              source.type === 'technology'
                ? (report!.technologies.find((tech) => tech.id === source.id)?.evidence ?? [])
                : source.type === 'combination'
                  ? report!.technologies
                      .filter((tech) =>
                        report!.combinations
                          .find((combo) => combo.id === source.id)
                          ?.requires.includes(tech.id),
                      )
                      .flatMap((tech) => tech.evidence)
                  : [];
            return (
              <Stack key={source.type + source.id}>
                <Text>
                  {source.type}: {source.name}
                </Text>
                {(config.explain ? evidence : evidence.slice(0, 2)).map((reason, i) => (
                  <Muted key={i}>{reason}</Muted>
                ))}
                {evidence.length === 0 && <Muted>No additional evidence available.</Muted>}
                {!config.explain && evidence.length > 2 && (
                  <Muted>Use --explain for full evidence.</Muted>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}
      {mode === 'review' && (
        <>
          <PaginatedList
            allowWhenCaptured
            items={chosen}
            getKey={(id) => id}
            pageSize={pageSize}
            emptyMessage="No skills selected"
            renderItem={(id) => <Text>{id}</Text>}
          />
          {installPlan && (
            <Stack gap={1}>
              <Muted>Project-only commands will be printed after confirmation, never executed.</Muted>
              {installPlan.errors.map((error) => (
                <StatusMessage tone="warn" key={error}>{error}</StatusMessage>
              ))}
              {installPlan.commands.map((command) => (
                <Text key={command} wrap="wrap">{command}</Text>
              ))}
              {!installPlan.errors.length && !installPlan.commands.length && (
                <Muted>No installation commands are needed for this selection.</Muted>
              )}
            </Stack>
          )}
          {(!installPlan || !installPlan.errors.length) && (
            <Confirm
              message={installPlan ? 'Print installation commands and exit?' : 'Confirm these skill IDs and exit?'}
              onConfirm={(yes) => {
                if (yes) {
                  if (installPlan) confirm(chosen, installPlan.commands);
                  else confirm(chosen);
                  exit();
                } else setMode('browse');
              }}
            />
          )}
        </>
      )}
      <Box marginTop={1}>
        <Muted>Suggestions only - no skills were installed by Nosey.</Muted>
      </Box>
    </Panel>
  );
  return (
    <ScreenLayout
      title="Scan"
      description={config.root}
      actions={<Badge tone={partial ? 'warn' : 'muted'}>{partial ? 'PARTIAL' : 'READ-ONLY'}</Badge>}
    >
      <ScreenState
        status={report ? 'success' : scan.status === 'error' ? 'error' : 'loading'}
        error={scan.status === 'error' ? scan.error : undefined}
        message={report ? undefined : `Scanning ${config.root}...`}
      >
        {report && (
          <Stack gap={1}>
            {overview}
            {picker}
          </Stack>
        )}
      </ScreenState>
      {scan.status === 'error' && <Muted>Check the project path and permissions.</Muted>}
    </ScreenLayout>
  );
}

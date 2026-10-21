import {useCallback, useEffect, useRef, useState} from 'react';
import {resolve} from 'node:path';
import {Text} from 'ink';
import {
  Confirm,
  Muted,
  MultiSelect,
  PaginatedList,
  Panel,
  ScreenLayout,
  ScreenState,
  Select,
  Spinner,
  Stack,
  StatusMessage,
  TextField,
} from '../components';
import {useKeymap, useInputCapture, useToast} from '../hooks';
import {useInputActivity} from '../hooks/useInputActivity';
import {useScan} from '../features/skills/context';
import {useScreenHints, useUiAction} from '../features/ui/context';
import {useRouter} from '../hooks/useRouter';
import {
  buildRegistry,
  commandSource,
  editRegistry,
  listRegistries,
  setAlwaysRecommend,
  validateRegistry,
  type RegistryEntry,
} from '../lib/registry/commands';
import {globalConfigPath} from '../lib/registry/config';
import {loadLocalRegistry} from '../lib/registry/load';
import {loadGitRegistry} from '../lib/registry/git';
import type {LoadedRegistry} from '../lib/registry/types';

type Mode =
  | 'list'
  | 'add'
  | 'add-ref'
  | 'confirm-add'
  | 'detail'
  | 'confirm-remove'
  | 'confirm-build'
  | 'recommend'
  | 'recommend-filter'
  | 'confirm-recommend';
const sourceOf = (entry: RegistryEntry) =>
  entry.spec.type === 'local' ? entry.spec.path : entry.spec.url;
const messageOf = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));

async function readRegistry(source: string, ref?: string) {
  const spec = commandSource(source, ref);
  if (spec.type === 'local') return {loaded: await loadLocalRegistry(spec.path), warnings: []};
  return loadGitRegistry(spec);
}

export function RegistryManagerScreen() {
  const {config, static: preview} = useScan();
  const root = config.root;
  const active = useInputActivity();
  const router = useRouter();
  const toast = useToast();
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [mode, setMode] = useState<Mode>('list');
  const [source, setSource] = useState('');
  const [ref, setRef] = useState('');
  const [selected, setSelected] = useState<RegistryEntry>();
  const [detail, setDetail] = useState<LoadedRegistry>();
  const [loading, setLoading] = useState(!preview);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [recommended, setRecommended] = useState<string[]>([]);
  const [skillFilter, setSkillFilter] = useState('');
  const skillItems = [
    ...(detail?.manifest.skills ?? []).map((skill) => ({
      value: skill.id,
      label: skill.id,
      hint: skill.name + ' (local)',
    })),
    ...(detail?.map.externalSkills ?? []).map((skill) => ({
      value: skill.id,
      label: skill.id,
      hint: skill.name + ' (external: ' + skill.source + ')',
    })),
  ];
  const savedRecommendations = detail?.map.alwaysRecommend ?? [];
  const knownRecommendations = savedRecommendations.filter((id) =>
    skillItems.some((skill) => skill.value === id),
  );
  const staleRecommendations = savedRecommendations.filter(
    (id) => !skillItems.some((skill) => skill.value === id),
  );
  const filterText = skillFilter.toLowerCase();
  const visibleSkills = skillItems.filter((skill) =>
    (skill.label + ' ' + skill.hint).toLowerCase().includes(filterText),
  );
  const lock = useRef(false);
  const target = globalConfigPath();
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await listRegistries(root));
      setError('');
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }, [root]);
  useEffect(() => {
    if (active && !preview) void reload();
  }, [reload, active, preview]);
  useInputCapture(busy);
  useUiAction('registry:add', () => {
    setMode('add');
    setSource('');
    setRef('');
  });
  const execute = async (operation: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await operation();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const inspect = (entry: RegistryEntry) => {
    setSelected(entry);
    setDetail(undefined);
    setRecommended([]);
    setSkillFilter('');
    setMode('detail');
    void execute(async () => {
      const result = await readRegistry(
        sourceOf(entry),
        entry.spec.type === 'git' ? entry.spec.ref : undefined,
      );
      setDetail(result.loaded);
      setMessage(result.warnings.map((warning) => warning.message).join('\n'));
    });
  };
  const prepareAdd = (revision = '') => {
    setRef(revision);
    void execute(async () => {
      const result = await readRegistry(source, revision || undefined);
      setDetail(result.loaded);
      setMessage(result.warnings.map((warning) => warning.message).join('\n'));
      setMode('confirm-add');
    });
  };
  useKeymap(
    [
      {
        key: 'a',
        run: () => {
          setSource('');
          setRef('');
          setMode('add');
        },
      },
      {key: 'i', run: () => router.push('registry-setup')},
      {
        key: 'r',
        run: () => {
          void reload();
        },
      },
      {key: 'b', run: () => router.replace('home')},
    ],
    {scope: 'screen', isActive: mode === 'list' && !busy && !loading},
  );
  useKeymap(
    [
      {
        key: 'a',
        run: () => {
          if (!detail || selected?.spec.type !== 'local') return;
          setRecommended(knownRecommendations);
          setSkillFilter('');
          setMode('recommend');
        },
      },
      {key: 'b', run: () => setMode('list')},
      {key: 'esc', run: () => setMode('list')},
      {
        key: 'd',
        run: () => {
          if (selected) setMode('confirm-remove');
        },
      },
      {
        key: 'v',
        run: () => {
          if (selected?.spec.type === 'local') {
            const directory = selected.spec.path;
            void execute(async () => {
              const loaded = await validateRegistry(directory);
              setDetail(loaded);
              setMessage('Validated ' + loaded.manifest.registryId);
            });
          }
        },
      },
      {
        key: 'u',
        run: () => {
          if (selected?.spec.type === 'local') setMode('confirm-build');
        },
      },
    ],
    {scope: 'screen', isActive: mode === 'detail' && !busy},
  );
  useKeymap(
    [
      {key: 'esc', run: () => setMode('detail')},
      {key: '/', run: () => setMode('recommend-filter')},
      {key: 'c', run: () => setSkillFilter('')},
      {key: 's', run: () => setMode('confirm-recommend')},
    ],
    {scope: 'screen', isActive: mode === 'recommend' && !busy},
  );
  useScreenHints(
    'registry',
    busy
      ? []
      : mode === 'list'
        ? [
            {key: 'enter', label: 'details'},
            {key: 'a', label: 'add'},
            {key: 'i', label: 'initialize'},
            {key: 'r', label: 'refresh'},
          ]
        : mode === 'detail'
          ? [
              {key: 'b', label: 'back'},
              {key: 'd', label: 'remove reference'},
              ...(detail && selected?.spec.type === 'local'
                ? [{key: 'a', label: 'always recommend'}]
                : []),
              ...(selected?.spec.type === 'local'
                ? [
                    {key: 'v', label: 'validate'},
                    {key: 'u', label: 'build metadata'},
                  ]
                : []),
              {key: 'pageup/down', label: 'page'},
            ]
          : mode === 'recommend' || mode === 'recommend-filter'
            ? [
                {key: 'space', label: 'toggle'},
                {key: '/', label: 'filter'},
                {key: 'c', label: 'clear filter'},
                {key: 's', label: 'review'},
                {key: 'esc', label: 'cancel'},
              ]
            : mode.startsWith('confirm')
              ? [
                  {key: 'y/n', label: 'choose'},
                  {key: 'enter', label: 'confirm'},
                  {key: 'esc', label: 'cancel'},
                ]
              : [
                  {key: 'enter', label: 'continue'},
                  {key: 'esc', label: 'cancel'},
                  {key: 'ctrl+u', label: 'clear'},
                ],
  );

  return (
    <ScreenLayout title="Registries" description="Manage references, not installed skills">
      <Panel title="Registry references" tone="muted">
        <Text>Project: {root}</Text>
        <Text>New registry references: global</Text>
        <Muted>Write target: {target}</Muted>
        {message && <StatusMessage tone="info">{message}</StatusMessage>}
        {error && <StatusMessage tone="danger">{error}</StatusMessage>}
        {busy ? (
          <Spinner label="Working on registry..." />
        ) : (
          <>
            {mode === 'list' && (
              <ScreenState
                status={loading ? 'loading' : entries.length ? 'success' : 'empty'}
                title={
                  loading
                    ? 'Loading registry references'
                    : entries.length
                      ? undefined
                      : 'No registries configured'
                }
                message={
                  entries.length
                    ? undefined
                    : 'Add a local or Git registry to extend skill suggestions.'
                }
              >
                <Select
                  items={entries.map((entry, index) => ({
                    value: String(index),
                    label: sourceOf(entry),
                    hint: `${entry.scope} / ${entry.spec.type}${entry.spec.type === 'git' ? ' / ' + (entry.spec.ref ?? 'HEAD') : ''}`,
                  }))}
                  onSelect={(key) => {
                    const entry = entries[Number(key)];
                    if (entry) inspect(entry);
                  }}
                />
              </ScreenState>
            )}
            {mode === 'add' && (
              <TextField
                label="Path or Git URL"
                value={source}
                onChange={setSource}
                placeholder="./team-skills"
                onCancel={() => setMode('list')}
                onSubmit={(value) => {
                  if (!value) {
                    setError('A path or Git URL is required.');
                    return;
                  }
                  const next = /^(https?:\/\/|ssh:\/\/|git@)/.test(value)
                    ? value
                    : resolve(root, value);
                  setSource(next);
                  setError('');
                  if (/^(https?:\/\/|ssh:\/\/|git@)/.test(value)) setMode('add-ref');
                  else
                    void execute(async () => {
                      const result = await readRegistry(next);
                      setDetail(result.loaded);
                      setMode('confirm-add');
                    });
                }}
              />
            )}
            {mode === 'add-ref' && (
              <TextField
                label="Git revision"
                initialValue={ref}
                placeholder="HEAD (optional)"
                onCancel={() => setMode('add')}
                onSubmit={prepareAdd}
              />
            )}
            {mode === 'confirm-add' && (
              <Stack>
                <Text>Registry: {detail?.manifest.registryId}</Text>
                <Text>
                  Source: {source}
                  {ref ? '#' + ref : ''}
                </Text>
                <Text>Scope: global</Text>
                <Text>Config: {target}</Text>
                <Confirm
                  message="Add this registry reference?"
                  onCancel={() => setMode('list')}
                  onConfirm={(yes) => {
                    if (!yes) {
                      setMode('list');
                      return;
                    }
                    void execute(async () => {
                      const result = await editRegistry('add', source, {
                        root,
                        scope: 'global',
                        ref: ref || undefined,
                      });
                      await reload();
                      setMode('list');
                      setMessage(
                        (result.changed ? 'Added reference to ' : 'Reference already in ') +
                          result.configPath,
                      );
                      toast.push('Registry ready. Rescan to update suggestions.', 'success');
                    });
                  }}
                />
              </Stack>
            )}
            {mode === 'detail' && selected && (
              <Stack gap={1}>
                <Text bold>
                  {detail?.manifest.registryId ??
                    'Registry details unavailable; b Back or d Remove reference'}
                </Text>
                <Text>Source: {sourceOf(selected)}</Text>
                <Text>Scope: {selected.scope}</Text>
                <Text>Config: {selected.configPath}</Text>
                {selected.spec.type === 'git' && (
                  <Text>Git revision: {selected.spec.ref ?? 'HEAD'} (cached Git objects)</Text>
                )}
                {selected.spec.type === 'git' && (
                  <Muted>
                    To change skill recommendations, edit skills-map.json in a local checkout and
                    publish it.
                  </Muted>
                )}
                {detail && (
                  <>
                    <Text>
                      {detail.manifest.skills.length} local · {(detail.map.externalSkills?.length ?? 0)} external ·{' '}
                      {knownRecommendations.length} always recommended
                    </Text>
                    <PaginatedList
                      items={skillItems}
                      getKey={(skill) => skill.value}
                      renderItem={(skill) => (
                        <Text>
                          {skill.value} ({skill.hint})
                          {knownRecommendations.includes(skill.value) ? ' [always recommend]' : ''}
                        </Text>
                      )}
                    />
                    {staleRecommendations.length > 0 && (
                      <Muted>
                        Not declared in this registry: {staleRecommendations.join(', ')}. Saving
                        removes these IDs.
                      </Muted>
                    )}
                  </>
                )}
              </Stack>
            )}
            {(mode === 'recommend' || mode === 'recommend-filter') && detail && (
              <Stack>
                <Text bold>Always recommend</Text>
                <Muted>
                  Mark skills in this registry to recommend on every scan, wherever the registry is
                  used.
                </Muted>
                <Text>Filter: {skillFilter || '(none)'}</Text>
                {mode === 'recommend-filter' && (
                  <TextField
                    label="Filter skills"
                    initialValue={skillFilter}
                    onSubmit={(value) => {
                      setSkillFilter(value);
                      setMode('recommend');
                    }}
                    onCancel={() => setMode('recommend')}
                  />
                )}
                <MultiSelect
                  items={visibleSkills}
                  allItems={skillItems}
                  value={recommended}
                  onChange={setRecommended}
                  isActive={mode === 'recommend'}
                  submitWhenEmpty
                  onSubmit={() => setMode('confirm-recommend')}
                  emptyMessage="No skills match this filter."
                />
                {staleRecommendations.length > 0 && (
                  <Muted>Unavailable saved IDs will be removed when you save.</Muted>
                )}
              </Stack>
            )}
            {mode === 'confirm-recommend' && selected?.spec.type === 'local' && (
              <Stack>
                <Text bold>Review always recommended skills</Text>
                <Text>Registry: {detail?.manifest.registryId}</Text>
                <Text>Applies wherever this registry is used.</Text>
                <Text>Write target: {resolve(selected.spec.path, 'skills-map.json')}</Text>
                <PaginatedList
                  allowWhenCaptured
                  items={skillItems.filter((item) => recommended.includes(item.value))}
                  getKey={(item) => item.value}
                  renderItem={(item) => <Text>{item.value}</Text>}
                />
                <Text>
                  {recommended.length} skill{recommended.length === 1 ? '' : 's'} will always be
                  recommended.
                </Text>
                {staleRecommendations.length > 0 && (
                  <Muted>{staleRecommendations.join(', ')} will be removed.</Muted>
                )}
                <Confirm
                  message="Save always recommended skills?"
                  onCancel={() => setMode('recommend')}
                  onConfirm={(yes) => {
                    if (!yes) {
                      setMode('recommend');
                      return;
                    }
                    void execute(async () => {
                      if (selected.spec.type !== 'local') return;
                      // Manifest order keeps the shared map stable across sessions.
                      await setAlwaysRecommend(
                        selected.spec.path,
                        skillItems
                          .filter((item) => recommended.includes(item.value))
                          .map((item) => item.value),
                      );
                      setDetail(await loadLocalRegistry(selected.spec.path));
                      setSkillFilter('');
                      await reload();
                      setMode('detail');
                      toast.push(
                        'Recommendations saved to skills-map.json. Rescan to update suggestions.',
                        'success',
                      );
                    });
                  }}
                />
              </Stack>
            )}
            {mode === 'confirm-remove' && selected && (
              <Stack>
                <Text>{sourceOf(selected)}</Text>
                <Confirm
                  message={`Remove reference from ${selected.configPath}? Registry files will not be deleted.`}
                  onCancel={() => setMode('detail')}
                  onConfirm={(yes) => {
                    if (!yes) {
                      setMode('detail');
                      return;
                    }
                    void execute(async () => {
                      await editRegistry('remove', sourceOf(selected), {
                        root,
                        scope: selected.scope,
                        ref: selected.spec.type === 'git' ? selected.spec.ref : undefined,
                      });
                      await reload();
                      setMode('list');
                      setSelected(undefined);
                      setMessage('Removed reference. Registry files were not deleted.');
                    });
                  }}
                />
              </Stack>
            )}
            {mode === 'confirm-build' && selected?.spec.type === 'local' && (
              <Confirm
                message={`Build registry metadata in ${selected.spec.path}? This writes skills-manifest.json.`}
                onCancel={() => setMode('detail')}
                onConfirm={(yes) => {
                  if (!yes) {
                    setMode('detail');
                    return;
                  }
                  const directory = selected.spec.type === 'local' ? selected.spec.path : '';
                  void execute(async () => {
                    const result = await buildRegistry(directory);
                    setDetail(await validateRegistry(directory));
                    setMessage(result);
                    setMode('detail');
                  });
                }}
              />
            )}
          </>
        )}
      </Panel>
    </ScreenLayout>
  );
}

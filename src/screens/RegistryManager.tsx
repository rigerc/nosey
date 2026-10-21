import {useCallback, useEffect, useRef, useState} from 'react';
import {resolve} from 'node:path';
import {Text} from 'ink';
import {
  Confirm,
  Muted,
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
  validateRegistry,
  type RegistryEntry,
  type RegistryScope,
} from '../lib/registry/commands';
import {globalConfigPath, projectConfigPath} from '../lib/registry/config';
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
  | 'confirm-build';
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
  const [scope, setScope] = useState<RegistryScope>('project');
  const [source, setSource] = useState('');
  const [ref, setRef] = useState('');
  const [selected, setSelected] = useState<RegistryEntry>();
  const [detail, setDetail] = useState<LoadedRegistry>();
  const [loading, setLoading] = useState(!preview);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const target = scope === 'global' ? globalConfigPath() : projectConfigPath(root);
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
      {key: 'g', run: () => setScope((value) => (value === 'project' ? 'global' : 'project'))},
      {key: 'b', run: () => router.replace('home')},
    ],
    {scope: 'screen', isActive: mode === 'list' && !busy && !loading},
  );
  useKeymap(
    [
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
  useScreenHints(
    'registry',
    busy
      ? []
      : mode === 'list'
        ? [
            {key: 'enter', label: 'details'},
            {key: 'a', label: 'add'},
            {key: 'i', label: 'initialize'},
            {key: 'g', label: 'new scope'},
            {key: 'r', label: 'refresh'},
          ]
        : mode === 'detail'
          ? [
              {key: 'b', label: 'back'},
              {key: 'd', label: 'remove reference'},
              ...(selected?.spec.type === 'local'
                ? [
                    {key: 'v', label: 'validate'},
                    {key: 'u', label: 'build metadata'},
                  ]
                : []),
              {key: 'pageup/down', label: 'page'},
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
        <Text>New entries: {scope}</Text>
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
                <Text>Scope: {scope}</Text>
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
                        scope,
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
                {detail && (
                  <>
                    <Text>{detail.manifest.skills.length} skills</Text>
                    <PaginatedList
                      items={detail.manifest.skills}
                      getKey={(skill) => skill.id}
                      renderItem={(skill) => <Text>{skill.id}</Text>}
                    />
                  </>
                )}
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

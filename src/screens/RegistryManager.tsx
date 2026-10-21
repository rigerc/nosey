import {useCallback, useEffect, useState} from 'react';
import {Text} from 'ink';
import {Confirm, Muted, Panel, Select, Spinner, Stack, StatusMessage, TextField} from '../components';
import {useKeymap} from '../hooks/useKeymap';
import {useRouter} from '../hooks/useRouter';
import {buildRegistry, editRegistry, listRegistries, showRegistry, validateRegistry, type RegistryEntry, type RegistryScope} from '../lib/registry/commands.js';
import type {LoadedRegistry} from '../lib/registry/types.js';

type Mode = 'list' | 'add' | 'add-ref' | 'detail' | 'confirm-remove' | 'busy';
const sourceOf = (entry: RegistryEntry) => entry.spec.type === 'local' ? entry.spec.path : entry.spec.url;

export function RegistryManagerScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [mode, setMode] = useState<Mode>('list');
  const [scope, setScope] = useState<RegistryScope>('project');
  const [pendingSource, setPendingSource] = useState('');
  const [selected, setSelected] = useState<RegistryEntry>();
  const [detail, setDetail] = useState<LoadedRegistry>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await listRegistries(process.cwd()));
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const execute = async (operation: () => Promise<string>) => {
    setMode('busy'); setError(''); setMessage('');
    try {
      setMessage(await operation());
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    setMode('list');
  };
  const open = (index: number) => {
    const entry = entries[index];
    if (!entry) return;
    setSelected(entry); setDetail(undefined); setMode('busy'); setError('');
    void showRegistry(sourceOf(entry), entry.spec.type === 'git' ? entry.spec.ref : undefined)
      .then((loaded) => { setDetail(loaded); setMode('detail'); })
      .catch((reason: unknown) => { setError(reason instanceof Error ? reason.message : String(reason)); setMode('list'); });
  };
  useKeymap([
    {key: 'a', run: () => setMode('add')},
    {key: 'i', run: () => router.push('registry-setup')},
    {key: 'r', run: () => { void reload(); }},
    {key: 'g', run: () => setScope((s) => s === 'project' ? 'global' : 'project')},
    {key: 'b', run: () => mode === 'list' ? router.pop() : setMode('list')},
    {key: 'd', run: () => { if (selected) setMode('confirm-remove'); }},
    {key: 'v', run: () => {
      if (selected?.spec.type === 'local') void execute(async () => {
        const loaded = await validateRegistry(selected.spec.path);
        return 'Validated ' + loaded.manifest.registryId;
      });
    }},
    {key: 'u', run: () => {
      if (selected?.spec.type === 'local') void execute(() => buildRegistry(selected.spec.path));
    }},
  ], {isActive: mode === 'list' || mode === 'detail'});
  return <Stack gap={1}>
    <Panel title="Skill registries" footer="a add · i initialize · g scope · r refresh · b back">
      <Text>New entries scope: {scope}</Text>
      {loading && <Spinner label="Loading registries..." />}
      {!!message && <StatusMessage tone="success">{message}</StatusMessage>}
      {!!error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {mode === 'list' && !loading && (entries.length
        ? <Select items={entries.map((entry, i) => ({
          value: String(i), label: sourceOf(entry),
          hint: entry.scope + (entry.spec.type === 'git' ? ' #' + (entry.spec.ref ?? 'HEAD') : ''),
        }))} onSelect={(key) => open(Number(key))} />
        : <Muted>No registries configured. Press a to add one or i to create one.</Muted>)}
      {mode === 'add' && <TextField label="Registry path or Git URL"
        placeholder="./team-skills"
        onCancel={() => setMode('list')}
        onSubmit={(source) => {
          if (!source) { setError('A registry path or Git URL is required.'); return; }
          if (/^(https:\/\/|ssh:\/\/|git@)/.test(source)) {
            setPendingSource(source);
            setMode('add-ref');
            return;
          }
          void execute(async () => {
            const result = await editRegistry('add', source, {root: process.cwd(), scope});
            return (result.changed ? 'Added registry to ' : 'Registry already in ') + result.configPath;
          });
        }} />}
      {mode === 'add-ref' && <TextField label="Git revision (optional)" placeholder="HEAD"
        onCancel={() => setMode('add')}
        onSubmit={(ref) => { void execute(async () => {
          const result = await editRegistry('add', pendingSource, {
            root: process.cwd(), scope, ref: ref || undefined,
          });
          return (result.changed ? 'Added registry to ' : 'Registry already in ') + result.configPath;
        }); }} />}
      {mode === 'detail' && detail && <>
        <Text bold>{detail.manifest.registryId}</Text>
        <Muted>Source: {detail.source}</Muted>
        {detail.manifest.skills.slice(0, 8).map((skill) =>
          <Text key={skill.id}>• {skill.id}</Text>)}
        {detail.manifest.skills.length > 8 && <Muted>And {detail.manifest.skills.length - 8} more skills</Muted>}
        <Muted>b list · d remove · v validate local · u build local</Muted>
      </>}
      {mode === 'confirm-remove' && selected && <Confirm
        message={'Remove registry reference ' + sourceOf(selected) + '? (registry files will not be deleted)'}
        onConfirm={(yes) => {
          if (!yes) { setMode('detail'); return; }
          void execute(async () => {
            const result = await editRegistry('remove', sourceOf(selected), {
              root: process.cwd(), scope: selected.scope,
              ref: selected.spec.type === 'git' ? selected.spec.ref : undefined,
            });
            setSelected(undefined);
            return result.changed ? 'Removed registry reference.' : 'Registry reference unchanged.';
          });
        }} />}
      {mode === 'busy' && <Spinner label="Working..." />}
    </Panel>
  </Stack>;
}

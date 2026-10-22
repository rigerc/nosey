import {createContext, useContext, useEffect, useRef, type ReactNode} from 'react';
import type {Config} from '../../config';
import {inspectInstalledSkills, discoverProjectSkillAgents, type ConfirmSelection} from './install';
import {resolve} from 'node:path';
import {detectProject, type Report} from '../../lib/detect';
import {resolveRegistries} from '../../lib/registry/resolve';
import {useAsync} from '../../hooks/useAsync';

export interface ScanConfig {
  root: string;
  depth: number;
  maxFiles: number;
  frontendBonus: boolean;
  registry: string[];
  explain: boolean;
}

type ScanResult = Report & {updatedRegistries?: string[]; inspectedAgents?: string[]};

export const defaultScan: ScanConfig = {
  root: '.',
  depth: 8,
  maxFiles: 20_000,
  frontendBonus: true,
  registry: [],
  explain: false,
};

function useScanState(
  config: ScanConfig,
  initialReport?: Report,
  enabled = true,
  installSettings?: Config['skillsCli'],
  checkRegistryUpdatesOnStart = false,
) {
  // Startup checking is opt-in and only runs for the first interactive scan.
  const checkOnNextScan = useRef(checkRegistryUpdatesOnStart && enabled && !initialReport);

  const scan = useAsync<ScanResult, []>(async () => {
    const forceRefresh = checkOnNextScan.current;
    checkOnNextScan.current = false;
    const resolved = await resolveRegistries(config.root, config.registry, {forceRefresh});

    const report = await detectProject(config.root, {
      ...config,
      registry: resolved.registry,
      registryWarnings: resolved.warnings,
    });

    const agents = installSettings?.defaultAgents?.length
      ? installSettings.defaultAgents
      : await discoverProjectSkillAgents(config.root);

    const sourced = report.skills.map((skill) => ({
      ...skill,
      installSource: resolved.registry.skillInstallSources?.get(skill.id),
    }));

    const installed = await inspectInstalledSkills(config.root, sourced, agents);

    return {
      ...report,
      updatedRegistries: forceRefresh ? resolved.updatedSources : [],
      inspectedAgents: agents,
      skills: sourced.map((skill) => ({
        ...skill,
        installation: installed.get(skill.id),
      })),
    };
  }, initialReport);

  const registryKey = JSON.stringify(config.registry);
  useEffect(() => {
    if (enabled && !initialReport) void scan.run();
  }, [
    config.root,
    config.depth,
    config.maxFiles,
    config.frontendBonus,
    registryKey,
    enabled,
    initialReport,
    scan.run,
  ]);

  return {
    config: {...config, root: resolve(config.root)},
    installSettings: installSettings ?? {enabled: false, defaultAgents: []},
    scan,
    refresh: scan.run,
    static: !enabled,
  };
}

type Value = ReturnType<typeof useScanState> & {
  confirm: ConfirmSelection;
};

const Context = createContext<Value | null>(null);

export function ScanProvider({
  config = defaultScan,
  initialReport,
  enabled,
  onConfirm,
  installSettings,
  checkRegistryUpdatesOnStart = false,
  children,
}: {
  config?: ScanConfig;
  initialReport?: Report;
  enabled?: boolean;
  onConfirm?: ConfirmSelection;
  installSettings?: Config['skillsCli'];
  checkRegistryUpdatesOnStart?: boolean;
  children: ReactNode;
}) {
  const value = useScanState(
    config,
    initialReport,
    enabled,
    installSettings,
    checkRegistryUpdatesOnStart,
  );

  return (
    <Context.Provider
      value={{
        ...value,
        confirm: (ids, commands, execution) => {
          if (execution !== undefined) onConfirm?.(ids, commands, execution);
          else if (commands !== undefined) onConfirm?.(ids, commands);
          else onConfirm?.(ids);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useScan() {
  const value = useContext(Context);

  if (!value) throw new Error('useScan requires ScanProvider');

  return value;
}

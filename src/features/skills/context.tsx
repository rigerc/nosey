import {createContext, useContext, useEffect, type ReactNode} from 'react';
import type {Config} from '../../config';
import {inspectInstalledSkills, discoverProjectSkillAgents} from './install';
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
export const defaultScan: ScanConfig = {
  root: '.',
  depth: 8,
  maxFiles: 20_000,
  frontendBonus: true,
  registry: [],
  explain: false,
};
function useScanState(
  config: ScanConfig, initialReport?: Report, enabled = true,
  installSettings?: Config['skillsCli'],
) {
  const scan = useAsync(async () => {
    const resolved = await resolveRegistries(config.root, config.registry);
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
    return {...report, inspectedAgents: agents, skills: sourced.map((skill) => ({
      ...skill, installation: installed.get(skill.id),
    }))};
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
  confirm: (ids: string[], commands?: string[]) => void;
};
const Context = createContext<Value | null>(null);
export function ScanProvider({
  config = defaultScan,
  initialReport,
  enabled,
  onConfirm,
  installSettings,
  children,
}: {
  config?: ScanConfig;
  initialReport?: Report;
  enabled?: boolean;
  onConfirm?: (ids: string[], commands?: string[]) => void;
  installSettings?: Config['skillsCli'];
  children: ReactNode;
}) {
  const value = useScanState(config, initialReport, enabled, installSettings);
  return (
    <Context.Provider value={{...value, confirm: (ids, commands) => commands === undefined ? onConfirm?.(ids) : onConfirm?.(ids, commands)}}>
      {children}
    </Context.Provider>
  );
}
export function useScan() {
  const value = useContext(Context);
  if (!value) throw new Error('useScan requires ScanProvider');
  return value;
}

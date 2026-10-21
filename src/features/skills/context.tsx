import {createContext, useContext, useEffect, type ReactNode} from 'react';
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
function useScanState(config: ScanConfig, initialReport?: Report, enabled = true) {
  const scan = useAsync(async () => {
    const resolved = await resolveRegistries(config.root, config.registry);
    return detectProject(config.root, {
      ...config,
      registry: resolved.registry,
      registryWarnings: resolved.warnings,
    });
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
    scan,
    refresh: scan.run,
    static: !enabled,
  };
}
type Value = ReturnType<typeof useScanState> & {confirm: (ids: string[]) => void};
const Context = createContext<Value | null>(null);
export function ScanProvider({
  config = defaultScan,
  initialReport,
  enabled,
  onConfirm,
  children,
}: {
  config?: ScanConfig;
  initialReport?: Report;
  enabled?: boolean;
  onConfirm?: (ids: string[]) => void;
  children: ReactNode;
}) {
  const value = useScanState(config, initialReport, enabled);
  return (
    <Context.Provider value={{...value, confirm: (ids) => onConfirm?.(ids)}}>
      {children}
    </Context.Provider>
  );
}
export function useScan() {
  const value = useContext(Context);
  if (!value) throw new Error('useScan requires ScanProvider');
  return value;
}

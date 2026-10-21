import {createContext, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import {detectProject, type Report} from '../../lib/detect.js';
import {resolveRegistries} from '../../lib/registry/resolve.js';

export interface ScanConfig {
  root: string;
  depth: number;
  maxFiles: number;
  frontendBonus: boolean;
  registry: string[];
  explain: boolean;
}
type ScanState =
  | {status: 'loading'}
  | {status: 'error'; message: string}
  | {status: 'ready'; report: Report};
interface ScanContextValue {
  config: ScanConfig;
  state: ScanState;
  refresh: () => void;
  confirm: (ids: string[]) => void;
}
const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({config, onConfirm, children}: {
  config: ScanConfig;
  onConfirm?: (ids: string[]) => void;
  children: ReactNode;
}) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ScanState>({status: 'loading'});
  const registryKey = config.registry.join('\n');
  useEffect(() => {
    let cancelled = false;
    setState({status: 'loading'});
    async function load() {
      try {
        const resolved = await resolveRegistries(config.root, config.registry);
        const report = await detectProject(config.root, {
          depth: config.depth,
          maxFiles: config.maxFiles,
          frontendBonus: config.frontendBonus,
          registry: resolved.registry,
          registryWarnings: resolved.warnings,
        });
        if (!cancelled) setState({status: 'ready', report});
      } catch (error) {
        if (!cancelled)
          setState({status: 'error', message: error instanceof Error ? error.message : String(error)});
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [config.root, config.depth, config.maxFiles, config.frontendBonus, registryKey, revision]);
  const value = useMemo<ScanContextValue>(
    () => ({
      config, state,
      refresh: () => setRevision((n) => n + 1),
      confirm: (ids) => onConfirm?.(ids),
    }),
    [config, state, onConfirm],
  );
  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}
export function useScan() {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error('useScan must be used under ScanProvider');
  return ctx;
}

import {existsSync} from 'node:fs';
import {configPath, loadConfig} from '../lib/config';

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

/** Headless diagnostics without Ink, prompts, or external I/O. */
export function inspectEnvironment(configFile?: string): DoctorReport {
  const path = configPath(configFile);
  const {error} = loadConfig(configFile);
  const nodeMajor = Number(process.versions.node.split('.')[0]);

  const checks: DoctorCheck[] = [
    {
      name: 'node',
      ok: nodeMajor >= 24,
      detail: `Node.js ${process.versions.node} (requires 24+)`,
    },
    {
      name: 'configuration',
      ok: !error,
      detail: error
        ? `${path}: ${error}`
        : existsSync(path)
          ? `${path}: valid`
          : `${path}: not created (defaults in use)`,
    },
  ];

  return {ok: checks.every((check) => check.ok), checks};
}

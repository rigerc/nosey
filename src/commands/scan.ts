import {AppError} from '../lib/errors';
import {detectProject} from '../lib/detect';
import {formatReport} from '../lib/report';
import {resolveRegistries} from '../lib/registry/resolve';

export interface ScanCommandOptions {
  json?: boolean;
  skillsOnly?: boolean;
  explain?: boolean;
  frontendBonus?: boolean;
  registry?: string[];
  depth?: number;
  maxFiles?: number;
}

/** Detection and output stay independent of the terminal UI. */
export async function runScan(args: string[], options: ScanCommandOptions): Promise<void> {
  if (args.length > 1) throw new AppError('Expected at most one project path', {exitCode: 2});
  if (options.json && options.skillsOnly)
    throw new AppError('--json and --skills-only are mutually exclusive', {exitCode: 2});
  const depth = options.depth ?? 8;
  const maxFiles = options.maxFiles ?? 20_000;
  if (!Number.isSafeInteger(depth) || depth < 0)
    throw new AppError('--depth requires a non-negative integer', {exitCode: 2});
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1)
    throw new AppError('--max-files requires a positive integer', {exitCode: 2});

  const root = args[0] ?? '.';
  const resolved = await resolveRegistries(root, options.registry ?? []);
  for (const warning of resolved.warnings)
    process.stderr.write(`nosey: registry warning [${warning.source}]: ${warning.message}\n`);
  const report = await detectProject(root, {
    depth,
    maxFiles,
    frontendBonus: options.frontendBonus,
    registry: resolved.registry,
    registryWarnings: resolved.warnings,
  });
  const result = options.json
    ? JSON.stringify(report, null, 2)
    : options.skillsOnly
      ? report.skills.map((skill) => skill.id).join('\n')
      : formatReport(report, options.explain);
  process.stdout.write(result + '\n');
}

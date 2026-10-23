import path from 'node:path';
import {parse as parseJsonc, type ParseError} from 'jsonc-parser';
import {parse as parseToml} from 'smol-toml';
import {z} from 'zod';
import type {McpServerMatcher} from '../data/skills-map.js';
import {matchesPath, type ProjectTree} from './scanner.js';

export type McpServer = {
  file: string;
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  status: 'configured' | 'disabled';
  package?: {ecosystem: 'npm' | 'python'; name: string};
  endpoint?: string;
};

const locations = ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json', '.codex/config.toml'];
const documentSchema = z.record(z.string(), z.unknown());

const declarationSchema = z.object({
  command: z.string().trim().min(1).optional(),
  args: z.array(z.string()).optional(),
  url: z.string().trim().min(1).optional(),
  type: z.enum(['stdio', 'http', 'sse']).optional(),
  enabled: z.boolean().optional(),
  disabled: z.boolean().optional(),
});

/** Stable endpoint identity, never containing URL credentials, query strings or fragments. */
export function mcpEndpoint(value: string): string | undefined {
  if (/[\r\n]/.test(value)) return undefined;

  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;

    const identity = url.origin + (url.pathname.replace(/\/+$/, '') || '/');

    return /\$\{|\$%7b|\$\w/i.test(identity) ? undefined : identity;
  } catch {
    return undefined;
  }
}

/** Conservative parsing of package-runner arguments, never of arbitrary shell strings. */
function runnerPackage(command: string, args: string[]): McpServer['package'] {
  const executable = path.win32.basename(command).replace(/\.(?:cmd|exe)$/i, '');
  let runner = executable;
  let tokens = args;

  if (['npm', 'pnpm', 'yarn', 'bun', 'uv'].includes(runner)) {
    const subcommand =
      runner === 'npm' ? 'exec' : runner === 'bun' ? 'x' : runner === 'uv' ? 'tool' : 'dlx';

    if (tokens[0] !== subcommand) return undefined;
    tokens = tokens.slice(1);

    if (runner === 'uv') {
      if (tokens[0] !== 'run') return undefined;
      tokens = tokens.slice(1);
      runner = 'uvx';
    } else runner = 'npx';
  }

  if (!['npx', 'bunx', 'uvx'].includes(runner)) return undefined;

  let candidate: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (!token) return undefined;

    if (['-y', '--yes', '--no-install'].includes(token)) continue;

    if (token === '--') {
      candidate = tokens[i + 1];
      break;
    }

    if (runner === 'uvx' && token === '--from') {
      candidate = tokens[i + 1];
      break;
    }

    if (runner === 'uvx' && token.startsWith('--from=')) {
      candidate = token.slice(7);
      break;
    }

    if (token.startsWith('-')) return undefined;
    candidate = token;
    break;
  }

  if (!candidate) return undefined;

  if (runner === 'uvx') {
    const match =
      /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[A-Za-z0-9,._-]+\])?(?:(?:==|>=|<=|~=|>|<|!=)[A-Za-z0-9.*+,<>=!~-]+)?$/.exec(
        candidate,
      );

    return match?.[1]
      ? {ecosystem: 'python', name: match[1].toLowerCase().replace(/[-_.]+/g, '-')}
      : undefined;
  }

  const match = /^((?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9_.-]*)(?:@[A-Za-z0-9.*^~+-]+)?$/.exec(
    candidate,
  );

  return match?.[1] ? {ecosystem: 'npm', name: match[1]} : undefined;
}

/** Read only recognized workspace files already admitted by the bounded project scanner. */
export async function indexMcpServers(tree: ProjectTree): Promise<McpServer[]> {
  const servers: McpServer[] = [];

  for (const file of tree.files) {
    if (!locations.some((location) => matchesPath(file, location))) continue;
    // eslint-disable-next-line no-await-in-loop
    const content = await tree.read(file);

    if (content === undefined) continue;

    const invalid = () => {
      if (!tree.skippedFiles.some((item) => item.file === file && item.reason === 'invalid-config'))
        tree.skippedFiles.push({file, reason: 'invalid-config'});
    };

    try {
      const toml = file.endsWith('.toml');
      const vscode = matchesPath(file, '.vscode/mcp.json');
      const errors: ParseError[] = [];

      const parsed = toml
        ? parseToml(content)
        : parseJsonc(content, errors, {
            disallowComments: !vscode,
            allowTrailingComma: vscode,
          });

      const document = documentSchema.safeParse(parsed);

      if (errors.length || !document.success) {
        invalid();
        continue;
      }

      const key = toml ? 'mcp_servers' : vscode ? 'servers' : 'mcpServers';

      const entries = documentSchema.safeParse(
        document.data[key] === undefined ? {} : document.data[key],
      );

      if (!entries.success) {
        invalid();
        continue;
      }

      for (const [name, raw] of Object.entries(entries.data)) {
        const declaration = declarationSchema.safeParse(raw);

        if (!name.trim() || !declaration.success) {
          invalid();
          continue;
        }

        const entry = declaration.data;
        const endpoint = entry.url === undefined ? undefined : mcpEndpoint(entry.url);
        const remote = entry.url !== undefined;

        if (
          (remote &&
            ((!endpoint && !entry.url?.includes('${')) ||
              entry.command !== undefined ||
              entry.type === 'stdio')) ||
          (!remote && (!entry.command || (entry.type !== undefined && entry.type !== 'stdio')))
        ) {
          invalid();
          continue;
        }

        const server: McpServer = {
          file,
          name,
          transport: remote ? (entry.type === 'sse' ? 'sse' : 'http') : 'stdio',
          status: entry.enabled === false || entry.disabled === true ? 'disabled' : 'configured',
        };

        if (endpoint) server.endpoint = endpoint;

        if (entry.command) server.package = runnerPackage(entry.command, entry.args ?? []);
        servers.push(server);
      }
    } catch {
      // Parser errors may embed source text, including secrets; expose only the file and reason.
      invalid();
    }
  }

  return servers;
}

export function matchesMcpServer(server: McpServer, matchers: McpServerMatcher[]): boolean {
  if (server.status === 'disabled') return false;

  return matchers.some((matcher) => {
    if (matcher.configFiles && !matcher.configFiles.includes(server.file)) return false;
    if (matcher.serverNames?.includes(server.name)) return true;

    if (
      server.endpoint &&
      matcher.endpoints?.some((value) => mcpEndpoint(value) === server.endpoint)
    )
      return true;

    if (!server.package) return false;

    const names = server.package.ecosystem === 'npm' ? matcher.packages : matcher.pythonPackages;

    return (
      names?.some(
        (name) =>
          (server.package?.ecosystem === 'python'
            ? name.toLowerCase().replace(/[-_.]+/g, '-')
            : name) === server.package?.name,
      ) ?? false
    );
  });
}

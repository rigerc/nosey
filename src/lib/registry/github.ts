import {execFile} from 'node:child_process';
import process from 'node:process';
import {promisify} from 'node:util';
import {Octokit} from 'octokit';
import {z} from 'zod';

const execFileAsync = promisify(execFile);

/** Keep requests bounded and silent while Ink owns the terminal. Never retry creation. */
export function githubClient(token?: string, transport?: typeof fetch): Octokit {
  const github = new Octokit({
    auth: token,
    userAgent: 'nosey',
    request: {fetch: transport},
    retry: {enabled: false},
    throttle: {enabled: false},
    log: {debug() {}, info() {}, warn() {}, error() {}},
  });

  github.hook.before('request', (options) => {
    const deadline = AbortSignal.timeout(30_000);
    const signal = options.request.signal;
    options.request.signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  });

  return github;
}

export async function authenticatedGithubClient(): Promise<Octokit> {
  let token = process.env['GITHUB_TOKEN']?.trim() || process.env['GH_TOKEN']?.trim();

  if (!token) {
    try {
      // gh is only a credential source; all GitHub API calls go through Octokit.
      const {stdout} = await execFileAsync('gh', ['auth', 'token', '--hostname', 'github.com'], {
        timeout: 5_000,
        maxBuffer: 64 * 1024,
        env: {...process.env, GH_PROMPT_DISABLED: '1'},
      });

      token = stdout.trim();
    } catch {
      throw new Error(
        'GitHub authentication required: set GITHUB_TOKEN or GH_TOKEN, or run gh auth login.',
      );
    }
  }

  if (!token) throw new Error('GitHub authentication required: set GITHUB_TOKEN or GH_TOKEN.');

  return githubClient(token);
}

/** Supply HTTPS Git authentication without embedding credentials in URLs or arguments. */
export async function githubGitEnvironment(
  github: Octokit,
  registryId: string,
): Promise<NodeJS.ProcessEnv> {
  const {token} = z
    .object({type: z.literal('token'), token: z.string().min(1)})
    .parse(await github.auth());

  const key = `http.https://github.com/${registryId}.git.extraheader`;

  return {
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: key,
    GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: key,
    GIT_CONFIG_VALUE_1:
      'AUTHORIZATION: basic ' + Buffer.from('x-access-token:' + token).toString('base64'),
  };
}

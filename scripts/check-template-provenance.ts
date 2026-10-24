import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {trustedTemplateRevision} from '../src/lib/registry/template-source.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const submodule = 'template/registry';
const upstreamUrl = 'https://github.com/rigerc/nosey-registry-template.git';

function git(args: string[], cwd = root): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function assertEqual(label: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual || '(missing)'}`);
  }
}

async function sha256(filename: string): Promise<string> {
  const contents = await fs.readFile(path.join(root, submodule, filename));

  return createHash('sha256').update(contents).digest('hex');
}

export async function checkTemplateProvenance(): Promise<void> {
  const configuredUrl = git([
    'config',
    '-f',
    '.gitmodules',
    '--get',
    'submodule.template/registry.url',
  ]);

  assertEqual('Canonical template URL', configuredUrl, upstreamUrl);

  const indexEntry = git(['ls-files', '--stage', '--', submodule]);
  const match = /^160000 ([0-9a-f]{40}) 0\ttemplate\/registry$/.exec(indexEntry);

  if (!match) {
    throw new Error(
      `Expected ${submodule} to be an indexed mode-160000 gitlink; got ${indexEntry || '(missing)'}`,
    );
  }

  assertEqual('Template gitlink commit', match[1]!, trustedTemplateRevision.commit);

  const checkout = path.join(root, submodule);
  let head: string;

  try {
    head = git(['rev-parse', 'HEAD'], checkout);
  } catch {
    throw new Error(
      `Template submodule is missing or uninitialized at ${submodule}; initialize it recursively before running this development check`,
    );
  }

  assertEqual('Checked-out template commit', head, trustedTemplateRevision.commit);
  const dirty = git(['status', '--porcelain', '--untracked-files=all'], checkout);

  if (dirty) {
    throw new Error(`Template submodule has a dirty or untracked reference tree:\n${dirty}`);
  }

  const tree = git(['rev-parse', 'HEAD^{tree}'], checkout);
  assertEqual('Checked-out template tree', tree, trustedTemplateRevision.tree);
  assertEqual(
    'Git object tree for approved commit',
    git(['rev-parse', `${trustedTemplateRevision.commit}^{tree}`], checkout),
    trustedTemplateRevision.tree,
  );

  assertEqual(
    'Maintainer guide SHA-256',
    await sha256('AGENTS.md'),
    trustedTemplateRevision.maintainerGuideSha256,
  );
  assertEqual(
    'Downstream guide SHA-256',
    await sha256('.agents/templates/registry-AGENTS.md'),
    trustedTemplateRevision.downstreamGuideSha256,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkTemplateProvenance()
    .then(() =>
      process.stdout.write(
        `Template provenance passed: ${trustedTemplateRevision.commit} ${trustedTemplateRevision.tree}\n`,
      ),
    )
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Catch values are untrusted and narrowed before formatting.
    .catch((error: unknown) => {
      process.stderr.write(
        `Template provenance failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}

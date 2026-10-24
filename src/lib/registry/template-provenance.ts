import {createHash} from 'node:crypto';
import type {Octokit} from 'octokit';
import type {CommandRunner} from './init.js';

export const trustedTemplateRepository = 'rigerc/nosey-registry-template';

export type TrustedTemplateRevision = {
  commit: string;
  tree: string;
  maintainerGuideSha256: string;
  downstreamGuideSha256: string;
};

const gitObjectId = /^[a-f\d]{40}(?:[a-f\d]{24})?$/i;
const sha256 = /^[a-f\d]{64}$/i;
const guideLimit = 4 * 1024 * 1024;

function requireGitObjectId(value: string, label: string): string {
  if (!gitObjectId.test(value))
    throw new Error(`Trusted template ${label} must be a 40- or 64-character Git object ID`);

  return value.toLowerCase();
}

/** Validate a trusted revision supplied by packaged first-party code. */
export function validateTrustedTemplateRevision(
  revision: TrustedTemplateRevision,
): TrustedTemplateRevision {
  const commit = requireGitObjectId(revision.commit, 'commit');
  const tree = requireGitObjectId(revision.tree, 'tree');

  if (!sha256.test(revision.maintainerGuideSha256) || !sha256.test(revision.downstreamGuideSha256))
    throw new Error('Trusted template guide hashes must be 64-character SHA-256 values');

  return {
    commit,
    tree,
    maintainerGuideSha256: revision.maintainerGuideSha256.toLowerCase(),
    downstreamGuideSha256: revision.downstreamGuideSha256.toLowerCase(),
  };
}

/** Build the only supported source archive URL from an explicit trusted commit. */
export function templateArchiveUrl(revision: TrustedTemplateRevision): string {
  const trusted = validateTrustedTemplateRevision(revision);

  return `https://codeload.github.com/${trustedTemplateRepository}/tar.gz/${trusted.commit}`;
}

/** Verify bounded guide bytes against first-party trusted hashes; never accept a downloaded policy. */
export function verifyTemplateGuide(
  bytes: Uint8Array,
  revision: TrustedTemplateRevision,
  kind: 'maintainer' | 'downstream',
): void {
  const trusted = validateTrustedTemplateRevision(revision);

  if (bytes.byteLength > guideLimit)
    throw new Error('Template guide exceeds the 4 MiB verification limit');

  const expected =
    kind === 'maintainer' ? trusted.maintainerGuideSha256 : trusted.downstreamGuideSha256;

  const actual = createHash('sha256').update(bytes).digest('hex');

  if (actual !== expected)
    throw new Error(
      `Template ${kind} guide hash mismatch; preserve the clone and update its recovery state before retrying`,
    );
}

/** Require upstream default-branch HEAD to still be the explicitly approved revision. */
export async function assertTemplateDefaultHead(
  github: Octokit,
  revision: TrustedTemplateRevision,
): Promise<void> {
  const trusted = validateTrustedTemplateRevision(revision);
  const [owner, repo] = trustedTemplateRepository.split('/');
  const {data: repository} = await github.rest.repos.get({owner: owner!, repo: repo!});

  if (!repository.default_branch)
    throw new Error('Registry template has no readable default branch; no remote was created');

  const {data: head} = await github.rest.repos.getBranch({
    owner: owner!,
    repo: repo!,
    branch: repository.default_branch,
  });

  if (head.commit.sha.toLowerCase() !== trusted.commit)
    throw new Error(
      `Registry template default branch moved from approved ${trusted.commit} to ${head.commit.sha}; no remote was created. Update Nosey to an approved template revision or use pinned local initialization.`,
    );
}

/** Accept GitHub's independent commit only when the clone is clean and its content tree matches. */
export async function assertGeneratedTemplateTree(
  directory: string,
  runner: CommandRunner,
  revision: TrustedTemplateRevision,
): Promise<string> {
  const trusted = validateTrustedTemplateRevision(revision);

  const status =
    (await runner('git', ['-C', directory, 'status', '--porcelain=v1', '--untracked-files=all'])) ??
    '';

  if (status.trim())
    throw new Error(
      'Generated registry clone is dirty; preserve it for recovery and do not configure or push it',
    );

  const tree = (await runner('git', ['-C', directory, 'rev-parse', '--verify', 'HEAD^{tree}']))
    ?.trim()
    .toLowerCase();

  if (!tree || !gitObjectId.test(tree))
    throw new Error(
      'Could not read a valid Git tree from the generated registry clone; preserve it for recovery',
    );

  if (tree !== trusted.tree)
    throw new Error(
      `Generated registry content tree ${tree} does not match approved ${trusted.tree}; preserve the clone and remote for recovery; no configuration or push was performed`,
    );

  return tree;
}

import type {TrustedTemplateRevision} from './template-provenance.js';

/** The single template revision approved for this Nosey release. */
export const templateCommit = '65521cd55cade0bca67c0083b2960876ba924e09';
export const templateTree = '66889743d2c7dc4b5f5584232e62db19b60b23bd';

export const trustedTemplateRevision: TrustedTemplateRevision = {
  commit: templateCommit,
  tree: templateTree,
  maintainerGuideSha256: 'f04c77d2f7bf934675d5f4459d3846fdeb8743abf4b218656fb272e67d1f560b',
  downstreamGuideSha256: '31de20f738298b3bd665e3e2178d412146b620d97aa1f2997dbf2133275d4922',
};

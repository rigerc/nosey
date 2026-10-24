import {expect, test} from 'vite-plus/test';
import {checkTemplateProvenance} from '../scripts/check-template-provenance.js';

test('development provenance check accepts the approved clean submodule checkout', async () => {
  await expect(checkTemplateProvenance()).resolves.toBeUndefined();
});

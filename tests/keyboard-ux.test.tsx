import {expect, it, vi} from 'vite-plus/test';
import {Confirm, MultiSelect, SearchSelect, Select, TextField} from '../src/components';
import {InputCaptureProvider, KeymapProvider} from '../src/hooks';
import {mount, settle} from './helpers/terminal';
import type {ReactNode} from 'react';

const items = ['one', 'two', 'three'].map((value) => ({value, label: value}));
const view = (node: ReactNode) => (
  <InputCaptureProvider>
    <KeymapProvider>{node}</KeymapProvider>
  </InputCaptureProvider>
);

it('processes rapid arrow keys and Enter in the order received', async () => {
  const choose = vi.fn();
  const app = await mount(view(<Select items={items} onSelect={choose} />));
  app.stdin.write('\u001b[B');
  app.stdin.write('\u001b[B');
  app.stdin.write('\r');
  await settle();
  expect(choose).toHaveBeenCalledExactlyOnceWith('three');
});

it('processes rapid checkbox navigation, Space, and Enter without losing a toggle', async () => {
  const submit = vi.fn();
  const app = await mount(view(<MultiSelect items={items} onSubmit={submit} />));
  app.stdin.write(' ');
  app.stdin.write('\u001b[B');
  app.stdin.write('\u001b[B');
  app.stdin.write(' ');
  app.stdin.write('\r');
  await settle();
  await vi.waitFor(() => expect(submit).toHaveBeenCalledExactlyOnceWith(['one', 'three']));
});

it('accepts Yes followed immediately by Enter as one explicit confirmation', async () => {
  const confirm = vi.fn();
  const app = await mount(view(<Confirm message="Confirm selection?" onConfirm={confirm} />));
  app.stdin.write('y');
  app.stdin.write('\r');
  await settle();
  expect(confirm).toHaveBeenCalledExactlyOnceWith(true);
});

it('retains rapid typed characters when Enter arrives in the same render batch', async () => {
  const submit = vi.fn();
  const app = await mount(view(<TextField label="Filter" onSubmit={submit} />));
  app.stdin.write('q');
  app.stdin.write('1');
  app.stdin.write('t');
  app.stdin.write('\r');
  await settle();
  expect(submit).toHaveBeenCalledExactlyOnceWith('q1t');
});

it('selects against the latest search text when Enter arrives before a repaint', async () => {
  const choose = vi.fn();
  const app = await mount(view(<SearchSelect items={items} onSelect={choose} />));
  app.stdin.write('t');
  app.stdin.write('h');
  app.stdin.write('r');
  app.stdin.write('\r');
  await settle();
  await vi.waitFor(() => expect(choose).toHaveBeenCalledExactlyOnceWith('three'));
});

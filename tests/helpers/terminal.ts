import {setTimeout as tick} from 'node:timers/promises';
import {render} from 'ink-testing-library';
import type {ReactElement} from 'react';
import {afterEach} from 'vite-plus/test';

type TestInstance = ReturnType<typeof render>;

const instances: TestInstance[] = [];

afterEach(() => {
  for (const instance of instances.splice(0)) {
    instance.unmount();
    instance.cleanup();
  }
});

/** Ink throttles terminal updates; allow its scheduled frame to be emitted. */
export async function settle() {
  await tick(50);
}

export async function mount(node: ReactElement) {
  const app = render(node);
  instances.push(app);
  await settle();
  return app;
}

export async function press(app: TestInstance, key: string) {
  app.stdin.write(key);
  await settle();
}

/** Include intermediate frames when asserting transient UI states. */
export function output(app: TestInstance) {
  return app.frames.join('');
}

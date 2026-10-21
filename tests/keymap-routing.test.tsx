import {Text} from 'ink';
import {useState, type ReactNode} from 'react';
import {describe, expect, it, vi} from 'vite-plus/test';
import {SearchSelect, Select} from '../src/components';
import {InputCaptureProvider, useInputCapture} from '../src/hooks/useInputCapture';
import {KeymapProvider, useKeymap} from '../src/hooks/useKeymap';
import {mount, press, settle} from './helpers/terminal';

function RoutingFixture({calls, controlActive = true}: {calls: string[]; controlActive?: boolean}) {
  useKeymap([{key: 'x', run: () => calls.push('global')}], {scope: 'global'});
  useKeymap([{key: 'x', run: () => calls.push('screen')}], {scope: 'screen'});
  useKeymap([{key: 'x', run: () => calls.push('control')}], {
    scope: 'control',
    isActive: controlActive,
  });
  return <Text>Router active</Text>;
}

function CaptureFixture({onShortcut}: {onShortcut: () => void}) {
  const [searching, setSearching] = useState(false);
  useKeymap([{key: '/', run: () => setSearching(true)}], {scope: 'screen'});
  useKeymap([{key: 'q', run: onShortcut}], {scope: 'global'});
  useKeymap([{key: 't', run: onShortcut}], {scope: 'control'});
  return (
    <SearchSelect
      items={[{value: 'one', label: 'One'}]}
      isActive={searching}
      onSelect={() => setSearching(false)}
      onCancel={() => setSearching(false)}
    />
  );
}

function CapturedSelect({onSelect}: {onSelect: (value: string) => void}) {
  useInputCapture(true);
  return (
    <Select
      items={[
        {value: 'one', label: 'One'},
        {value: 'two', label: 'Two'},
      ]}
      allowWhenCaptured
      onSelect={onSelect}
    />
  );
}

const withProviders = (node: ReactNode) => (
  <InputCaptureProvider>
    <KeymapProvider>{node}</KeymapProvider>
  </InputCaptureProvider>
);

describe('shared keyboard routing', () => {
  it('does not interpret modified arrows as plain menu navigation', async () => {
    const chosen = vi.fn();
    const app = await mount(
      withProviders(
        <Select
          items={[
            {value: 'one', label: 'One'},
            {value: 'two', label: 'Two'},
          ]}
          onSelect={chosen}
        />,
      ),
    );
    await press(app, '\u001b[1;5B'); // Ctrl+Down
    await press(app, '\u001b[1;3B'); // Alt+Down
    await press(app, '\r');
    expect(chosen).toHaveBeenLastCalledWith('one');
    await press(app, '\u001b[B');
    await press(app, '\r');
    expect(chosen).toHaveBeenLastCalledWith('two');
  });
  it('dispatches one shortcut to the highest-priority active scope', async () => {
    const calls: string[] = [];
    const app = await mount(withProviders(<RoutingFixture calls={calls} />));
    await press(app, 'x');
    expect(calls).toEqual(['control']);

    app.rerender(withProviders(<RoutingFixture calls={calls} controlActive={false} />));
    await settle();
    await press(app, 'x');
    expect(calls).toEqual(['control', 'screen']);
  });

  it('pauses every registered shortcut while text input is captured, then restores them', async () => {
    const shortcut = vi.fn();
    const app = await mount(withProviders(<CaptureFixture onShortcut={shortcut} />));
    await press(app, '/');
    expect(app.lastFrame()).toContain('Search:');
    await press(app, 'q');
    await press(app, 't');
    expect(app.lastFrame()).toContain('Search: qt');
    expect(shortcut).not.toHaveBeenCalled();
    await press(app, '\u001b');
    await settle();
    await press(app, 't');
    expect(shortcut).toHaveBeenCalledOnce();
    await press(app, 'q');
    expect(shortcut).toHaveBeenCalledTimes(2);
  });

  it('lets explicitly owned controls operate inside an input-capturing editor', async () => {
    const selected = vi.fn();
    const app = await mount(withProviders(<CapturedSelect onSelect={selected} />));
    await press(app, '\u001b[B');
    await press(app, '\r');
    expect(selected).toHaveBeenCalledWith('two');
  });

  it('preserves keymaps for standalone controls without a router provider', async () => {
    const calls: string[] = [];
    const app = await mount(<RoutingFixture calls={calls} />);
    await press(app, 'x');
    // Standalone mode preserves the preexisting direct-listener behavior.
    expect(calls).toHaveLength(3);
    expect(new Set(calls)).toEqual(new Set(['global', 'screen', 'control']));
  });
});

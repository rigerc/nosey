import {Box, renderToString} from 'ink';
import stringWidth from 'string-width';
import {describe, expect, it, vi} from 'vite-plus/test';
import {App} from '../src/app';
import {
  Alert,
  Confirm,
  MultiSelect,
  Panel,
  ProgressBar,
  SearchSelect,
  Select,
  ScreenLayout,
  ScreenState,
  StatusBar,
  StatusMessage,
  TextField,
  Toggle,
} from '../src/components';
import {InputActivityProvider} from '../src/hooks/useInputActivity';
import {getGlobalBindings, getGlobalKeys} from '../src/keys';
import {ThemeProvider} from '../src/theme/context';
import {mount, press, settle} from './helpers/terminal';

const options = {theme: 'mono' as const, ascii: true, debug: false, screen: 'home'};

describe('consistent terminal UI', () => {
  it('uses the same global action registry for help hints and key bindings', () => {
    const next = vi.fn();
    const previous = vi.fn();
    const commands = vi.fn();
    const help = vi.fn();
    const quit = vi.fn();
    const jump = vi.fn();
    const bindings = getGlobalBindings(3, {next, previous, commands, help, quit}, jump);
    expect(bindings.map((binding) => binding.key)).toEqual([
      'tab',
      'shift+tab',
      '1',
      '2',
      '3',
      'ctrl+k',
      '?',
      'q',
    ]);
    expect(getGlobalKeys(3).find((key) => key.label === 'jump to screen')?.key).toBe('1-3');
    expect(getGlobalKeys(3).some((hint) => hint.key === 't')).toBe(false);
    bindings.find((binding) => binding.key === '2')?.run();
    expect(jump).toHaveBeenCalledWith(1);
    bindings.find((binding) => binding.key === 'ctrl+k')?.run();
    expect(commands).toHaveBeenCalledOnce();
  });

  it('renders the same screen header and async states in mono mode', () => {
    for (const status of ['loading', 'empty', 'error', 'success'] as const) {
      const out = renderToString(
        <ThemeProvider name="mono" ascii>
          <ScreenLayout title="Packages" description="Manage packages">
            <ScreenState status={status} message="Test state" />
          </ScreenLayout>
        </ThemeProvider>,
        {columns: 60},
      );

      expect(out).toContain('Packages');
      expect(out).toContain('Test state');
    }
  });

  it('keeps contextual keyboard hints within narrow terminal widths', () => {
    const hints = [
      {key: 'r', label: 'retry'},
      {key: 'x', label: 'simulate failure'},
      ...getGlobalKeys(5),
    ];

    for (const columns of [40, 60, 80, 120]) {
      const out = renderToString(
        <ThemeProvider name="mono" ascii>
          <StatusBar hints={hints} />
        </ThemeProvider>,
        {columns},
      );

      for (const line of out.split('\n')) expect(stringWidth(line)).toBeLessThanOrEqual(columns);
      expect(out).toContain('[r]');
      expect(out).toContain('[q]');
    }
  });

  it('navigates via the command menu and restores the current screen on cancel', async () => {
    const app = await mount(<App options={options} />);
    expect(app.lastFrame()).toContain('Scan');
    await press(app, '\u000b'); // Ctrl+K
    await settle();
    expect(app.lastFrame()).toContain('Commands');
    await press(app, 'settings');
    expect(app.lastFrame()).toContain('Settings');
    await press(app, '\r');
    await settle();
    expect(app.lastFrame()).toContain('Review and configure application preferences');
    await press(app, '\u000b');
    await settle();
    expect(app.lastFrame()).toContain('Commands');
    await press(app, '\u001b');
    await settle();
    expect(app.lastFrame()).toContain('Review and configure application preferences');
  });
});

describe('shared control presentation', () => {
  it('keeps the editing end visible inside a narrow parent and submits the complete value', async () => {
    const value = '/a/very/long/project/path/with/a/recognizable-tail';
    const submit = vi.fn();

    const view = (
      <ThemeProvider name="mono" ascii>
        <Panel title="Filter skills" width={30} compact>
          <TextField label="Filter" initialValue={value} onSubmit={submit} />
        </Panel>
      </ThemeProvider>
    );

    const out = renderToString(view, {columns: 40});
    expect(out).toContain('Filter:');
    expect(out).toContain('tail_');
    expect(out).not.toContain('/a/very/long/project');

    for (const line of out.split('\n')) expect(stringWidth(line)).toBeLessThanOrEqual(30);
    const app = await mount(view);
    await press(app, '\r');
    expect(submit).toHaveBeenCalledExactlyOnceWith(value);
  });

  it('suppresses focus on inactive controls while retaining selection markers and values', () => {
    const items = [
      {value: 'alpha', label: 'Alpha'},
      {value: 'beta', label: 'Beta'},
    ];

    for (const screenActive of [true, false]) {
      const out = renderToString(
        <ThemeProvider name="mono" ascii>
          <InputActivityProvider active={screenActive}>
            <Box flexDirection="column">
              <Select items={items} current="alpha" onSelect={() => {}} isActive={false} />
              <MultiSelect items={items} value={['beta']} isActive={false} compact />
              <Toggle label="Cache" value isActive={false} />
              <Confirm message="Continue?" onConfirm={() => {}} isActive={false} />
              <SearchSelect items={items} onSelect={() => {}} isActive={false} />
              <TextField label="Filter" value="retained" onSubmit={() => {}} isActive={false} />
            </Box>
          </InputActivityProvider>
        </ThemeProvider>,
        {columns: 60},
      );

      expect(out).not.toContain('>');
      expect(out).not.toContain('_');
      expect(out).toContain('[x] Beta');
      expect(out).toContain('Cache: On');
      expect(out).toContain('Filter: retained');
    }

    const hidden = renderToString(
      <ThemeProvider name="mono" ascii>
        <InputActivityProvider active={false}>
          <Select items={items} onSelect={() => {}} />
        </InputActivityProvider>
      </ThemeProvider>,
      {columns: 40},
    );

    expect(hidden).not.toContain('>');
  });

  it('wraps complete diagnostics and keeps progress percentages visible in narrow containers', () => {
    const out = renderToString(
      <ThemeProvider name="mono" ascii>
        <Box flexDirection="column" width={30}>
          <StatusMessage tone="warn">
            Registry unavailable. Check your connection and retry scan.
          </StatusMessage>
          <Alert
            tone="danger"
            title="Could not load the selected registry. Check access permissions."
          >
            Choose a readable directory and retry.
          </Alert>
          <ProgressBar value={0.5} width={80} />
        </Box>
      </ThemeProvider>,
      {columns: 40},
    );

    expect(out).toMatch(/retry\s+scan\./);
    expect(out).toContain('permissions.');
    expect(out).toContain('retry.');
    expect(out).toContain('50%');
    expect(out).not.toContain('…');

    for (const line of out.split('\n')) expect(stringWidth(line)).toBeLessThanOrEqual(30);
  });
});

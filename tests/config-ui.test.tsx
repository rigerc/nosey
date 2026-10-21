import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vite-plus/test';
import {App} from '../src/app';
import {ConfigWizard} from '../src/components/config';
import {InputCaptureProvider} from '../src/hooks/useInputCapture';
import {ThemeProvider} from '../src/theme/context';
import {mount, output, press, settle} from './helpers/terminal';

const dirs: string[] = [];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ink-kit-wizard-'));
  dirs.push(dir);
  return join(dir, 'config.json');
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

describe('configuration wizard', () => {
  const view = (path: string, onFinish = vi.fn()) => (
    <ThemeProvider name="mono" ascii>
      <InputCaptureProvider>
        <ConfigWizard path={path} onFinish={onFinish} />
      </InputCaptureProvider>
    </ThemeProvider>
  );

  it('edits a draft and saves only after Review confirmation', async () => {
    const path = fixture();
    const finish = vi.fn();
    const app = await mount(view(path, finish));
    expect(output(app)).toContain('Terminal theme');
    await press(app, '\r'); // select theme
    await press(app, '\u001b[B'); // auto -> dark
    await press(app, '\r');
    expect(output(app)).toContain('Terminal theme: dark');
    expect(existsSync(path)).toBe(false);
    await press(app, 'n'); // Appearance -> Skills CLI
    await press(app, 'n'); // Skills CLI -> Review
    expect(output(app)).toContain('Save configuration?');
    expect(existsSync(path)).toBe(false);
    await press(app, '\r');
    await expect.poll(() => finish.mock.calls.length).toBe(1);
    expect(finish).toHaveBeenCalledWith('saved');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({version: 1, theme: 'dark'});
  });

  it('cancels without creating a file', async () => {
    const path = fixture();
    const finish = vi.fn();
    const app = await mount(view(path, finish));
    await press(app, 'n'); // Appearance -> Skills CLI
    await press(app, 'n'); // Skills CLI -> Review
    await press(app, 'n'); // No in the confirmation
    await press(app, '\r');
    expect(finish).toHaveBeenCalledWith('cancelled');
    expect(existsSync(path)).toBe(false);
    expect(output(app)).toContain('unchanged');
  });

  it('returns from Review to editing without saving', async () => {
    const path = fixture();
    const app = await mount(view(path));
    await press(app, 'n');
    await press(app, 'n');
    expect(output(app)).toContain('Review configuration');
    await press(app, '\u001b');
    await settle();
    expect(output(app)).toContain('Default target agents');
    expect(existsSync(path)).toBe(false);
  });
});

describe('settings screen', () => {
  it('keeps a draft until explicit save, then persists through --config path', async () => {
    const path = fixture();
    const app = await mount(
      <App
        options={{theme: 'mono', ascii: true, debug: false, screen: 'settings', configFile: path}}
      />,
    );
    await press(app, '\r'); // edit Appearance
    await press(app, '\u001b[B'); // ASCII
    await press(app, '\r'); // toggle
    expect(output(app)).toContain('ASCII symbols: true');
    expect(existsSync(path)).toBe(false);
    await press(app, '\u001b');
    await settle();
    await press(app, 's');
    await expect.poll(() => existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({version: 1, ascii: true});
  });
});

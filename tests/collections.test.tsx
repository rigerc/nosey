import {renderToString, Text} from 'ink';
import {describe, expect, it, vi} from 'vite-plus/test';
import {App} from '../src/app';
import {MultiSelect, PaginatedList, SearchSelect, Toggle} from '../src/components';
import {ThemeProvider} from '../src/theme/context';
import {themeNames} from '../src/theme/tokens';
import stringWidth from 'string-width';
import {mount, press, settle} from './helpers/terminal';

const items = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map((label) => ({
  value: label.toLowerCase(),
  label,
}));

describe('MultiSelect', () => {
  it('toggles options and submits valid selections in item order', async () => {
    const change = vi.fn();
    const submit = vi.fn();
    const app = await mount(
      <MultiSelect
        items={items}
        defaultValue={['beta', 'missing']}
        onChange={change}
        onSubmit={submit}
        maxVisible={2}
      />,
    );
    await press(app, ' ');
    expect(change).toHaveBeenLastCalledWith(['alpha', 'beta']);
    await press(app, '\u001b[B');
    await press(app, ' ');
    expect(change).toHaveBeenLastCalledWith(['alpha']);
    await press(app, '\r');
    expect(submit).toHaveBeenLastCalledWith(['alpha']);
    await press(app, '\u001b[F'); // End scrolls to the last option.
    expect(app.lastFrame()).toContain('Epsilon');
    expect(app.lastFrame()).not.toContain('Alpha');
    await press(app, ' ');
    await press(app, '\r');
    expect(submit).toHaveBeenLastCalledWith(['alpha', 'epsilon']);
  });

  it('preserves selected skills hidden by a filter, ordered by allItems', async () => {
    const change = vi.fn();
    const submit = vi.fn();
    const app = await mount(
      <MultiSelect
        items={items.filter((item) => item.value === 'alpha')}
        allItems={items}
        value={['gamma']}
        onChange={change}
        onSubmit={submit}
      />,
    );
    await press(app, ' ');
    expect(change).toHaveBeenLastCalledWith(['alpha', 'gamma']);
    app.rerender(
      <MultiSelect
        items={items.filter((item) => item.value === 'alpha')}
        allItems={items}
        value={['alpha', 'gamma']}
        onChange={change}
        onSubmit={submit}
      />,
    );
    await settle();
    await press(app, '\r');
    expect(submit).toHaveBeenCalledWith(['alpha', 'gamma']);
  });

  it('renders group headers with spacing and shared skill selection across groups', async () => {
    const grouped = [
      {value: 'alpha', label: 'Alpha', group: {key: 'react', label: 'React (2)'}},
      {value: 'shared', label: 'Shared', group: {key: 'react', label: 'React (2)'}},
      {value: 'shared', label: 'Shared', group: {key: 'next', label: 'Next.js (2)'}},
      {value: 'delta', label: 'Delta', group: {key: 'next', label: 'Next.js (2)'}},
    ];
    const change = vi.fn();
    const inspect = vi.fn();
    const app = await mount(
      <MultiSelect
        items={grouped}
        allItems={items}
        onChange={change}
        onInspect={inspect}
        maxVisible={6}
      />,
    );
    let lines = (app.lastFrame() ?? '').split('\n');
    const next = lines.findIndex((line) => line.includes('Next.js (2)'));
    const firstShared = lines.findIndex((line) => line.includes('[ ] Shared'));
    expect(next).toBeGreaterThan(firstShared);
    expect(lines.slice(firstShared + 1, next).some((line) => line.trim() === '')).toBe(true);

    await press(app, '\u001b[B'); // Focus React's Shared
    await press(app, 'd'); // Inspect, do not open a search control
    expect(inspect).toHaveBeenCalledWith('shared');
    await press(app, ' '); // Select one logical skill
    lines = (app.lastFrame() ?? '').split('\n');
    expect(lines.filter((line) => line.includes('[x] Shared'))).toHaveLength(2);
    expect(app.lastFrame()).toContain('1 selected');
    await press(app, '\u001b[B'); // Next.js copy of Shared
    await press(app, ' '); // Unselect the same underlying ID
    expect(app.lastFrame()).toContain('0 selected');
  });

  it('leaves controlled selection to the parent and ignores keys when inactive', async () => {
    const change = vi.fn();
    const app = await mount(<MultiSelect items={items} value={[]} onChange={change} />);
    await press(app, ' ');
    expect(change).toHaveBeenCalledWith(['alpha']);
    expect(app.lastFrame()).toContain('0 selected');
    app.rerender(
      <MultiSelect items={items} value={['alpha']} onChange={change} isActive={false} />,
    );
    await settle();
    await press(app, ' ');
    expect(app.lastFrame()).toContain('[x] Alpha');
    expect(change).toHaveBeenCalledOnce();
  });

  it('handles empty and shrinking options without submitting removed values', async () => {
    const submit = vi.fn();
    const app = await mount(
      <MultiSelect items={items} defaultValue={['epsilon']} onSubmit={submit} />,
    );
    await press(app, '\u001b[F');
    app.rerender(<MultiSelect items={items.slice(0, 1)} onSubmit={submit} />);
    await settle();
    await press(app, ' ');
    await press(app, '\r');
    expect(submit).toHaveBeenLastCalledWith(['alpha']);
    app.rerender(<MultiSelect items={[]} onSubmit={submit} />);
    await settle();
    await press(app, ' ');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('No options available');
    expect(submit).toHaveBeenCalledOnce();
  });
});

describe('SearchSelect', () => {
  it('filters labels/hints without case sensitivity and selects a matching item', async () => {
    const select = vi.fn();
    const app = await mount(
      <SearchSelect
        items={[...items, {value: 'extra', label: 'Extra', hint: 'Testing'}]}
        onSelect={select}
        maxVisible={2}
      />,
    );
    await press(app, 'TEST');
    expect(app.lastFrame()).toContain('Extra');
    expect(app.lastFrame()).not.toContain('Alpha');
    await press(app, '\r');
    expect(select).toHaveBeenLastCalledWith('extra');
    await press(app, '\u0015'); // Ctrl+U clears the query.
    await press(app, '\u001b[A');
    await press(app, '\r'); // Up wraps to the last match.
    expect(select).toHaveBeenLastCalledWith('extra');
    expect(app.lastFrame()).toContain('5-6 of 6 matches');
  });

  it('shows no matches, ignores Enter, and backspaces a whole Unicode grapheme', async () => {
    const select = vi.fn();
    const query = vi.fn();
    const app = await mount(<SearchSelect items={items} onSelect={select} onQueryChange={query} />);
    await press(app, '👩‍💻');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('No matches found');
    expect(select).not.toHaveBeenCalled();
    await press(app, '\u007f');
    expect(query).toHaveBeenLastCalledWith('');
    expect(app.lastFrame()).toContain('Alpha');
  });

  it('honors a controlled query and resets navigation when it changes', async () => {
    const select = vi.fn();
    const change = vi.fn();
    const app = await mount(
      <SearchSelect items={items} query="" onQueryChange={change} onSelect={select} />,
    );
    await press(app, 'z');
    expect(change).toHaveBeenCalledWith('z');
    expect(app.lastFrame()).toContain('Alpha');
    await press(app, '\u001b[B');
    app.rerender(
      <SearchSelect items={items} query="gam" onQueryChange={change} onSelect={select} />,
    );
    await settle();
    await press(app, '\r');
    expect(select).toHaveBeenLastCalledWith('gamma');
  });

  it('does not consume keys while inactive', async () => {
    const select = vi.fn();
    const change = vi.fn();
    const app = await mount(
      <SearchSelect items={items} onSelect={select} onQueryChange={change} isActive={false} />,
    );
    await press(app, 'a');
    await press(app, '\r');
    expect(select).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  });
});

describe('Toggle', () => {
  it('toggles with Space/Enter and sets an explicit state with arrows', async () => {
    const change = vi.fn();
    const app = await mount(<Toggle label="Cache" onChange={change} />);
    expect(app.lastFrame()).toContain('Cache: Off');
    await press(app, ' ');
    expect(app.lastFrame()).toContain('Cache: On');
    await press(app, '\u001b[C'); // Already on: no duplicate notification.
    expect(change).toHaveBeenCalledOnce();
    await press(app, '\u001b[D');
    await press(app, '\r');
    expect(change.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('supports controlled values, custom labels, and inactive previews', async () => {
    const change = vi.fn();
    const app = await mount(
      <Toggle
        label="Cache"
        value={false}
        onChange={change}
        onLabel="Enabled"
        offLabel="Disabled"
      />,
    );
    await press(app, ' ');
    expect(change).toHaveBeenCalledWith(true);
    expect(app.lastFrame()).toContain('Disabled');
    app.rerender(<Toggle label="Cache" value onChange={change} isActive={false} />);
    await settle();
    await press(app, ' ');
    expect(app.lastFrame()).toContain('Cache: On');
    expect(change).toHaveBeenCalledOnce();
  });
});

describe('PaginatedList', () => {
  const getKey = (item: (typeof items)[number]) => item.value;
  const renderItem = (item: (typeof items)[number], index: number) => `${index}: ${item.label}`;

  it('pages without wrapping and gives renderItem the absolute index', async () => {
    const change = vi.fn();
    const app = await mount(
      <PaginatedList
        items={items}
        pageSize={2}
        getKey={getKey}
        renderItem={renderItem}
        onPageChange={change}
      />,
    );
    expect(app.lastFrame()).toContain('Page 1/3');
    await press(app, '\u001b[D');
    expect(change).not.toHaveBeenCalled();
    await press(app, '\u001b[6~');
    expect(app.lastFrame()).toContain('2: Gamma');
    expect(app.lastFrame()).not.toContain('Alpha');
    await press(app, '\u001b[F');
    expect(app.lastFrame()).toContain('4: Epsilon');
    expect(app.lastFrame()).toContain('5-5 of 5');
    await press(app, '\u001b[C');
    expect(change.mock.calls).toEqual([[1], [2]]);
    await press(app, '\u001b[5~');
    await press(app, '\u001b[H');
    expect(app.lastFrame()).toContain('Page 1/3');
  });

  it('keeps controlled page changes external and disables inactive keys', async () => {
    const change = vi.fn();
    const app = await mount(
      <PaginatedList
        items={items}
        pageSize={2}
        page={0}
        getKey={getKey}
        renderItem={renderItem}
        onPageChange={change}
      />,
    );
    await press(app, '\u001b[C');
    expect(change).toHaveBeenCalledWith(1);
    expect(app.lastFrame()).toContain('Page 1/3');
    app.rerender(
      <PaginatedList
        items={items}
        pageSize={2}
        page={1}
        getKey={getKey}
        renderItem={renderItem}
        onPageChange={change}
        isActive={false}
      />,
    );
    await settle();
    await press(app, '\u001b[C');
    expect(app.lastFrame()).toContain('Page 2/3');
    expect(change).toHaveBeenCalledOnce();
  });

  it('clamps after data shrinks and handles empty/invalid sizes', async () => {
    const app = await mount(
      <PaginatedList
        items={items}
        pageSize={2}
        initialPage={100}
        getKey={getKey}
        renderItem={renderItem}
      />,
    );
    expect(app.lastFrame()).toContain('Page 3/3');
    app.rerender(
      <PaginatedList
        items={items.slice(0, 1)}
        pageSize={2}
        getKey={getKey}
        renderItem={renderItem}
      />,
    );
    await settle();
    expect(app.lastFrame()).toContain('Page 1/1');
    app.rerender(<PaginatedList items={[]} pageSize={0} getKey={getKey} renderItem={renderItem} />);
    await settle();
    await press(app, '\u001b[C');
    expect(app.lastFrame()).toContain('No items.');
    for (const pageSize of [0, -5, NaN, Infinity]) {
      const out = renderToString(
        <PaginatedList items={items} pageSize={pageSize} getKey={getKey} renderItem={renderItem} />,
      );
      expect(out).toContain('Alpha');
      expect(out).not.toContain('NaN');
    }
  });
});

describe('gallery input ownership', () => {
  it('pauses global letter shortcuts during search and restores them on Escape', async () => {
    const app = await mount(
      <App options={{theme: 'mono', ascii: true, debug: false, screen: 'gallery'}} />,
    );
    await press(app, '/');
    await expect.poll(() => app.lastFrame()).toContain('SearchSelect');
    await expect.poll(() => app.lastFrame()).toContain('leave search');
    await press(app, 'q');
    await press(app, 't');
    await press(app, 'r');
    await press(app, '1');
    await press(app, '?');
    expect(app.lastFrame()).toContain('Search: qtr1?');
    expect(app.lastFrame()).toContain('SearchSelect');
    expect(app.lastFrame()).toContain('leave search');
    await press(app, '\u001b');
    await expect.poll(() => app.lastFrame()).toContain('shortcuts restored');
    await press(app, 'o');
    await press(app, ' ');
    expect(app.lastFrame()).toContain('Enable caching: Off');
    await press(app, 'p');
    await press(app, '\u001b[C');
    expect(app.lastFrame()).toContain('Page 2/3');
    await press(app, 'w');
    expect(app.lastFrame()).toContain('Setup wizard');
    await press(app, '1');
    expect(app.lastFrame()).toContain(':^)');
    expect(app.lastFrame()).not.toContain('Interactive components');
  });
});

describe('collection rendering', () => {
  for (const theme of themeNames)
    for (const columns of [40, 60, 120]) {
      it(`fits ${columns} columns with ${theme} theme`, () => {
        const components = [
          <MultiSelect items={items} maxVisible={2} isActive={false} />,
          <SearchSelect items={items} onSelect={() => {}} maxVisible={2} isActive={false} />,
          <Toggle label="Cache" isActive={false} />,
          <PaginatedList
            items={items}
            getKey={(i) => i.value}
            renderItem={(i) => <Text>{i.label}</Text>}
            pageSize={2}
            isActive={false}
          />,
        ];
        for (const component of components) {
          const out = renderToString(
            <ThemeProvider name={theme} ascii>
              {component}
            </ThemeProvider>,
            {columns},
          );
          for (const line of out.split('\n'))
            expect(stringWidth(line)).toBeLessThanOrEqual(columns);
          expect(out).not.toMatch(/[✔✖⚠ℹ❯█░─╭╮╰╯│○]/);
        }
      });
    }
});

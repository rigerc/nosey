import {Text} from 'ink';
import {useState} from 'react';
import {
  Heading,
  InlineLayout,
  MultiSelect,
  Muted,
  PaginatedList,
  Panel,
  SearchSelect,
  Toggle,
} from '../components';
import {useHasInputCapture, useKeymap} from '../hooks';
import {SetupWizard} from './SetupWizard';

const packages = [
  {value: 'ink', label: 'Ink', hint: 'Terminal rendering'},
  {value: 'react', label: 'React', hint: 'Components and hooks'},
  {value: 'typescript', label: 'TypeScript', hint: 'Static types'},
  {value: 'vitest', label: 'Vitest', hint: 'Testing'},
  {value: 'zod', label: 'Zod', hint: 'Validation'},
  {value: 'meow', label: 'Meow', hint: 'CLI flags'},
  {value: 'tsup', label: 'Tsup', hint: 'Build tooling'},
];
type Example = 'multi' | 'search' | 'toggle' | 'pages' | 'wizard';

/** One active example at a time avoids competing keyboard listeners. */
export function CollectionGallery() {
  const [example, setExample] = useState<Example>('multi');
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(['ink']);
  const [searchValue, setSearchValue] = useState('None');
  const [enabled, setEnabled] = useState(true);
  const [wizardKey, setWizardKey] = useState(0);
  const captured = useHasInputCapture();
  useKeymap(
    [
      {key: 'm', run: () => setExample('multi')},
      {
        key: '/',
        run: () => {
          setExample('search');
          setEditing(true);
        },
      },
      {key: 'o', run: () => setExample('toggle')},
      {key: 'p', run: () => setExample('pages')},
      {key: 'w', run: () => setExample('wizard')},
      {
        key: 'r',
        run: () => {
          setWizardKey((key) => key + 1);
          setExample('wizard');
        },
      },
    ],
    {isActive: !captured},
  );
  const titles = {
    multi: 'MultiSelect',
    search: 'SearchSelect',
    toggle: 'Toggle',
    pages: 'PaginatedList',
    wizard: 'Inline layout / Stepper',
  };
  return (
    <Panel title={`Interactive components / ${titles[example]}`}>
      <Muted>m multi / / search / o toggle / p pages / w wizard / r restart</Muted>
      {example === 'multi' && (
        <>
          <MultiSelect items={packages} value={selected} onChange={setSelected} maxVisible={3} />
          <Muted>arrows move / space toggle / {selected.length} packages selected</Muted>
        </>
      )}
      {example === 'search' && (
        <>
          <SearchSelect
            items={packages}
            isActive={editing}
            maxVisible={3}
            onSelect={(value) => {
              setSearchValue(value);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
          <Text>Selected: {searchValue}</Text>
          <Muted>
            {editing
              ? 'type filter / arrows move / enter select / esc leave search'
              : '/ edit search / shortcuts restored'}
          </Muted>
        </>
      )}
      {example === 'toggle' && (
        <>
          <Toggle label="Enable caching" value={enabled} onChange={setEnabled} />
          <Muted>space or enter toggles / left off / right on</Muted>
        </>
      )}
      {example === 'pages' && (
        <>
          <PaginatedList
            items={packages}
            pageSize={3}
            getKey={(item) => item.value}
            renderItem={(item) => item.label}
          />
          <Muted>left/right or pageup/pagedown / home first / end last</Muted>
        </>
      )}
      {example === 'wizard' && (
        <InlineLayout title={<Heading>Setup wizard</Heading>}>
          <SetupWizard key={wizardKey} />
        </InlineLayout>
      )}
    </Panel>
  );
}

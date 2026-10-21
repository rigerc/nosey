import {Box} from 'ink';
import {useState} from 'react';
import {Badge, Panel, ScreenLayout, SearchSelect} from '../components';
import {useScreenHints} from '../features/ui/context';
import {useHasInputCapture, useKeymap} from '../hooks';
import {GalleryExample, galleryItems} from './GalleryExamples';

/**
 * One component family is mounted at a time.
 * [ / ] switch examples; / explicitly opens the searchable picker.
 * The focused SearchSelect captures input and suspends gallery/global shortcuts.
 */
export function GalleryScreen() {
  const [index, setIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const captured = useHasInputCapture();
  const current = galleryItems[index]!;
  useScreenHints(
    'gallery',
    captured
      ? []
      : [
          ...(current.id === 'search' || current.id === 'text'
            ? [{key: 'enter', label: 'focus input'}]
            : []),
          ...(current.id === 'multi'
            ? [
                {key: 'space', label: 'select'},
                {key: 'up/down', label: 'move'},
              ]
            : []),
          ...(current.id === 'toggle' ? [{key: 'space', label: 'toggle'}] : []),
          ...(current.id === 'pages' ? [{key: 'left/right', label: 'page'}] : []),
          {key: '[', label: 'previous'},
          {key: ']', label: 'next'},
          {key: '/', label: 'find component'},
        ],
  );

  const choose = (next: number) => {
    setIndex((next + galleryItems.length) % galleryItems.length);
    setSearchActive(false);
    setPickerOpen(false);
  };

  useKeymap(
    [
      {key: '[', run: () => choose(index - 1)},
      {key: ']', run: () => choose(index + 1)},
      {key: '/', run: () => setPickerOpen(true)},
      {
        key: 'enter',
        run: () => {
          if (current.id === 'search' || current.id === 'text') setSearchActive(true);
        },
      },
    ],
    {isActive: !captured && !pickerOpen && !searchActive, scope: 'screen'},
  );

  return (
    <ScreenLayout
      title="Component gallery"
      description="Explore Nosey's components"
      actions={
        <Badge tone="accent" variant="outline">
          {index + 1}/{galleryItems.length}
        </Badge>
      }
    >
      {pickerOpen ? (
        <Panel title="Choose component">
          <SearchSelect
            items={galleryItems.map((item) => ({
              value: item.id,
              label: item.label,
              hint: item.hint,
            }))}
            maxVisible={6}
            onSelect={(id) => choose(galleryItems.findIndex((item) => item.id === id))}
            onCancel={() => setPickerOpen(false)}
          />
        </Panel>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Panel title={current.label} footer={current.hint}>
            <GalleryExample
              key={current.id}
              id={current.id}
              searchActive={searchActive}
              onSearchActiveChange={setSearchActive}
            />
          </Panel>
        </Box>
      )}
    </ScreenLayout>
  );
}

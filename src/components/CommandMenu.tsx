import {Panel} from './Panel';
import {SearchSelect} from './SearchSelect';

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
}

export function CommandMenu({
  items,
  onSelect,
  onCancel,
}: {
  items: readonly CommandItem[];
  onSelect: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <Panel title="Commands">
      <SearchSelect
        items={items.map((item) => ({value: item.id, label: item.label, hint: item.hint}))}
        onSelect={onSelect}
        onCancel={onCancel}
      />
    </Panel>
  );
}

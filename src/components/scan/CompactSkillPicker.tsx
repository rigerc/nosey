import {Box, Text} from 'ink';
import {Confirm} from '../Confirm';
import {MultiSelect} from '../MultiSelect';
import {PaginatedList} from '../PaginatedList';
import {Muted} from '../typography';
import {orderedSelection} from '../../features/skills/groups';
import {useTerminalSize} from '../../hooks/useTerminalSize';
import type {Report} from '../../lib/detect';

interface Props {
  report: Report;
  selected: string[];
  onSelect: (ids: string[]) => void;
  reviewing: boolean;
  onReview: () => void;
  onBack: () => void;
  onConfirm: (ids: string[]) => void;
}

/** Reuse the standard keyboard controls without the full Scan grouping/detail panels. */
export function CompactSkillPicker({
  report,
  selected,
  onSelect,
  reviewing,
  onReview,
  onBack,
  onConfirm,
}: Props) {
  const {rows} = useTerminalSize();
  const pageSize = Math.max(3, Math.min(10, rows - 10));
  const items = report.skills.map((skill) => ({value: skill.id, label: skill.id}));
  const chosen = orderedSelection(report, new Set(selected));

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>{reviewing ? 'Review selection' : 'Suggested skills'}</Text>
      {reviewing ? (
        <Box flexDirection="column">
          <PaginatedList
            allowWhenCaptured
            items={chosen}
            getKey={(id) => id}
            pageSize={pageSize}
            emptyMessage="No skills selected"
            renderItem={(id) => <Text>{id}</Text>}
          />
          <Confirm
            message="Confirm these skill IDs and exit?"
            onCancel={onBack}
            onConfirm={(yes) => (yes ? onConfirm(chosen) : onBack())}
          />
        </Box>
      ) : (
        <MultiSelect
          items={items}
          value={selected}
          onChange={onSelect}
          onSubmit={onReview}
          maxVisible={pageSize}
          submitWhenEmpty
          emptyMessage={
            report.skills.length === 0
              ? report.technologies.length === 0
                ? 'No technologies detected in this project.'
                : 'Technologies detected but no mapped skills.'
              : 'No suggestions available.'
          }
        />
      )}
      <Box marginTop={1}>
        <Muted>Suggestions only - no skills were installed.</Muted>
      </Box>
    </Box>
  );
}

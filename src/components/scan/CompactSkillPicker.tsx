import {Box, Text} from 'ink';
import {Confirm} from '../Confirm';
import {MultiSelect} from '../MultiSelect';
import {PaginatedList} from '../PaginatedList';
import {Muted} from '../typography';
import {StatusMessage} from '../Status';
import {installationLabel, type InstallCommands} from '../../features/skills/install';
import {useKeymap} from '../../hooks/useKeymap';
import {orderedSelection} from '../../features/skills/groups';
import {useTerminalSize} from '../../hooks/useTerminalSize';
import type {Report} from '../../lib/detect';

interface Props {
  report: Report;
  statusAgents: readonly string[];
  installPlan?: InstallCommands;
  execute?: boolean;
  selected: string[];
  onSelect: (ids: string[]) => void;
  reviewing: boolean;
  onReview: () => void;
  onBack: () => void;
  onConfirm: (ids: string[], commands?: string[]) => void;
}

/** Reuse the standard keyboard controls without the full Scan grouping/detail panels. */
export function CompactSkillPicker({
  report,
  statusAgents,
  installPlan,
  execute = false,
  selected,
  onSelect,
  reviewing,
  onReview,
  onBack,
  onConfirm,
}: Props) {
  const {rows, columns} = useTerminalSize();
  // Reserve the header, summary, selection total, and essential footer controls.
  const pageSize = Math.max(1, Math.min(16, rows - (columns < 80 ? 12 : 11)));

  const items = report.skills.map((skill) => {
    const status = installationLabel(skill.installation, statusAgents);
    const name = columns < 60 ? skill.id.split('/').at(-1)! : skill.id;

    return {
      value: skill.id,
      label: name + (status ? ' [' + status + ']' : ''),
      hint: columns < 60 ? skill.id : undefined,
    };
  });

  const chosen = orderedSelection(report, new Set(selected));
  useKeymap(
    [
      {key: 'esc', run: onBack},
      {key: 'b', run: onBack},
    ],
    {scope: 'screen', isActive: reviewing && Boolean(installPlan?.errors.length)},
  );

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
          {installPlan && (
            <Box flexDirection="column">
              <Muted>
                {execute
                  ? 'Project-only commands will run after confirmation.'
                  : 'Project-only commands will be printed after confirmation, never executed.'}
              </Muted>
              {installPlan.errors.map((error) => (
                <StatusMessage tone="warn" key={error}>
                  {error}
                </StatusMessage>
              ))}
              {installPlan.commands.map((command) => (
                <Text key={command} wrap="wrap">
                  {command}
                </Text>
              ))}
              {!installPlan.errors.length && !installPlan.commands.length && (
                <Muted>No installation commands are needed for this selection.</Muted>
              )}
            </Box>
          )}
          {(!installPlan || !installPlan.errors.length) && (
            <Confirm
              message={
                installPlan
                  ? execute
                    ? 'Install selected skills and exit?'
                    : 'Print installation commands and exit?'
                  : 'Confirm these skill IDs and exit?'
              }
              onCancel={onBack}
              onConfirm={(yes) => (yes ? onConfirm(chosen, installPlan?.commands) : onBack())}
            />
          )}
        </Box>
      ) : (
        <MultiSelect
          compact
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
      <Box>
        <Muted>
          {installPlan && execute
            ? 'Installation requires confirmation.'
            : 'Nothing installed by Nosey.'}
        </Muted>
      </Box>
    </Box>
  );
}

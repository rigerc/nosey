import {Box, Text, useApp} from 'ink';
import {useEffect, useState} from 'react';
import {ScreenState, StatusBar, Muted, StatusMessage} from '../components';
import {CompactScanSummary} from '../components/scan/CompactScanSummary';
import {CompactSkillPicker} from '../components/scan/CompactSkillPicker';
import {useScan} from '../features/skills/context';
import {orderedSelection} from '../features/skills/groups';
import {generateInstallCommands} from '../features/skills/install';
import {useKeymap} from '../hooks/useKeymap';

/** Direct-launch Scan: only the results, essential controls, and confirmation. */
export function CompactScanScreen() {
  const {config, scan, refresh, confirm, installSettings} = useScan();
  const {exit} = useApp();
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const report = scan.status === 'success' ? scan.data : undefined;
  const defaultAgents = installSettings.defaultAgents ?? [];
  const statusAgents = defaultAgents.length ? defaultAgents : (report?.inspectedAgents ?? []);
  const chosen = report ? orderedSelection(report, new Set(selected)) : [];
  const installPlan = installSettings.enabled
    ? generateInstallCommands(chosen, report?.skills ?? [], defaultAgents, config.root)
    : undefined;
  const cannotConfirm = reviewing && Boolean(installPlan?.errors.length);

  // A rescan invalidates previous selections and any open confirmation.
  useEffect(() => {
    setSelected([]);
    setReviewing(false);
  }, [report]);

  useKeymap(
    [
      {key: 'q', run: exit},
      {key: 'r', run: () => { if (scan.status !== 'loading') void refresh(); }},
    ],
    {scope: 'screen', isActive: !reviewing},
  );
  const hints = reviewing
    ? cannotConfirm
      ? [{key: 'esc', label: 'back'}]
      : [
          {key: 'y/n', label: 'choose'},
          {key: 'enter', label: 'confirm'},
          {key: 'esc', label: 'back'},
        ]
    : report
      ? [
          {key: 'space', label: 'select'},
          {key: 'enter', label: 'review'},
          {key: 'up/down', label: 'move'},
          {key: 'r', label: 'rescan'},
          {key: 'q', label: 'quit'},
        ]
      : scan.status === 'error'
        ? [{key: 'r', label: 'retry'}, {key: 'q', label: 'quit'}]
        : [{key: 'q', label: 'quit'}];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={1}>
        <Text bold>nosey / scan</Text>
        <Muted>{config.root}</Muted>
      </Box>
      <ScreenState
        status={report ? 'success' : scan.status === 'error' ? 'error' : 'loading'}
        error={scan.status === 'error' ? scan.error : undefined}
        message={report ? undefined : 'Scanning ' + config.root + '...'}
      >
        {report && (
          <Box flexDirection="column">
            {!!report.updatedRegistries?.length && (
              <StatusMessage tone="info">
                Updated Git registries: {report.updatedRegistries.join(', ')}.
                {installSettings.enabled ? ' Run `npx skills update` to update installed skills.' : ''}
              </StatusMessage>
            )}
            <CompactScanSummary report={report} />
            <CompactSkillPicker
              report={report}
              statusAgents={statusAgents}
              installPlan={installPlan}
              selected={selected}
              onSelect={setSelected}
              reviewing={reviewing}
              onReview={() => setReviewing(true)}
              onBack={() => setReviewing(false)}
              onConfirm={(ids, commands) => {
                if (commands) confirm(ids, commands);
                else confirm(ids);
                exit();
              }}
            />
          </Box>
        )}
      </ScreenState>
      <StatusBar hints={hints} />
    </Box>
  );
}

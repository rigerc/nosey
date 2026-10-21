import {Box, Text, useApp} from 'ink';
import {useEffect, useState} from 'react';
import {ScreenState, StatusBar, Muted} from '../components';
import {CompactScanSummary} from '../components/scan/CompactScanSummary';
import {CompactSkillPicker} from '../components/scan/CompactSkillPicker';
import {useScan} from '../features/skills/context';
import {useKeymap} from '../hooks/useKeymap';

/** Direct-launch Scan: only the results, essential controls, and confirmation. */
export function CompactScanScreen() {
  const {config, scan, refresh, confirm} = useScan();
  const {exit} = useApp();
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const report = scan.status === 'success' ? scan.data : undefined;

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
    ? [
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
            <CompactScanSummary report={report} />
            <CompactSkillPicker
              report={report}
              selected={selected}
              onSelect={setSelected}
              reviewing={reviewing}
              onReview={() => setReviewing(true)}
              onBack={() => setReviewing(false)}
              onConfirm={(ids) => {
                confirm(ids);
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

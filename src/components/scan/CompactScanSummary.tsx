import {Box, Text} from 'ink';
import type {Report} from '../../lib/detect';
import {useTheme} from '../../theme/context';
import {Muted} from '../typography';
import {StatusMessage} from '../Status';

/** Condensed scan evidence; warnings remain visible rather than being hidden by compact mode. */
export function CompactScanSummary({report}: {report: Report}) {
  const theme = useTheme();
  const partial =
    report.truncated ||
    report.skippedFiles.length > 0 ||
    (report.registryWarnings?.length ?? 0) > 0;
  const names = report.technologies.map((technology) => technology.name);
  return (
    <Box flexDirection="column">
      <Text bold color={partial ? theme.color.warn : theme.color.success}>
        {partial ? 'Partial scan' : 'Scan complete'}
      </Text>
      <Muted>
        {report.scannedFiles} files / {names.length} technologies / {report.skills.length} skills
      </Muted>
      <Text wrap="truncate-end">
        {names.length ? names.slice(0, 5).join(', ') + (names.length > 5 ? ', +' + (names.length - 5) + ' more' : '') : 'No technologies detected'}
      </Text>
      {report.truncated && (
        <StatusMessage tone="warn">Scan limit reached; increase --depth or --max-files.</StatusMessage>
      )}
      {report.skippedFiles.length > 0 && (
        <StatusMessage tone="warn">
          {report.skippedFiles.length} skipped inputs; detection may be incomplete.
        </StatusMessage>
      )}
      {report.registryWarnings?.map((warning, index) => (
        <StatusMessage key={index} tone="warn">
          {warning.source}: {warning.message}
        </StatusMessage>
      ))}
    </Box>
  );
}

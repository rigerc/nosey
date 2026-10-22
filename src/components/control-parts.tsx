import {Box, Text, useWindowSize} from 'ink';
import {useInputActivity} from '../hooks/useInputActivity';
import {useTheme} from '../theme/context';
import {controlStyles} from '../theme/components';

interface OptionRowProps {
  label: string;
  value?: string;
  hint?: string;
  focused?: boolean;
  selected?: boolean;
  marker?: 'checkbox' | 'check';
}

/** One physical row, with separate focus, selection, label and hint styles. */
export function OptionRow({
  label,
  value,
  hint,
  focused = false,
  selected = false,
  marker,
}: OptionRowProps) {
  const theme = useTheme();
  focused = useInputActivity() && focused;
  const styles = controlStyles(theme, focused, selected);

  return (
    <Text wrap="truncate-end">
      <Text {...styles.indicator}>{focused ? theme.symbols.pointer : ' '} </Text>
      {marker && (
        <Text {...styles.selection}>
          {marker === 'checkbox'
            ? `[${selected ? 'x' : ' '}]`
            : selected
              ? theme.symbols.success
              : ' '}{' '}
        </Text>
      )}
      <Text {...styles.label}>{label}</Text>
      {value !== undefined && <Text color={theme.color.text}>: {value}</Text>}
      {hint && <Text {...styles.hint}> - {hint}</Text>}
    </Text>
  );
}

interface InputLineProps {
  label: string;
  value: string;
  placeholder?: string;
  isActive?: boolean;
}

/** Keep the label and the editing end visible even inside a narrow panel. */
export function InputLine({label, value, placeholder = '', isActive = true}: InputLineProps) {
  const theme = useTheme();
  const {columns} = useWindowSize();
  isActive = useInputActivity() && isActive;
  const styles = controlStyles(theme, isActive);

  return (
    <Box gap={1}>
      <Box flexShrink={0} maxWidth={Math.max(1, Math.floor(columns / 3))}>
        <Text bold={isActive} color={theme.color.text} wrap="truncate-end">
          {label}:
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={1}>
        <Text wrap={value ? 'truncate-start' : 'truncate-end'}>
          {!value && isActive && (
            <Text {...styles.indicator} inverse>
              _
            </Text>
          )}
          <Text
            color={value ? theme.color.text : theme.color.muted}
            dimColor={!value && theme.mono}
          >
            {value || (isActive && placeholder ? ` ${placeholder}` : placeholder)}
          </Text>
          {value && isActive && (
            <Text {...styles.indicator} inverse>
              _
            </Text>
          )}
        </Text>
      </Box>
    </Box>
  );
}

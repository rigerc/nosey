import {Text, useInput} from 'ink';
import {useState} from 'react';
import {useInputCapture} from '../hooks/useInputCapture';
import {useTheme} from '../theme/context';

export function TextField({label, initialValue = '', placeholder = '', onSubmit, onCancel, isActive = true}: {
  label: string;
  initialValue?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  isActive?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const theme = useTheme();
  useInput((input, key) => {
    if (key.return) { onSubmit(value.trim()); return; }
    if (key.escape) { onCancel?.(); return; }
    if (key.backspace || key.delete) { setValue((text) => Array.from(text).slice(0, -1).join('')); return; }
    if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow) return;
    // oxlint-disable-next-line no-control-regex
    const printable = input.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
    if (printable) setValue((text) => text + printable);
  }, {isActive});
  useInputCapture(isActive);
  return <Text color={isActive ? theme.color.primary : theme.color.muted}
    wrap="truncate-end">{label}: {value || placeholder}▌</Text>;
}

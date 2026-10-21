import {useKeyboardInput} from '../hooks/useKeymap';
import {Text} from 'ink';
import {useRef, useState} from 'react';
import {useInputCapture} from '../hooks/useInputCapture';
import {useTheme} from '../theme/context';
import {useInputActivity} from '../hooks/useInputActivity';
import {useFooterHints} from '../hooks/useFooterHints';

export interface TextFieldProps {
  label: string;
  initialValue?: string;
  /** Controlled text, useful for filtering another component as the user types. */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  isActive?: boolean;
}

export function TextField({
  label,
  initialValue = '',
  value: controlledValue,
  onChange,
  placeholder = '',
  onSubmit,
  onCancel,
  isActive = true,
}: TextFieldProps) {
  isActive = useInputActivity() && isActive;
  useFooterHints(
    [
      {key: 'enter', label: 'accept'},
      {key: 'esc', label: 'cancel'},
      {key: 'ctrl+u', label: 'clear text'},
    ],
    isActive,
  );
  const [internalValue, setInternalValue] = useState(initialValue);
  const value = controlledValue ?? internalValue;
  const current = useRef(value);
  current.current = value;
  const theme = useTheme();
  const update = (next: string) => {
    current.current = next;
    if (controlledValue === undefined) setInternalValue(next);
    onChange?.(next);
  };
  useKeyboardInput(
    (input, key) => {
      if (key.return) {
        onSubmit(current.current.trim());
        return;
      }
      if (key.escape) {
        onCancel?.();
        return;
      }
      if (key.ctrl && input === 'u') {
        update('');
        return;
      }
      if (key.backspace || key.delete) {
        update(Array.from(current.current).slice(0, -1).join(''));
        return;
      }
      if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow) return;
      // oxlint-disable-next-line no-control-regex
      const printable = input.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
      if (printable) update(current.current + printable);
    },
    {isActive},
  );
  useInputCapture(isActive);
  return (
    <Text color={isActive ? theme.color.primary : theme.color.muted} wrap="truncate-end">
      {label}: {value || placeholder}_
    </Text>
  );
}

import {Box, Text} from 'ink';
import {useRef, useState} from 'react';
import {useKeymap} from '../hooks/useKeymap';
import {useInputCapture} from '../hooks/useInputCapture';
import {useInputActivity} from '../hooks/useInputActivity';
import {OptionRow} from './control-parts';
import {useFooterHints} from '../hooks/useFooterHints';

export interface ConfirmProps {
  message: string;
  defaultValue?: boolean;
  onConfirm: (value: boolean) => void;
  isActive?: boolean;
  onCancel?: () => void;
}

/** Confirmation owns the keyboard until answered or cancelled; default is No. */
export function Confirm({
  message,
  defaultValue = false,
  onConfirm,
  onCancel,
  isActive = true,
}: ConfirmProps) {
  isActive = useInputActivity() && isActive;
  const [value, updateValue] = useState(defaultValue);
  const current = useRef(value);
  current.current = value;

  const setValue = (next: boolean) => {
    current.current = next;
    updateValue(next);
  };

  useFooterHints(
    [
      {key: 'y/n', label: 'choose'},
      {key: 'enter', label: 'confirm'},
      {key: 'esc', label: 'cancel'},
    ],
    isActive,
  );
  useInputCapture(isActive);
  useKeymap(
    [
      {key: 'y', run: () => setValue(true)},
      {key: 'Y', run: () => setValue(true)},
      {key: 'left', run: () => setValue(true)},
      {key: 'n', run: () => setValue(false)},
      {key: 'N', run: () => setValue(false)},
      {key: 'right', run: () => setValue(false)},
      {key: 'enter', run: () => onConfirm(current.current)},
      {key: 'esc', run: () => (onCancel ? onCancel() : onConfirm(false))},
    ],
    {isActive, scope: 'control', allowWhenCaptured: true},
  );

  return (
    <Box flexDirection="column">
      <Text>{message}</Text>
      <Box gap={2}>
        {[true, false].map((option) => (
          <OptionRow
            key={String(option)}
            focused={isActive && option === value}
            label={option ? 'Yes' : 'No'}
          />
        ))}
      </Box>
    </Box>
  );
}

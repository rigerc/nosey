import {useState} from 'react';
import {useKeymap} from '../hooks/useKeymap';
import {useInputActivity} from '../hooks/useInputActivity';
import {OptionRow} from './control-parts';

export interface ToggleProps {
  label: string;
  value?: boolean;
  defaultValue?: boolean;
  onChange?: (value: boolean) => void;
  isActive?: boolean;
  onLabel?: string;
  offLabel?: string;
}

/** Space/Enter toggles; left turns off and right turns on. */
export function Toggle({
  label,
  value,
  defaultValue = false,
  onChange,
  isActive = true,
  onLabel = 'On',
  offLabel = 'Off',
}: ToggleProps) {
  isActive = useInputActivity() && isActive;
  const [internal, setInternal] = useState(defaultValue);
  const enabled = value ?? internal;

  const change = (next: boolean) => {
    if (next === enabled) return;

    if (value === undefined) setInternal(next);
    onChange?.(next);
  };

  useKeymap(
    [
      {key: 'space', run: () => change(!enabled)},
      {key: 'enter', run: () => change(!enabled)},
      {key: 'left', run: () => change(false)},
      {key: 'right', run: () => change(true)},
    ],
    {isActive},
  );

  return (
    <OptionRow
      label={label}
      value={enabled ? onLabel : offLabel}
      focused={isActive}
      selected={enabled}
      marker="checkbox"
    />
  );
}

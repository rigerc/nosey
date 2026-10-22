import type {TextProps} from 'ink';
import type {Theme} from './tokens';

/** Shared visual roles for controls; input ownership stays with each control. */
export function controlStyles(theme: Theme, focused: boolean, selected = false) {
  return {
    indicator: {color: theme.color.primary} satisfies TextProps,
    selection: {
      color: selected ? theme.color.success : theme.color.muted,
      dimColor: theme.mono && !selected,
    } satisfies TextProps,
    label: {
      color: focused ? theme.color.primary : selected ? theme.color.success : theme.color.text,
      bold: focused,
    } satisfies TextProps,
    hint: {color: theme.color.muted, dimColor: theme.mono} satisfies TextProps,
  };
}

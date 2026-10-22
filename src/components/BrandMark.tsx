import {Text} from 'ink';
import {useTheme} from '../theme/context';

/**
 * The nosey mark, `:^)`, with the caret — the nose — in the accent color.
 *
 * Pure ASCII: it survives ASCII mode, a missing font, and a mono theme, the
 * same way the kit's SVGs carry outlined type. Use this instead of typing the
 * mark into a string, so every surface stays in sync.
 */
export function BrandMark({bold = false}: {bold?: boolean}) {
  const {color} = useTheme();

  return (
    <Text bold={bold} wrap="truncate-end">
      <Text color={color.text}>:</Text>
      <Text color={color.primary}>^</Text>
      <Text color={color.text}>)</Text>
    </Text>
  );
}

import {Text} from 'ink';
import type {ReactNode} from 'react';
import {useTheme} from '../theme/context';
import type {Tone} from '../theme/tokens';

export type BadgeVariant = 'solid' | 'subtle' | 'outline';

export function Badge({
  tone = 'primary',
  variant = 'subtle',
  children,
}: {
  tone?: Tone;
  variant?: BadgeVariant;
  children: ReactNode;
}) {
  const t = useTheme();
  const color = t.color[tone];

  if (variant === 'solid') {
    return t.mono ? (
      <Text inverse bold>
        {' '}
        {children}{' '}
      </Text>
    ) : (
      <Text backgroundColor={color} color={t.color.onTone} bold>
        {' '}
        {children}{' '}
      </Text>
    );
  }

  if (variant === 'outline') {
    return (
      <Text color={color} dimColor={t.mono && tone === 'muted'}>
        [{children}]
      </Text>
    );
  }

  return (
    <Text color={color} dimColor={t.mono && tone === 'muted'}>
      {t.symbols.bullet} {children}
    </Text>
  );
}

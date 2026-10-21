import {Box, Text} from 'ink';
import type {ReactNode} from 'react';
import {useToast} from '../hooks/useToast';
import {gradient, isHex} from '../lib/gradient';
import {useTheme} from '../theme/context';
import {BrandMark} from './BrandMark';
import {StatusMessage} from './Status';
import {Divider, Kbd, Muted} from './typography';

export function Header({
  title,
  version,
  right,
}: {
  title: string;
  version: string;
  right?: ReactNode;
}) {
  const t = useTheme();
  const {primary, accent} = t.color;
  const chars = Array.from(title);
  const colors = isHex(primary) && isHex(accent) ? gradient(chars.length, primary, accent) : null;
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box gap={1}>
        <BrandMark bold />
        <Text bold color={colors ? undefined : primary}>
          {chars.map((ch, i) => (
            <Text key={i} color={colors?.[i]}>
              {ch}
            </Text>
          ))}
        </Text>
        <Muted>v{version}</Muted>
      </Box>
      <Box gap={1}>{right}</Box>
    </Box>
  );
}

export function StatusBar({
  hints,
  right,
}: {
  hints: {key: string; label: string}[];
  right?: ReactNode;
}) {
  return (
    <Box flexDirection="column">
      <Divider />
      <Box justifyContent="space-between" paddingX={1}>
        <Box columnGap={2} flexWrap="wrap">
          {hints.map((h) => (
            <Box key={h.key} gap={1}>
              <Kbd>{h.key}</Kbd>
              <Muted>{h.label}</Muted>
            </Box>
          ))}
        </Box>
        {right}
      </Box>
    </Box>
  );
}

export function ToastHost() {
  const {toasts} = useToast();
  if (toasts.length === 0) return null;
  return (
    <Box flexDirection="column" paddingX={1}>
      {toasts.map((toast) => (
        <StatusMessage key={toast.id} tone={toast.tone}>
          {toast.message}
        </StatusMessage>
      ))}
    </Box>
  );
}

/** Header, nav, body, toasts, status bar: in that order, inline (no alt screen). */
export function AppShell({
  header,
  nav,
  footer,
  children,
}: {
  header: ReactNode;
  nav?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        {header}
        {nav}
      </Box>
      <Box flexDirection="column">{children}</Box>
      <ToastHost />
      {footer}
    </Box>
  );
}

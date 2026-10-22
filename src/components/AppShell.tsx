import {Box, Text, useWindowSize} from 'ink';
import type {ReactNode} from 'react';
import {useToast} from '../hooks/useToast';
import {BrandMark} from './BrandMark';
import {useTheme} from '../theme/context';
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
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box gap={1}>
        <BrandMark bold />
        <Text bold color={t.color.text}>
          {title}
        </Text>
        <Muted>v{version}</Muted>
      </Box>
      <Box gap={1}>{right}</Box>
    </Box>
  );
}

export function StatusBar({
  hints,
  globalHints,
  right,
}: {
  hints: readonly {key: string; label: string}[];
  globalHints?: readonly {key: string; label: string}[];
  right?: ReactNode;
}) {
  const {columns} = useWindowSize();
  // Keep control actions separate from app navigation; editors only receive their own hints.
  const limit = columns < 60 ? 3 : columns < 90 ? 5 : 9;
  const unique = (items: typeof hints) =>
    items.filter((hint, i) => items.findIndex((item) => item.key === hint.key) === i);
  const visible = unique(hints.length ? hints : (globalHints ?? [])).slice(0, limit);
  const quit = hints.find((hint) => hint.key === 'q');
  if (!globalHints && quit && !visible.some((hint) => hint.key === 'q') && visible.length === limit)
    visible[visible.length - 1] = quit;
  const appHints = columns >= 60 && hints.length ? unique(globalHints ?? []) : [];

  return (
    <Box flexDirection="column">
      <Divider />
      <Box justifyContent="space-between" paddingX={1}>
        <Box columnGap={2} flexWrap="wrap" flexShrink={1}>
          {visible.map((h) => (
            <Box key={h.key} gap={1}>
              <Kbd>{h.key}</Kbd>
              <Muted>{h.label}</Muted>
            </Box>
          ))}
        </Box>
        {right}
      </Box>
      {appHints.length > 0 && (
        <Box columnGap={2} flexWrap="wrap" paddingX={1}>
          {appHints.map((hint) => (
            <Box key={hint.key} gap={1}>
              <Kbd>{hint.key}</Kbd>
              <Muted>{hint.label}</Muted>
            </Box>
          ))}
        </Box>
      )}
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

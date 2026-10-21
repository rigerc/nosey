import type {ReactNode} from 'react';
import pkg from '../package.json';
import {AppShell, Badge, ErrorBoundary, Header, StatusBar, Tabs} from './components';
import {ConfigRuntimeProvider} from './config/context';
import type {Config} from './config';
import {
  useExit,
  useKeymap,
  useRouter,
  RouterProvider,
  ToastProvider,
  InputCaptureProvider,
  useHasInputCapture,
} from './hooks';
import {globalKeys} from './keys';
import {navScreens, screens} from './screens';
import {ThemeProvider, useThemeControls} from './theme/context';
import type {ThemeName} from './theme/tokens';

export interface AppOptions {
  theme: ThemeName;
  ascii: boolean;
  debug: boolean;
  screen: string;
  configFile?: string;
  configFlags?: Partial<Config>;
}

export function AppProviders({options, children}: {options: AppOptions; children: ReactNode}) {
  return (
    <ConfigRuntimeProvider path={options.configFile} flags={options.configFlags}>
      <ThemeProvider name={options.theme} ascii={options.ascii}>
        <InputCaptureProvider>
          <ToastProvider>
            <RouterProvider initial={options.screen}>
              <ErrorBoundary debug={options.debug}>{children}</ErrorBoundary>
            </RouterProvider>
          </ToastProvider>
        </InputCaptureProvider>
      </ThemeProvider>
    </ConfigRuntimeProvider>
  );
}

function Shell() {
  const router = useRouter();
  const exit = useExit();
  const {theme, cycleTheme} = useThemeControls();
  const inputCaptured = useHasInputCapture();

  const index = Math.max(
    0,
    navScreens.findIndex((s) => s.id === router.current),
  );
  const go = (i: number) =>
    router.replace(navScreens[(i + navScreens.length) % navScreens.length]!.id);

  useKeymap(
    [
      {key: 'q', run: () => exit()},
      {key: 'tab', run: () => go(index + 1)},
      {key: 'shift+tab', run: () => go(index - 1)},
      {key: 't', run: cycleTheme},
      {key: '?', run: () => router.replace('help')},
      ...navScreens.map((s, i) => ({key: String(i + 1), run: () => go(i)})),
    ],
    {isActive: !inputCaptured},
  );

  const Screen = (screens.find((s) => s.id === router.current) ?? navScreens[0]!).Component;
  return (
    <AppShell
      header={
        <Header
          title={pkg.name}
          version={pkg.version}
          right={<Badge tone="accent">{theme.name}</Badge>}
        />
      }
      nav={<Tabs items={navScreens} activeId={router.current} />}
      footer={
        <StatusBar
          hints={
            inputCaptured
              ? [
                  {key: 'esc', label: 'back'},
                  {key: 'enter', label: 'edit/select'},
                ]
              : [...globalKeys]
          }
        />
      }
    >
      <Screen />
    </AppShell>
  );
}

export const App = ({options}: {options: AppOptions}) => (
  <AppProviders options={options}>
    <Shell />
  </AppProviders>
);

/** Static, non-interactive rendering of one screen (pipes, CI, --plain). */
export function PlainView({options}: {options: AppOptions}) {
  const Screen = (screens.find((s) => s.id === options.screen) ?? screens[0]!).Component;
  return (
    <AppProviders options={options}>
      <AppShell header={<Header title={pkg.name} version={pkg.version} />}>
        <Screen />
      </AppShell>
    </AppProviders>
  );
}

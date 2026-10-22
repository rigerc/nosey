import {Box} from 'ink';
import {useEffect, useState, type ReactNode} from 'react';
import pkg from '../package.json';
import {
  AppShell,
  Badge,
  CommandMenu,
  ErrorBoundary,
  Header,
  StatusBar,
  StatusMessage,
  Tabs,
} from './components';
import {ConfigRuntimeProvider} from './config/context';
import type {Config} from './config';
import {
  useExit,
  useKeymap,
  KeymapProvider,
  useRouter,
  RouterProvider,
  ToastProvider,
  InputCaptureProvider,
  useHasInputCapture,
} from './hooks';
import {InputActivityProvider} from './hooks/useInputActivity';
import {FooterHintsProvider, useActiveFooterHints} from './hooks/useFooterHints';
import {getGlobalBindings, getGlobalKeys, type KeyHint} from './keys';
import {canonicalScreen, navScreens, screens} from './screens';
import {CompactScanScreen} from './screens/CompactScan';
import {ThemeProvider, useThemeControls} from './theme/context';
import type {ThemeName} from './theme/tokens';
import {ScanProvider, useScan, type ScanConfig} from './features/skills/context';
import {RegistryInitProvider} from './features/registry/context';
import {ScreenHintsProvider, useScreenHintsMap, useUiActions} from './features/ui/context';
import type {Report} from './lib/detect';
import type {RegistryInitOptions} from './lib/registry/init';

export interface AppOptions {
  theme: ThemeName;
  ascii: boolean;
  compactMode?: boolean;
  debug: boolean;
  screen: string;
  configFile?: string;
  configFlags?: Partial<Config>;
  skillsCli?: Config['skillsCli'];
  registrySettings?: Config['registries'];
  scan?: ScanConfig;
  report?: Report;
  registryInit?: RegistryInitOptions;
  onConfirm?: (ids: string[], commands?: string[]) => void;
  static?: boolean;
}

export function AppProviders({options, children}: {options: AppOptions; children: ReactNode}) {
  return (
    <ConfigRuntimeProvider path={options.configFile} flags={options.configFlags}>
      <ThemeProvider name={options.theme} ascii={options.ascii}>
        <InputCaptureProvider>
          <KeymapProvider>
            <ToastProvider>
              <RouterProvider initial={canonicalScreen(options.screen)}>
                <FooterHintsProvider>
                  <ScreenHintsProvider>
                    <RegistryInitProvider options={options.registryInit}>
                      <ScanProvider
                        config={options.scan}
                        initialReport={options.report}
                        enabled={!options.static}
                        onConfirm={options.onConfirm}
                        installSettings={options.skillsCli}
                        checkRegistryUpdatesOnStart={options.registrySettings?.checkOnStart}
                      >
                        <ErrorBoundary debug={options.debug}>{children}</ErrorBoundary>
                      </ScanProvider>
                    </RegistryInitProvider>
                  </ScreenHintsProvider>
                </FooterHintsProvider>
              </RouterProvider>
            </ToastProvider>
          </KeymapProvider>
        </InputCaptureProvider>
      </ThemeProvider>
    </ConfigRuntimeProvider>
  );
}

const menuHints: KeyHint[] = [
  {key: 'up/down', label: 'move'},
  {key: 'enter', label: 'select'},
  {key: 'esc', label: 'close'},
];

function Shell() {
  const router = useRouter();
  const exit = useExit();
  const {theme} = useThemeControls();
  const captured = useHasInputCapture();
  const {scan, installSettings} = useScan();
  const hintsMap = useScreenHintsMap();
  const controlHints = useActiveFooterHints();
  const {requestAction} = useUiActions();
  const [commandOpen, setCommandOpen] = useState(false);
  const [visited, setVisited] = useState([router.current]);
  useEffect(() => {
    setVisited((ids) => (ids.includes(router.current) ? ids : [...ids, router.current]));
  }, [router.current]);
  const tab = router.current === 'registry-setup' ? 'registry' : router.current;

  const index = Math.max(
    0,
    navScreens.findIndex((screen) => screen.id === tab),
  );

  const go = (position: number) =>
    router.replace(navScreens[(position + navScreens.length) % navScreens.length]!.id);

  useKeymap(
    getGlobalBindings(
      navScreens.length,
      {
        next: () => go(index + 1),
        previous: () => go(index - 1),
        commands: () => setCommandOpen(true),
        help: () => router.replace('help'),
        quit: exit,
      },
      go,
    ),
    {isActive: !captured && !commandOpen, scope: 'global'},
  );
  useKeymap([{key: 'ctrl+k', run: () => setCommandOpen(false)}], {
    isActive: commandOpen,
    scope: 'control',
    allowWhenCaptured: true,
  });
  const currentScreen = screens.find((screen) => screen.id === router.current) ?? screens[0]!;
  const contextual = hintsMap[router.current] ?? currentScreen.hints ?? [];

  const hints = commandOpen
    ? [...menuHints, {key: 'ctrl+k', label: 'close'}]
    : [
        ...controlHints,
        ...contextual.filter((hint) => !controlHints.some((control) => control.key === hint.key)),
      ];

  const menu = navScreens.map((screen) => ({
    id: screen.id,
    label: screen.label,
    hint: 'Go to screen',
  }));

  if (scan.status === 'success')
    menu.push(
      {id: 'scan:filter', label: 'Filter skills', hint: 'Scan'},
      {id: 'scan:review', label: 'Review selection', hint: 'Scan'},
    );

  if (scan.status !== 'loading')
    menu.push({id: 'scan:refresh', label: 'Rescan project', hint: 'Read-only scan'});
  menu.push({id: 'registry:add', label: 'Add registry', hint: 'Review before saving a reference'});

  return (
    <AppShell
      header={
        <Header
          title="nosey"
          version={pkg.version}
          right={<Badge tone="muted">{theme.name}</Badge>}
        />
      }
      nav={<Tabs items={navScreens} activeId={tab} />}
      footer={
        <StatusBar
          hints={hints}
          globalHints={
            commandOpen || captured
              ? []
              : getGlobalKeys(navScreens.length).filter((hint) =>
                  ['ctrl+k', 'tab', '?', 'q'].includes(hint.key),
                )
          }
        />
      }
    >
      {scan.status === 'success' && !!scan.data.updatedRegistries?.length && (
        <StatusMessage tone="info">
          Updated Git registries: {scan.data.updatedRegistries.join(', ')}.
          {installSettings.enabled ? ' Run `npx skills update` to update installed skills.' : ''}
        </StatusMessage>
      )}
      {commandOpen && (
        <CommandMenu
          items={menu}
          onCancel={() => setCommandOpen(false)}
          onSelect={(id) => {
            setCommandOpen(false);

            if (id.includes(':')) {
              router.replace(id.startsWith('scan:') ? 'home' : 'registry');
              requestAction(id);
            } else router.replace(id);
          }}
        />
      )}
      {[...new Set([...visited, router.current])]
        .values()
        .filter((id) => id !== 'registry-setup' || id === router.current)
        .map((id) => {
          const Screen = (screens.find((screen) => screen.id === id) ?? screens[0]!).Component;
          const active = !commandOpen && id === router.current;

          return (
            <Box key={id} display={active ? 'flex' : 'none'} flexDirection="column">
              <InputActivityProvider active={active}>
                <Screen />
              </InputActivityProvider>
            </Box>
          );
        })
        .toArray()}
    </AppShell>
  );
}

export const App = ({options}: {options: AppOptions}) => (
  <AppProviders options={options}>
    {options.compactMode && canonicalScreen(options.screen) === 'home' ? (
      <InputActivityProvider active>
        <CompactScanScreen />
      </InputActivityProvider>
    ) : (
      <Shell />
    )}
  </AppProviders>
);

export function PlainView({options}: {options: AppOptions}) {
  const Screen = (
    screens.find((screen) => screen.id === canonicalScreen(options.screen)) ?? screens[0]!
  ).Component;

  return (
    <AppProviders options={{...options, static: true}}>
      <AppShell header={<Header title="nosey" version={pkg.version} />}>
        <Screen />
      </AppShell>
    </AppProviders>
  );
}

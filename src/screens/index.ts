import type {ComponentType} from 'react';
import type {KeyHint} from '../keys';
import {HomeScreen, scanHints} from './Home';
import {HelpScreen} from './Help';
import {SettingsScreen} from './Settings';
import {RegistryManagerScreen} from './RegistryManager';
import {RegistrySetupScreen} from './RegistrySetup';

export interface ScreenDef {
  id: string;
  label: string;
  Component: ComponentType;
  showInNav?: boolean;
  hints?: readonly KeyHint[];
}

export const screens: ScreenDef[] = [
  {id: 'home', label: 'Scan', Component: HomeScreen, hints: scanHints},
  {
    id: 'registry',
    label: 'Registries',
    Component: RegistryManagerScreen,
    hints: [
      {key: 'a', label: 'add'},
      {key: 'i', label: 'initialize'},
      {key: 'g', label: 'new scope'},
      {key: 'r', label: 'refresh'},
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    Component: SettingsScreen,
    hints: [
      {key: 'up/down', label: 'section'},
      {key: 'enter', label: 'edit'},
      {key: 's', label: 'save'},
      {key: 'd', label: 'discard'},
      {key: 'w', label: 'wizard'},
    ],
  },
  {id: 'help', label: 'Help', Component: HelpScreen},
  {id: 'skills', label: 'Scan', Component: HomeScreen, showInNav: false},
  {
    id: 'registry-setup',
    label: 'Initialize registry',
    Component: RegistrySetupScreen,
    showInNav: false,
  },
];

export const navScreens = screens.filter((screen) => screen.showInNav !== false);
export const screenIds = screens.map((screen) => screen.id);
export const isScreenId = (id: string) => screenIds.includes(id);
export const canonicalScreen = (id: string) => (id === 'skills' ? 'home' : id);

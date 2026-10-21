import type {ComponentType} from 'react';
import {GalleryScreen} from './Gallery';
import {HelpScreen} from './Help';
import {HomeScreen} from './Home';
import {SettingsScreen} from './Settings';
import {SkillBrowserScreen} from './SkillBrowser';
import {RegistryManagerScreen} from './RegistryManager';
import {RegistrySetupScreen} from './RegistrySetup';

export interface ScreenDef {
  id: string;
  label: string;
  Component: ComponentType;
  showInNav?: boolean;
}
export const screens: ScreenDef[] = [
  {id: 'home', label: 'Scan', Component: HomeScreen},
  {id: 'skills', label: 'Skills', Component: SkillBrowserScreen},
  {id: 'registry', label: 'Registries', Component: RegistryManagerScreen},
  {id: 'settings', label: 'Settings', Component: SettingsScreen},
  {id: 'help', label: 'Help', Component: HelpScreen},
  {id: 'registry-setup', label: 'Registry setup', Component: RegistrySetupScreen, showInNav: false},
  {id: 'gallery', label: 'Gallery', Component: GalleryScreen, showInNav: false},
];
export const navScreens = screens.filter((screen) => screen.showInNav !== false);
export const screenIds = screens.map((screen) => screen.id);
export const isScreenId = (id: string) => screenIds.includes(id);

import type {ComponentType} from 'react';
import {GalleryScreen} from './Gallery';
import {HelpScreen} from './Help';
import {HomeScreen} from './Home';
import {SettingsScreen} from './Settings';

export interface ScreenDef {
  id: string;
  label: string;
  Component: ComponentType;
  /** Hidden development screens remain addressable via --screen. */
  showInNav?: boolean;
}

/** Visible order controls tab order and numeric shortcuts. */
export const screens: ScreenDef[] = [
  {id: 'home', label: 'Home', Component: HomeScreen},
  {id: 'settings', label: 'Settings', Component: SettingsScreen},
  {id: 'help', label: 'Help', Component: HelpScreen},
  {id: 'gallery', label: 'Gallery', Component: GalleryScreen, showInNav: false},
];

export const navScreens = screens.filter((screen) => screen.showInNav !== false);
export const screenIds = screens.map((screen) => screen.id);
export const isScreenId = (id: string) => screenIds.includes(id);

import {appConfig, createConfigStore, type Config} from '../config';

export type {Config} from '../config';

export const APP_NAME = 'nosey';
export const APP_THEME_ENV = `${APP_NAME.replaceAll('-', '_').toUpperCase()}_THEME`;

export const configStore = createConfigStore(appConfig, APP_NAME);

/** Compatibility facade: callers can optionally provide an explicit JSON file path. */
export const configPath = (override?: string): string => configStore.pathFor(override);
export const loadConfig = (override?: string) => configStore.read(override);

export function saveConfig(patch: Config, override?: string): void {
  configStore.write(patch, override);
}

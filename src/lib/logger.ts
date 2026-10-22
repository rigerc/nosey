import {isString} from './values';
import {appendFileSync, mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {inspect} from 'node:util';
import {APP_NAME} from './config';

let enabled = false;

export const logPath = (): string =>
  join(
    process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'),
    APP_NAME,
    `${APP_NAME}.log`,
  );

function write(level: string, args: unknown[]) {
  if (!enabled) return;

  try {
    mkdirSync(dirname(logPath()), {recursive: true});
    const line = args.map((a) => (isString(a) ? a : inspect(a))).join(' ');
    appendFileSync(logPath(), `${new Date().toISOString()} ${level} ${line}\n`);
  } catch {
    // Logging must never break the UI.
  }
}

/** File logger. Never use console.log while Ink is rendering. */
export const logger = {
  setDebug(value: boolean) {
    enabled = value;
  },
  debug: (...args: unknown[]) => write('DEBUG', args),
  error: (...args: unknown[]) => write('ERROR', args),
};

import stringWidth from 'string-width';

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

export function relativeTime(date: Date | number, now = Date.now()): string {
  const seconds = Math.round((now - new Date(date).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function truncate(text: string, max: number, ellipsis = '…'): string {
  if (stringWidth(text) <= max) return text;
  let out = '';
  for (const ch of text) {
    if (stringWidth(out + ch + ellipsis) > max) break;
    out += ch;
  }
  return out + ellipsis;
}

export function pad(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  const gap = Math.max(0, width - stringWidth(text));
  return align === 'left' ? text + ' '.repeat(gap) : ' '.repeat(gap) + text;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Render an unknown value for display; objects never degrade to `[object Object]`. */
export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(', ');
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    case 'symbol':
      return value.toString();
    case 'function':
      return value.name || 'function';
    default:
      return JSON.stringify(value) ?? '';
  }
}

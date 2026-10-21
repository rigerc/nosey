import {useAnimation} from 'ink';

/** Milliseconds between startedAt and endedAt (or now). Ticks only while running. */
export function useElapsed(startedAt?: number, endedAt?: number): number {
  useAnimation({interval: 250, isActive: startedAt !== undefined && endedAt === undefined});
  if (startedAt === undefined) return 0;
  return (endedAt ?? Date.now()) - startedAt;
}

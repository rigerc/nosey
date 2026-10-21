import {useWindowSize} from 'ink';

/** Columns/rows, re-rendered on resize (thin wrapper over Ink's useWindowSize). */
export function useTerminalSize() {
  const {columns, rows} = useWindowSize();
  return {columns, rows, narrow: columns < 80};
}

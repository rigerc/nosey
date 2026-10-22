import {useApp} from 'ink';
import {useCallback} from 'react';

/** Exit Ink cleanly and set the process exit code. */
export function useExit() {
  const {exit} = useApp();

  return useCallback(
    (code = 0) => {
      process.exitCode = code;
      exit();
    },
    [exit],
  );
}

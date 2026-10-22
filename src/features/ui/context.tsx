import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {KeyHint} from '../../keys';
import {useInputActivity} from '../../hooks/useInputActivity';

interface ScreenHintsContext {
  hints: Record<string, readonly KeyHint[]>;
  setHints: (id: string, hints: readonly KeyHint[]) => void;
  action: {id: string; sequence: number};
  requestAction: (id: string) => void;
}

const Context = createContext<ScreenHintsContext>({
  hints: {},
  setHints: (_id: string, _hints: readonly KeyHint[]) => {},
  action: {id: '', sequence: 0},
  requestAction: (_id: string) => {},
});

export function ScreenHintsProvider({children}: {children: ReactNode}) {
  const [hints, update] = useState<Record<string, readonly KeyHint[]>>({});
  const [action, setAction] = useState({id: '', sequence: 0});

  const requestAction = useCallback(
    (id: string) => setAction((current) => ({id, sequence: current.sequence + 1})),
    [],
  );

  const setHints = useCallback(
    (id: string, next: readonly KeyHint[]) => update((current) => ({...current, [id]: next})),
    [],
  );

  return (
    <Context.Provider value={{hints, setHints, action, requestAction}}>{children}</Context.Provider>
  );
}

export const useUiActions = () => useContext(Context);

export function useUiAction(id: string, run: () => void) {
  const {action} = useContext(Context);
  const active = useInputActivity();
  const seen = useRef(0);
  useEffect(() => {
    if (active && action.id === id && action.sequence !== seen.current) {
      seen.current = action.sequence;
      run();
    }
  }, [id, action, active, run]);
}

export const useScreenHintsMap = () => useContext(Context).hints;

export function useScreenHints(id: string, hints: readonly KeyHint[]) {
  const {setHints} = useContext(Context);
  const active = useInputActivity();
  const key = JSON.stringify(hints);
  useEffect(() => {
    if (active) setHints(id, JSON.parse(key));
  }, [id, key, active, setHints]);
}

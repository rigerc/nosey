import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import {useInputActivity} from './useInputActivity';

export interface FooterHint {
  key: string;
  label: string;
}
const Context = createContext({
  hints: [] as readonly FooterHint[],
  publish: (_id: string, _hints: readonly FooterHint[]) => {},
  remove: (_id: string) => {},
});

/** Input owners publish their current actions without coupling controls to screen routes. */
export function FooterHintsProvider({children}: {children: ReactNode}) {
  const [owners, setOwners] = useState(new Map<string, readonly FooterHint[]>());
  const publish = useCallback((id: string, hints: readonly FooterHint[]) => {
    setOwners((current) => new Map(current).set(id, hints));
  }, []);
  const remove = useCallback((id: string) => {
    setOwners((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);
  const hints = [...owners.values()].at(-1) ?? [];
  return <Context.Provider value={{hints, publish, remove}}>{children}</Context.Provider>;
}
export const useActiveFooterHints = () => useContext(Context).hints;
export function useFooterHints(hints: readonly FooterHint[], active = true) {
  const id = useId();
  const {publish, remove} = useContext(Context);
  const visible = useInputActivity();
  const key = JSON.stringify(hints);
  useLayoutEffect(() => {
    if (active && visible) publish(id, JSON.parse(key));
    return () => remove(id);
  }, [active, visible, key, id, publish, remove]);
}

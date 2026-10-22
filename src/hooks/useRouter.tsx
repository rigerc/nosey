import {createContext, useCallback, useContext, useMemo, useState, type ReactNode} from 'react';

interface Router {
  current: string;
  push: (id: string) => void;
  pop: () => void;
  replace: (id: string) => void;
  canGoBack: boolean;
}

const RouterContext = createContext<Router | null>(null);

/** A tiny screen stack. Swap for a real router if you outgrow it. */
export function RouterProvider({initial, children}: {initial: string; children: ReactNode}) {
  const [stack, setStack] = useState<string[]>([initial]);
  const push = useCallback((id: string) => setStack((s) => [...s, id]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const replace = useCallback((id: string) => setStack((s) => [...s.slice(0, -1), id]), []);

  const value = useMemo<Router>(
    () => ({current: stack.at(-1)!, push, pop, replace, canGoBack: stack.length > 1}),
    [stack, push, pop, replace],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): Router {
  const router = useContext(RouterContext);

  if (!router) throw new Error('useRouter must be used inside <RouterProvider>');

  return router;
}

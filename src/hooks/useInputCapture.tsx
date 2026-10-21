import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const CaptureContext = createContext({captured: false, capture: (): (() => void) => () => {}});

/** Lets text inputs suspend host shortcuts without depending on a particular app shell. */
export function InputCaptureProvider({children}: {children: ReactNode}) {
  const [count, setCount] = useState(0);
  const capture = useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => n - 1);
  }, []);
  const value = useMemo(() => ({captured: count > 0, capture}), [count, capture]);
  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useInputCapture(active: boolean) {
  const {capture} = useContext(CaptureContext);
  useLayoutEffect(() => {
    if (active) return capture();
  }, [active, capture]);
}

export const useHasInputCapture = () => useContext(CaptureContext).captured;

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'success' | 'danger' | 'warn' | 'info';
export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  toasts: ToastItem[];
  push: (message: string, tone?: ToastTone, ms?: number) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi>({toasts: [], push() {}, dismiss() {}});

export function ToastProvider({children}: {children: ReactNode}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach(clearTimeout);
  }, []);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback<ToastApi['push']>(
    (message, tone = 'info', ms = 3000) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), {id, tone, message}]);
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        dismiss(id);
      }, ms);
      timers.current.add(timer);
    },
    [dismiss],
  );

  const value = useMemo(() => ({toasts, push, dismiss}), [toasts, push, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export const useToast = () => useContext(ToastContext);

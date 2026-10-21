import {createContext, useContext, type ReactNode} from 'react';
import type {Config} from './schema';

interface Runtime {
  path?: string;
  flags?: Partial<Config>;
}

const Context = createContext<Runtime>({});

export function ConfigRuntimeProvider({path, flags, children}: Runtime & {children: ReactNode}) {
  return <Context.Provider value={{path, flags}}>{children}</Context.Provider>;
}

export function useConfigRuntime() {
  return useContext(Context);
}

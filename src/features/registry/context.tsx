import {createContext, useContext, type ReactNode} from 'react';
import type {RegistryInitOptions} from '../../lib/registry/init.js';

const Context = createContext<RegistryInitOptions>({});
export function RegistryInitProvider({options, children}: {
  options?: RegistryInitOptions;
  children: ReactNode;
}) {
  return <Context.Provider value={options ?? {}}>{children}</Context.Provider>;
}
export const useRegistryInitOptions = () => useContext(Context);

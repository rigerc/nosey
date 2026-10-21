import {createContext, useContext, type ReactNode} from 'react';

const Context = createContext(true);

/** Mounted screens retain state, but only the visible surface can receive input. */
export function InputActivityProvider({active, children}: {active: boolean; children: ReactNode}) {
  return <Context.Provider value={active}>{children}</Context.Provider>;
}

export const useInputActivity = () => useContext(Context);

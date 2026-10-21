import {useCallback, useEffect, useRef, useState} from 'react';
import {toAppError, type AppError} from '../lib/errors';

type State<T> =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; data: T}
  | {status: 'error'; error: AppError};

/** Run an async function; ignores results after unmount or when superseded. */
export function useAsync<T, A extends unknown[]>(fn: (...args: A) => Promise<T>) {
  const [state, setState] = useState<State<T>>({status: 'idle'});
  const alive = useRef(true);
  const runId = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async (...args: A): Promise<T | undefined> => {
    const id = ++runId.current;
    const current = () => alive.current && id === runId.current;
    setState({status: 'loading'});
    try {
      const data = await fnRef.current(...args);
      if (current()) setState({status: 'success', data});
      return data;
    } catch (error) {
      if (current()) setState({status: 'error', error: toAppError(error)});
      return undefined;
    }
  }, []);

  return {...state, run};
}

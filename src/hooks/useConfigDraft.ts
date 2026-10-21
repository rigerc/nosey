import {useState} from 'react';
import {getAtPath, setAtPath} from '../config';
import {configStore, type Config} from '../lib/config';

/** Reusable transactional draft: no file changes until save(). */
export function useConfigDraft(path?: string) {
  const [loaded, setLoaded] = useState(() => configStore.read(path));
  const [draft, setDraft] = useState<Config>(loaded.config);
  const [error, setError] = useState(loaded.error);

  const update = (fieldPath: string, value: unknown) => {
    setDraft((current) => setAtPath(current, fieldPath, value));
    setError(undefined);
  };
  const discard = () => {
    setDraft(loaded.config);
    setError(loaded.error);
  };
  const save = () => {
    if (loaded.error) throw new Error(loaded.error);
    try {
      const result = configStore.write(draft, path);
      setLoaded({config: result, path: configStore.pathFor(path)});
      setDraft(result);
      setError(undefined);
      return result;
    } catch (cause) {
      setError((cause as Error).message);
      throw cause;
    }
  };
  const changed = JSON.stringify(draft) !== JSON.stringify(loaded.config);
  return {
    draft,
    update,
    discard,
    save,
    changed,
    error,
    path: loaded.path,
    get: (field: string) => getAtPath(draft, field),
  };
}

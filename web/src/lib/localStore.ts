// localStorageの読み書きに購読通知を付けた小さなストア。
// useSyncExternalStoreと組み合わせてSSR/ハイドレーション安全にクライアント保存値を読む。
type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribeKey(key: string, cb: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
  };
}

export function getKey(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setKey(key: string, value: string): void {
  window.localStorage.setItem(key, value);
  listeners.get(key)?.forEach((cb) => cb());
}

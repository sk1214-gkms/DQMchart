'use client';
// 画面の選択状態をブラウザに覚えさせるフック。
//
// スマホではメモリ不足でタブが破棄され、戻ってくると再読み込みになることがある。
// useStateだけで持っていると選び直しからやり直しになるので、選択は保存しておく。
import { useCallback, useSyncExternalStore } from 'react';
import { getKey, setKey, subscribeKey } from './localStore';

export function useStoredValue(
  key: string,
  isValid: (value: string) => boolean,
): [string, (value: string) => void] {
  const subscribe = useCallback((cb: () => void) => subscribeKey(key, cb), [key]);
  const stored = useSyncExternalStore(
    subscribe,
    () => getKey(key),
    () => null, // サーバー側では何も無い扱いにしてハイドレーションのずれを避ける
  );
  const value = stored && isValid(stored) ? stored : '';
  const setValue = useCallback((next: string) => setKey(key, next), [key]);
  return [value, setValue];
}

'use client';
// 対象タイトル（DQM3等）の選択状態を全ページで共有するプロバイダ。
// 選択はlocalStorageに保持し、useSyncExternalStoreでSSR安全に読む。
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { TitleData } from '@/lib/engine/types';
import { getKey, setKey, subscribeKey } from '@/lib/localStore';
import { getTitle, listTitles } from '@/lib/titles';

const STORAGE_KEY = 'haigou-title-v1';
const DEFAULT_TITLE = 'dqm3';

const TitleContext = createContext<{
  titleId: string;
  setTitleId: (id: string) => void;
}>({ titleId: DEFAULT_TITLE, setTitleId: () => {} });

function subscribe(cb: () => void): () => void {
  return subscribeKey(STORAGE_KEY, cb);
}

function getSnapshot(): string | null {
  return getKey(STORAGE_KEY);
}

function getServerSnapshot(): string | null {
  return null;
}

export function TitleProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const titleId =
    stored && listTitles().some((t) => t.id === stored) ? stored : DEFAULT_TITLE;
  const setTitleId = (id: string) => setKey(STORAGE_KEY, id);

  return (
    <TitleContext.Provider value={{ titleId, setTitleId }}>{children}</TitleContext.Provider>
  );
}

export function useTitleData(): TitleData {
  const { titleId } = useContext(TitleContext);
  return getTitle(titleId);
}

export function TitleSwitcher() {
  const { titleId, setTitleId } = useContext(TitleContext);
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-600">
      対象タイトル
      <select
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
        value={titleId}
        onChange={(e) => setTitleId(e.target.value)}
      >
        {listTitles().map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}

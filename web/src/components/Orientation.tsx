'use client';
// フロー図の向き（縦＝親が上／横＝親が左）の設定と切り替えUI。
// 設定はブラウザに保存し、自動生成と手動エディタで共有する。
import { useSyncExternalStore } from 'react';
import { getKey, setKey, subscribeKey } from '@/lib/localStore';

export type Orientation = 'vertical' | 'horizontal';

const STORAGE_KEY = 'haigou-orientation-v1';
const DEFAULT: Orientation = 'vertical';

function subscribe(cb: () => void): () => void {
  return subscribeKey(STORAGE_KEY, cb);
}

function getSnapshot(): string | null {
  return getKey(STORAGE_KEY);
}

function getServerSnapshot(): string | null {
  return null;
}

export function useOrientation(): [Orientation, (v: Orientation) => void] {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const orientation: Orientation = stored === 'horizontal' ? 'horizontal' : DEFAULT;
  return [orientation, (v: Orientation) => setKey(STORAGE_KEY, v)];
}

const options: Array<{ value: Orientation; label: string; icon: string }> = [
  { value: 'vertical', label: '縦（親が上）', icon: '↓' },
  { value: 'horizontal', label: '横（親が左）', icon: '→' },
];

export function OrientationToggle({
  value,
  onChange,
}: {
  value: Orientation;
  onChange: (v: Orientation) => void;
}) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-lg border"
      style={{ borderColor: 'var(--border)' }}
      role="group"
      aria-label="フロー図の向き"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`flex min-h-11 items-center gap-1.5 px-3 text-sm transition ${
              on
                ? 'bg-[var(--brand-700)] font-semibold text-white'
                : 'bg-white text-[var(--muted)] hover:bg-[#f2f5fc]'
            }`}
          >
            <span aria-hidden>{o.icon}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

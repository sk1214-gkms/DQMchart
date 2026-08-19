// タイトル（作品）マスタデータの読み込み。
// 当面はJSON同梱。タイトル追加時は data/titles/ にJSONを置いてここに登録する。
import type { TitleData } from './engine/types';
import dqm3 from '@/data/titles/dqm3.json';
import iruruka from '@/data/titles/iruruka.json';
import terrysp from '@/data/titles/terrysp.json';
import dqmj3 from '@/data/titles/dqmj3.json';

const titles: TitleData[] = [
  dqm3 as TitleData,
  iruruka as TitleData,
  terrysp as TitleData,
  dqmj3 as TitleData,
];

export function listTitles(): TitleData[] {
  return titles;
}

export function getTitle(id: string): TitleData {
  const t = titles.find((x) => x.id === id);
  if (!t) throw new Error(`未登録のタイトルです: ${id}`);
  return t;
}

// タイトル（作品）マスタデータの読み込み。
// 当面はJSON同梱。タイトル追加時は data/titles/ にJSONを置いてここに登録する。
import type { TitleData } from './engine/types';
import dqm3 from '@/data/titles/dqm3.json';
import iruruka3ds from '@/data/titles/iruruka3ds.json';
import iruruka from '@/data/titles/iruruka.json';
import terry3d from '@/data/titles/terry3d.json';
import terrysp from '@/data/titles/terrysp.json';
import dqmj3 from '@/data/titles/dqmj3.json';
import dqmj3p from '@/data/titles/dqmj3p.json';
import dqmj1 from '@/data/titles/dqmj1.json';
import dqmj2 from '@/data/titles/dqmj2.json';
import dqmj2p from '@/data/titles/dqmj2p.json';

const titles: TitleData[] = [
  dqm3 as TitleData,
  iruruka3ds as TitleData,
  iruruka as TitleData,
  terry3d as TitleData,
  terrysp as TitleData,
  dqmj3 as TitleData,
  dqmj3p as TitleData,
  dqmj1 as TitleData,
  dqmj2 as TitleData,
  dqmj2p as TitleData,
];

export function listTitles(): TitleData[] {
  return titles;
}

export function getTitle(id: string): TitleData {
  const t = titles.find((x) => x.id === id);
  if (!t) throw new Error(`未登録のタイトルです: ${id}`);
  return t;
}

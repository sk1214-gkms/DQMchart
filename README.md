# 配合チャートメーカー

ドラゴンクエストモンスターズの配合チャートを作成するWebアプリ。
初回対応タイトルは **DQM3**（DQM4も同方式と想定した拡張可能設計）。

## 起動

```
cd web
npm ci
npm run dev   # → http://localhost:3000
```

## テスト・品質ゲート

```
cd web
npm test           # vitest（配合ルールエンジンのユニットテスト）
npm run lint       # eslint
npm run typecheck  # next typegen + tsc --noEmit
npm run build      # 本番ビルド検証
```

## 設定

`web/.env.example` をコピーして `web/.env.local` を作る。
現時点で必須の環境変数はない（Supabase導入時に追記予定）。

## 主な機能

| 画面 | 内容 |
|---|---|
| `/simulate` | 配合シミュレータ: 親2体 → 子候補（通常配合＋特殊配合） |
| `/auto` | 自動チャート生成: 目標モンスターから野生入手可能モンスターまで配合ツリーを逆算 |
| `/editor` | 手動チャートエディタ: React Flowで配置・接続、ルールエンジンで成立判定、ブラウザ内保存 |

## 構成

- `web/src/lib/engine/` — 配合ルールエンジン（UI非依存の純粋ロジック）。
  タイトルごとに `BreedingRuleset` 実装を追加し `registry.ts` に登録する。
  DQM3方式: 通常配合は「系統ペア×ランク」テーブル参照（親よりランクの高い子は生まれない）、
  ランクアップは特殊配合のみ。
- `web/src/data/titles/` — タイトル別マスタデータ（JSON）。**現在は検証用サンプルデータ**であり、
  実際のゲームの配合表とは異なる（アプリ内にも注記表示あり）。
- `web/src/lib/storage.ts` — チャート保存の抽象。現在はlocalStorage実装。
  Supabase（Googleログイン・アカウント別保存）導入時に実装を差し替える。
- `設計/配合チャートアプリ_全体構成.drawio` — アーキテクチャ・データモデル図（シートがバージョン履歴）。

## ロードマップ

1. ~~DQM3ルールエンジン＋3画面のMVP~~（完了）
2. DQM3実データの投入（配合表・モンスター一覧）
3. Supabase導入（Googleログイン＋アカウント別チャート保存）
4. Vercel公開（URL限定・検索エンジン非掲載）
5. 追加タイトル対応（位階配合タイトル、将来のDQM4）・4体配合対応

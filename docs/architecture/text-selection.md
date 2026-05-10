# テキスト入力の範囲選択・削除 設計書

## 概要

CHACRAM のプロンプト入力エリアで、テキストを範囲選択し、まとめて削除・コピー・置換する機能の設計。
キーボード操作（Shift+Arrow）とマウスドラッグの両方に対応する。

## アーキテクチャ原則

**Cursor クラスを選択状態の Single Source of Truth とする。**

```
┌────────────────────────────────────────────────────────────┐
│  入力方式                                                   │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ キーボード   │  │ マウスドラッグ  │  │ テキスト入力    │       │
│  │ Shift+→    │  │ 生の座標→offset│  │ (選択置換)     │       │
│  └─────┬──────┘  └──────┬───────┘  └──────┬───────┘       │
│        │                │                 │               │
│        ▼                ▼                 ▼               │
│  ┌──────────────────────────────────────────────────┐     │
│  │              Cursor.selection                     │     │
│  │  anchor (number) ── offset (number)              │     │
│  │  -1 = 選択なし                                     │     │
│  │  anchor ≠ offset = 選択あり                        │     │
│  └──────────────────────┬───────────────────────────┘     │
│                         │                                 │
│                         ▼                                 │
│  ┌──────────────────────────────────────────────────┐     │
│  │  操作                                              │     │
│  │  deleteSelection() / selectedText()               │     │
│  │  renderLineWithSelection()                        │     │
│  └──────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────┘
```

Ink の `selection.ts` は**出力エリア（会話履歴）のテキスト選択のみ**を担当する。
入力欄の選択は完全に Cursor ドメインで完結させ、両者をブリッジしない。

## 責任境界

```
┌─ 画面全体 ──────────────────────────────────────────┐
│                                                      │
│  ┌─ 出力エリア（会話履歴）──────────────┐             │
│  │                                       │             │
│  │  選択方式: Ink selection.ts           │             │
│  │  操作: マウスドラッグ→コピー            │             │
│  │                                       │             │
│  └───────────────────────────────────────┘             │
│                                                      │
│  ┌─ 入力エリア（プロンプト）──────────────┐            │
│  │                                       │             │
│  │  選択方式: Cursor.selection           │             │
│  │  操作: 削除/コピー/置換                 │             │
│  │  マウス→offset: render() 時に構築した   │             │
│  │  逆引きマップで変換                      │             │
│  │                                       │             │
│  └───────────────────────────────────────┘             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Ink 選択と Cursor 選択は**別物**。二重管理しない。テキストマッチでブリッジしない。

## レイヤー構成

| レイヤー | ファイル | 責務 |
|---------|---------|------|
| 表示 | `Cursor.render()` / `renderLineWithSelection()` | 選択範囲の反転描画（SGR-7 inverse） |
| 表示+マッピング | `Cursor.renderWithMapping()` | レンダリング結果 + 「画面座標→offset」マップのセットを返す |
| 操作 | `Cursor.deleteSelection()` / `selectedText()` | 選択テキストの削除・取得 |
| 状態 | `Cursor.selection` (anchor) | 選択区間の保持（文字列オフセット） |
| キーボード入力 | `useTextInput.ts` / `mapKey()` | Shift+Arrow で選択拡大、Backspace で削除 |
| マウス入力 | 生のマウスイベント→座標マップ逆引き→`Cursor.selection` | 画面座標を offset に変換して Cursor 選択更新 |

## データモデル

### Cursor.selection

```typescript
class Cursor {
  readonly offset: number       // カーソル位置（文字列内のオフセット）
  readonly selection: number    // 選択アンカー。-1 = 選択なし
}
```

- `selection >= 0 && selection !== offset` → 選択あり
- `Math.min(offset, selection)` → 選択開始位置
- `Math.max(offset, selection)` → 選択終了位置

### 画面座標→offset マップ（新規）

```typescript
// Cursor.render() の拡張返り値
type RenderResult = {
  text: string                                    // 描画テキスト（既存）
  cursorLine: number
  cursorColumn: number
  offsetAt: (row: number, col: number) => number  // 画面座標→文字列オフセット
}
```

`offsetAt(row, col)` は、入力エリア内の相対的な行・列指定に対して、対応する文字列オフセットを返す。
範囲外は `null`。

render() 内で各行のレンダリング時に構築する:

```
各行の lineCharStart を使って:
  row=0, col=0..N → lineCharStart + display-to-string(col)
  row=1, col=0..N → ...
```

## マウス→Cursor 選択の変換フロー

```
マウスダウン (row, col)
  → offsetAt(row, col) → anchor offset = その offset
  → Cursor.selection = anchor offset

マウスドラッグ (row, col)
  → offsetAt(row, col) → focus offset = その offset
  → Cursor.offset = focus offset, selection = anchor（不变）
  → renderLineWithSelection() が自動で反転描画

マウスアップ
  → 選択完了。Backspace/Delete で削除可能に。
```

### ダブルクリック→単語選択

```
ダブルクリック (row, col)
  → offsetAt(row, col) → clickOffset
  → tempCursor = Cursor(clickOffset)
  → wordStart = tempCursor.prevWord().offset
  → wordEnd   = tempCursor.nextWord().offset
  → anchor = wordStart, offset = wordEnd
```

### トリプルクリック→行選択

```
トリプルクリック (row, col)
  → offsetAt(row, col) → clickOffset
  → tempCursor = Cursor(clickOffset)
  → lineStart = tempCursor.startOfLine().offset
  → lineEnd   = tempCursor.endOfLine().offset
  → anchor = lineStart, offset = lineEnd
```

## 現在の実装状況

### Phase 1: renderWithMapping の実装 ✅ 完了

- [x] `Cursor.renderWithMapping()`: 描画テキスト + `offsetAt(row, col)` マップを返す
- [x] `MeasuredText.getOffsetFromPosition()` を活用（新規 API 追加不要だった）
- [x] 単体テスト: 28 tests pass（`src/__tests__/cursor-render-mapping.test.ts`）
- [x] 単一行・複数行・折り返し・CJK・viewport scroll・範囲外の全ケースカバー

### Phase 2: マウスイベントハンドリング ✅ 実装済み（ランタイム検証中）

**実装内容:**

- [x] Ink の `useSelection().subscribe()` で drag-end を検知
- [x] `getState()` → anchor/focus 画面座標 → Box 位置で相対変換 → `getOffsetFromPosition()` → `updateRenderedInput()` で Cursor 選択に反映
- [x] Box 位置の捕捉は 2 経路：
  - `handleInputClick`（ClickEvent から `e.col - e.localCol` で即時取得）
  - `useEffect` + `inputBoxRef` + `nodeCache`（毎レンダーで取得、ドラッグ開始前でも設定済み）
- [x] 古い B案コード削除（テキストマッチ→座標変換に完全置き換え）
- [x] `BaseTextInputProps` に `selectionSyncRef` 追加
- [x] `TextInput.tsx` / `PromptInput.tsx` に prop pass-through

**実装中に発見・修正したバグ:**

1. **`onOffsetChange` → `selectionAnchor` リセット競合**
   - マウス選択 sync が `updateRenderedInput(value, offset, anchor)` で選択セット
   - 直後の `onOffsetChange(offset)` が `externalOffset` 変更を引き起こす
   - `useLayoutEffect` が `updateRenderedInput(originalValue, externalOffset)` を `selectionAnchor=-1` で上書き
   - **修正**: `updateRenderedInput` 内で `lastSeenPropsRef` も更新 → `useLayoutEffect` が差分を検知せずスキップ

2. **Box 位置が初回ドラッグで null**
   - `handleInputClick` は ClickEvent（ドラッグなしクリック）でしか発火しない
   - 初回のマウスドラッグ時は `selectionSyncRef.current` が null → sync 失敗
   - **修正**: `useEffect` + `nodeCache` で毎レンダー後に Box 位置を取得（クリック不要）

**要ランタイム検証:**
- [ ] マウスドラッグ→Backspace/Delete で選択範囲削除
- [ ] Ink 選択が出力エリアで引き続き正常動作（リグレッションなし）

### Phase 3: ダブル/トリプルクリック 🔜 未着手

- [ ] クリック間隔の計測（~300ms 以内で判定）
- [ ] ダブルクリック→`prevWord()`/`nextWord()` で単語選択
- [ ] トリプルクリック→`startOfLine()`/`endOfLine()` で行選択

## Phase 分け

### Phase 1: renderWithMapping の実装 ✅

`Cursor.render()` を拡張し、描画テキストと同時に座標逆引きマップ `offsetAt(row, col)` を返す `renderWithMapping()` を実装。

- **実装**: `Cursor.ts` の `render()` 直後に `renderWithMapping()` メソッド追加
- **マップ方式**: `render()` で使われる viewport startLine と `measuredText.getOffsetFromPosition()` を組み合わせたクロージャ
- **テスト**: 28 tests (Bun)、全 pass

### Phase 2: マウスイベントハンドリング ✅

Ink の `useSelection()` で drag-end を検知 → 座標変換 → Cursor 選択更新。

**実際の実装（設計時の想定との差分）:**

| 設計 | 実際 |
|------|------|
| 生のマウスイベント座標 | Ink の `useSelection().subscribe()` 経由で `getState()` から取得 |
| `offsetAt()` で座標変換 | `getOffsetFromPosition()` を直接使用（内部ロジックは同一） |
| `setValue(text, offset, anchor)` | `updateRenderedInput()` + `onOffsetChange()` で更新 |

**設計変更の理由:**
- Ink は React に mousedown/mousemove イベントを公開していない（ClickEvent のみ）
- 代わりに `useSelection().subscribe()` が drag 状態変化を通知
- `getOffsetFromPosition()` は `offsetAt()` と同一のロジックだが、viewport offset を呼び出し側で加算する方式

### Phase 3: ダブル/トリプルクリック 🔜

未着手。ClickEvent のクリック間隔計測で実装予定。

## 判断メモ

- **なぜ Ink 選択と Cursor 選択を分離するのか**: Ink の `selection.ts` はスクリーンバッファに対する選択機構で、出力エリアのテキストを選択してコピーするのが目的。入力欄はアプリケーションロジックであり、編集操作（削除・置換・元に戻す）を伴う。この2つをブリッジする必然性はない。分離することで二重管理もテキストマッチの曖昧性も消える。

- **なぜ Cursor 側に selection 状態を持たせたのか**: キーボード選択（Shift+Arrow）を実装する時点で、offset だけでは表現できない。anchor が必要だった。マウスも同じ構造に乗るのが自然。

- **renderWithMapping のパフォーマンス**: `render()` は毎キーストロークで呼ばれるホットパス。マップの構築コストは各行の文字列走査のみで、O(入力文字数)。大きなボトルネックにはならないが、入力が極端に長い（数万文字）ケースでは計測が必要。

- **`onOffsetChange` → `useLayoutEffect` 競合**: `updateRenderedInput` が `lastSeenPropsRef` を合わせて更新することで解決。これは `updateRenderedInput` が「すでに親と同期済み」であることを示す設計。副作用としてキーボード入力時の挙動も変わらない（`setValue` 経由でも `updateRenderedInput` が同様に `lastSeenPropsRef` を更新するため）。

- **Box 画面位置の取得**: `useEffect` + `nodeCache` アプローチは、Ink が React の useEffect 発火タイミングまでに nodeCache を populate している前提。これが動作しない場合は `onMouseEnter` イベントでの取得や、TextInput 内部からの直接取得に切り替える。

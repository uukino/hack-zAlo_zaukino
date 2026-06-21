# 機能一覧

## 概要

**hackz-alo** — Expo (React Native) + Supabase Edge Functions で構成する音声会話アプリ。
マイクで音声を拾い、Deepgram で文字起こし、Groq (Llama-3.1-8b-instant) で AI 返答を生成する。
会話中に「うん」を検出すると通知と視覚エフェクトが発火し、「うんせい」と言うと雲占いが起動する。

---

## 技術の無駄遣い度

> ハッカソン精神で「やりたいからやった」技術選択を整理する。

| # | 無駄遣いポイント | 詳細 |
|---|----------------|------|
| 1 | **「うん」のためだけに Deepgram を 2 並列呼び出し** | `smart_format=true/false` を同時リクエストするのは、ひらがなの「うん」を取りこぼさないため。検出精度のために API コストを 2 倍払っている。 |
| 2 | **「うん」を検出するためだけのサーバーサイド正規表現** | 漢字「運」「雲」の音読み判定まで書いた `containsUn()` は、あいづち一語を捕まえるためだけのロジック。 |
| 3 | **Supabase Edge Functions (Deno) を 4 本も立てる** | `start-conversation` / `transcribe` / `handle-transcript` / `fortune` と責務を分割。1 関数でもまったく問題ないスケール感で、マイクロサービス的構成を採用している。 |
| 4 | **物理エンジン自作 (ParticleText)** | 「うん」を言ったときのエフェクトのために重力・空気抵抗・床バウンドを rAF ループで手書き。ライブラリを使えば 5 行で済む。 |
| 5 | **4 エフェクトのうち 1 つが「何も起きない」** | `none` を確率 25% で引いたとき、カウントダウンだけ走って何も起きない。ユーザー体験的にはデバッグ漏れに見えるが、これが仕様。 |
| 6 | **雲占いに Groq LLM を使う** | 運勢ランクと雲量 % から一言メッセージを生成するのに LLM を呼ぶ。テーブルで事前定義すれば十分な用途に生成 AI を投入している。 |
| 7 | **GPS → 雲量 → 運勢 → AI というチェーン全体が「うんせい」の一言のため** | ユーザーが「うんせい」と発声するだけで位置情報取得・外部 API・LLM 生成が一気に走る。重厚なパイプラインが一言に集約されている。 |
| 8 | **21 種の性格プリセットを毎回ランダム選択** | 会話のたびに AI の人格が変わるため、ユーザーは一貫した相手と話せない。体験コストが高い割に恩恵が不明瞭。 |

---

## 技術レベルの読み取りポイント

> コードから読み取れる実装者のスキルセットを示す。

### 高難度・独自実装

| 項目 | 根拠 |
|------|------|
| **RMS ベースの発話検出** | PCM バイト列を 16bit サンプルに手動デコードして RMS 計算。DSP の基礎知識が必要。 |
| **パーティクル物理エンジン (rAF ループ)** | 重力・ドラッグ・バウンスを毎フレーム更新し、`Animated.ValueXY` に書き込む。React Native の Animated と rAF の相互運用を理解していないと書けない。 |
| **Deepgram 並列リクエスト設計** | smart_format の違いによる検出精度差を理解した上で、`Promise.all` で同一音声を 2 種類のパラメータで転記している。API 仕様の深掘りができている。 |
| **漢字音読み判定の正規表現** | 「運ぶ」系の訓読みを送り仮名で排除し、「雲」を隣接漢字の有無で判定する。日本語の形態論的知識が正規表現に反映されている。 |
| **Supabase RLS × Edge Functions の組み合わせ** | クライアント認証トークンを Edge Function 内で再検証し、service role key で DB 操作する二段構えのセキュリティ設計。 |

### 標準的・教科書的

| 項目 | 根拠 |
|------|------|
| `useCallback` / `useRef` の適切な使用 | `conversationIdRef` でクロージャ問題を回避するなど、React の落とし穴を把握している。 |
| Expo Permissions のプラットフォーム分岐 | Android/iOS それぞれの権限フローを正しく分岐している。 |
| Edge Function のログ設計 | `TAG` プレフィックスと番号付きステップで追跡しやすいログを統一している。 |

### 荒削り・改善余地あり

| 項目 | 根拠 |
|------|------|
| **エラー時のユーザー体験が薄い** | `callError` を state で持つが、UI 上でどう表示するかはコンポーネント側に丸投げ。リトライ機構もない。 |
| **`muteAudio()` の呼び出しタイミングが未定義** | 関数は実装されているが、フックや UI 側からいつ呼ぶかが設計されていない (AI 返答中の二重録音問題が潜在)。 |
| **`fortune` Edge Function が認証を検証するが使わない** | user を取得して認証チェックするが、fortune 生成自体に user_id は不要。一貫性のためだけに存在している。 |
| **パーティクルの grains が `useMemo` 依存を手動管理** | `[layout, text]` と書いており `physics` が依存に含まれていない。ESLint の exhaustive-deps に引っかかる実装。 |

---

## 1. 認証

| 項目 | 内容 |
|------|------|
| 実装 | [LoginScreen.tsx](../src/components/LoginScreen.tsx) |
| 方式 | Supabase Auth (メール/パスワード) |
| 機能 | ログイン・新規登録・確認メール送信 |

---

## 2. 音声会話

### 2-1. 音声録音・無音検出

**ファイル:** [src/services/audio.ts](../src/services/audio.ts)

- `react-native-live-audio-stream` で 16kHz / 16bit PCM / mono をリアルタイム取得
- RMS (二乗平均平方根) で音量を計算し、閾値 `500` を超えたら発話開始と判定
- 発話後に 800ms 無音が続いたら発話終了 → バッファをフラッシュ
- バッファが約 5 秒分 (160,000 bytes) に達したら強制フラッシュ
- `muteAudio()` / `unmuteAudio()` で AI 返答中にエコーを防ぐミュート制御

### 2-2. 文字起こし

**ファイル:** [src/services/transcribe.ts](../src/services/transcribe.ts)  
**Edge Function:** [supabase/functions/transcribe/index.ts](../supabase/functions/transcribe/index.ts)

- 音声チャンク (ArrayBuffer) を Edge Function に POST
- Deepgram `nova-2` モデル (日本語) を**並列 2 リクエスト**で呼び出す
  - `smart_format=true` → 表示・AI 入力用 (`transcript`)
  - `smart_format=false` → 「うん」検出用 (`rawTranscript`)

### 2-3. AI 返答生成

**Edge Function:** [supabase/functions/handle-transcript/index.ts](../supabase/functions/handle-transcript/index.ts)

- Groq API (`llama-3.1-8b-instant`) に system + 会話履歴 + ユーザー発言を送信
- 返答を `messages` テーブルに保存してクライアントに返す

### 2-4. 会話管理フック

**ファイル:** [src/hooks/useConversation.ts](../src/hooks/useConversation.ts)

```
startConversation() → マイク許可 → start-conversation (Edge) → initAudio → startAudio
                                                                       ↓
                                                    音声チャンク → transcribe → handle-transcript
                                                                                      ↓
                                               onAssistantReply / onUnDetected / onUnseiDetected
stopConversation() → stopAudio → 状態リセット
```

---

## 3. ランダム性格システム

**Edge Function:** [supabase/functions/start-conversation/index.ts](../supabase/functions/start-conversation/index.ts)

- 会話開始時に 21 種類の性格プリセットからランダムに 1 つ選択
- `conversations` テーブルの `personality` カラムに保存
- 以降の AI 返答はその性格を system プロンプトとして使用

**性格一覧 (21 種)**

| # | 性格 |
|---|------|
| 1 | 皮肉屋・論理的 |
| 2 | 明るく好奇心旺盛 |
| 3 | 自信過剰 |
| 4 | 大げさ |
| 5 | 毒舌 |
| 6 | 天然 |
| 7 | 負けず嫌い |
| 8 | 大仰・古風 |
| 9 | 偏愛家 |
| 10 | 照れ屋 |
| 11 | 調子乗り |
| 12 | 勿体ぶる |
| 13 | 雑学好き |
| 14 | 強気・屁理屈 |
| 15 | 世話好き |
| 16 | 謎めいた |
| 17 | 熱血 |
| 18 | 甘えん坊 |
| 19 | 頑固 |
| 20 | 見栄っ張り |
| 21 | 寂しがり屋 |

---

## 4. 「うん」検出

**Edge Function:** [supabase/functions/handle-transcript/index.ts](../supabase/functions/handle-transcript/index.ts)  
`containsUn()` 関数で以下の 3 パターンを判定:

| パターン | 対象 | 例 |
|----------|------|----|
| ひらがな | `うん` を含む | あいづち・フィラー |
| 漢字「運」 | 送り仮名が `ぶびべぼん` でない | 運動・運転・運がいい |
| 漢字「雲」 | 他の漢字と複合している | 雲海・暗雲・戦雲 |

- 検出した場合 → `events` テーブルに `un_detected` として記録
- `rawTranscript` (smart_format なし) を使うことで漢字変換の揺れを排除

---

## 5. 「うんせい」検出

**Edge Function:** [supabase/functions/handle-transcript/index.ts](../supabase/functions/handle-transcript/index.ts)  
`containsUnsei()` 関数:

- `うんせい` または `運勢` を含む場合に `unseiDetected: true` をクライアントに返す
- クライアント側で雲占いフローを起動するトリガーとなる

---

## 6. 雲占い

**ファイル:** [src/services/weather.ts](../src/services/weather.ts)  
**ファイル:** [src/utils/fortune.ts](../src/utils/fortune.ts)  
**Edge Function:** [supabase/functions/fortune/index.ts](../supabase/functions/fortune/index.ts)

### フロー

```
GPS 位置取得 (expo-location)
    ↓
Open-Meteo API で雲量 (%) 取得
    ↓
getFortuneLevel() で運勢ランク判定
    ↓
fortune Edge Function → Groq で一言メッセージ生成 (40〜80 文字)
```

### 運勢ランク判定

| 雲量 | 運勢 |
|------|------|
| 0〜9% | 大吉 |
| 10〜29% | 吉 |
| 30〜59% | 中吉 |
| 60〜84% | 小吉 |
| 85%〜 | 凶 |

---

## 7. 通知

**ファイル:** [src/services/notifications.ts](../src/services/notifications.ts)

- `expo-notifications` によるローカルプッシュ通知
- 「うん」検出時に即時発火 (`trigger: null`)
- Android では `default` チャンネルを自動作成

---

## 8. カウントダウン + ランダム視覚エフェクト

**ファイル:** [src/components/CountdownEffectText.tsx](../src/components/CountdownEffectText.tsx)

- 対象テキストの上に 3 → 2 → 1 のカウントダウンバッジを表示
- ゼロになると以下 4 種からランダムに演出を抽選

| 演出 | 内容 | コンポーネント |
|------|------|---------------|
| `crumble` | 砂が崩れ落ちる | [SandCrumbleText.tsx](../src/components/SandCrumbleText.tsx) |
| `explode` | 放射状に爆発 | [ExplodeText.tsx](../src/components/ExplodeText.tsx) |
| `car` | 🚗 が画面下を横切る | [CarCrossText.tsx](../src/components/CarCrossText.tsx) |
| `none` | 何も起きない | — |

---

## 9. パーティクルエンジン

**ファイル:** [src/components/ParticleText.tsx](../src/components/ParticleText.tsx)

`SandCrumbleText` と `ExplodeText` の共通コア。`ParticlePhysics` インターフェースで物理パラメータを差し替えることで演出を作り分ける。

| パラメータ | 役割 |
|-----------|------|
| `gravity` | フレームごとの加速度 |
| `dragPerFrame` | 空気抵抗係数 (1.0 = なし) |
| `bounce` | 床バウンド設定 (減衰・横ドリフト・床オフセット) |
| `lifetimeMs` | アニメーション総時間 |
| `fadeStartRatio` | フェードアウト開始タイミング (0〜1) |
| `initVelocity` | 初速ベクトル生成関数 |
| `grainSize` | 粒サイズ生成関数 |

最大粒子数: **240**

---

## 10. データベーススキーマ

**ファイル:** [supabase/migrations/0001_init.sql](../supabase/migrations/0001_init.sql)

```
conversations
  id uuid PK
  user_id uuid → auth.users
  personality text        ← 性格プリセット
  created_at timestamptz

messages
  id uuid PK
  conversation_id uuid → conversations
  role text (system | user | assistant)
  content text
  created_at timestamptz

events
  id uuid PK
  conversation_id uuid → conversations
  type text              ← 現在は "un_detected" のみ
  transcript text
  created_at timestamptz
```

全テーブルで RLS 有効。自分のデータのみ参照・操作可能。

---

## 11. 外部サービス一覧

| サービス | 用途 |
|----------|------|
| Supabase Auth | ユーザー認証 |
| Supabase Database | conversations / messages / events |
| Supabase Edge Functions | サーバーサイド処理全般 |
| Deepgram nova-2 | 日本語音声認識 |
| Groq (llama-3.1-8b-instant) | AI 返答生成・占いメッセージ生成 |
| Open-Meteo | 現在地の雲量取得 |
| expo-location | GPS 位置情報 |
| expo-notifications | ローカルプッシュ通知 |

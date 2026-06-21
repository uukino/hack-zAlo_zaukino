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
| **`personalityNameRef` のブリッジパターン** | `handleAssistantReply` は `useConversation` より前に定義されるため `personalityName` state を直接参照できない。`useEffect` で ref に同期するブリッジを挟んでいる。回避できる設計にもできたが、実装速度優先で採用。 |
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
- **会話促進指示 (`CONVERSATION_INSTRUCTION`)** を全性格のシステムプロンプトの先頭に付与
  - 2〜3文の短さで返答する
  - 最後に必ず問いかけ・話を振る一言を添える
  - テンポよい口語表現を使用する

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

| # | コードネーム | 性格 | 画像キー |
|---|-------------|------|---------|
| 1 | シニカル | 皮肉屋・論理的 | `hiniku` |
| 2 | キュリオ | 明るく好奇心旺盛 | `akarui` |
| 3 | ドヤ | 自信過剰 | `jishinkajou` |
| 4 | ドラマ | 大げさ | `ogesa` |
| 5 | トゲ | 毒舌 | `dokuzetsu` |
| 6 | フワリ | 天然 | `tennen` |
| 7 | ガチ | 負けず嫌い | `makezugirai` |
| 8 | ゴウ | 大仰・古風 | `ogyou` |
| 9 | マニア | 偏愛家 | `henai` |
| 10 | ポッ | 照れ屋 | `tereya` |
| 11 | ノリ | 調子乗り | `choushinori` |
| 12 | タメ | 勿体ぶる | `mottaiburu` |
| 13 | ウンチク | 雑学好き | `zatsugakusuki` |
| 14 | ゴリ | 強気・屁理屈 | `tsuyoki` |
| 15 | オセワ | 世話好き | `sewasuki` |
| 16 | ナゾ | 謎めいた | `nazo` |
| 17 | アツ | 熱血 | `nekketsu` |
| 18 | アマ | 甘えん坊 | `amaenbou` |
| 19 | ガン | 頑固 | `ganko` |
| 20 | ハッタリ | 見栄っ張り | `miehari` |
| 21 | ロンリー | 寂しがり屋 | `samishigari` |

`start-conversation` は `personalityName`（コードネーム）と `personalityImage`（画像キー）を返す。

---

## 3-A. キャラクター画像

**ファイル:** [src/constants/personalityImages.ts](../src/constants/personalityImages.ts)

- 21 種の性格それぞれに PNG 画像アセットを対応付けたマップ (`personalityImages`)
- `getPersonalityImage(key)` でキー文字列から `ImageSourcePropType` を取得
- `useConversation` が返す `personalityImage` (キー文字列) をメッセージバブルのヘッダーに `<Image>` で表示
- アバター画像は各メッセージに埋め込まれる（`LocalMessage` 型の `personalityImage?: string` フィールド）ため、会話中に性格が変わっても過去のメッセージは発話時の画像を保持する

---

## 3-B. 音声読み上げ (TTS)

**ファイル:** [App.tsx](../App.tsx) — `SPEECH_PARAMS` / `releaseSpeak`

- `expo-speech` で AI 返答・運勢メッセージを日本語で読み上げ
- 性格ごとに `pitch`（音の高さ 0.5–2.0）と `rate`（話速 0.0–1.0）を個別に設定

| 性格 | pitch | rate |
|------|-------|------|
| シニカル | 0.85 | 0.85 |
| キュリオ | 1.20 | 1.10 |
| ゴウ | 0.80 | 0.75 |
| アツ | 1.10 | 1.25 |
| タメ | 0.90 | 0.70 |
| (他 16 種) | — | — |

- **読み上げカウンタ (`speechCountRef`)** — AI 返答と運勢読み上げが同時に走っても、全読み上げ完了後にのみミュートを解除する競合制御
  - 開始時に `speechCountRef.current += 1`
  - `onDone` / `onError` で `speechCountRef.current -= 1` し、0 になったら `unmuteAudio()`
- 運勢読み上げは GPS + API 呼び出しの非同期待機中もカウンタを保持するため、その間に AI 返答が完了しても誤ってミュートが解除されない

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
| expo-speech | AI 返答・運勢の音声読み上げ (TTS) |

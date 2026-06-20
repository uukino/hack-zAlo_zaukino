// src/services/deepgram.ts
//
// React Nativeアプリから直接Deepgramに接続するための処理。
// 一時トークン(deepgramAccessToken)は必ずバックエンド(Supabase Edge Function)で発行したものを使用すること。
// 音声チャンクの取得(マイク入力)自体はこのファイルの責務外であり、
// react-native-live-audio-stream 等を別途導入し、取得したチャンクを sendAudioChunk に渡す想定。

type TranscriptHandler = (transcript: string) => void;

interface DeepgramConnectionOptions {
  accessToken: string;
  onFinalTranscript: TranscriptHandler;
  onError?: (error: Event) => void;
  onClose?: () => void;
}

export function connectToDeepgram({
  accessToken,
  onFinalTranscript,
  onError,
  onClose,
}: DeepgramConnectionOptions): WebSocket {
  const ws = new WebSocket(
    'wss://api.deepgram.com/v1/listen?model=nova-2&language=ja&smart_format=true',
    ['token', accessToken],
  );

  ws.onmessage = (event) => {
    try {
      const result = JSON.parse(event.data as string);
      const transcript: string | undefined = result?.channel?.alternatives?.[0]?.transcript;
      if (transcript && result.is_final) {
        onFinalTranscript(transcript);
      }
    } catch (e) {
      console.warn('Deepgramレスポンスのパースに失敗しました:', e);
    }
  };

  if (onError) ws.onerror = onError;
  if (onClose) ws.onclose = onClose;

  return ws;
}

export function sendAudioChunk(ws: WebSocket, chunk: ArrayBuffer): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(chunk);
  }
}

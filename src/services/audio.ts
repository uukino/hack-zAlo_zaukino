import LiveAudioStream from 'react-native-live-audio-stream';
import { Platform, PermissionsAndroid, EmitterSubscription } from 'react-native';

const AUDIO_CONFIG = {
  sampleRate: 16000,
  channels: 1 as const,
  bitsPerSample: 16 as const,
  bufferSize: 4096,
  audioSource: 6, // Android: VOICE_RECOGNITION
};

// 無音判定の閾値（16bit PCM の RMS）。環境ノイズに応じて調整
const SILENCE_THRESHOLD = 500;
// 無音がこの時間続いたら発話終了とみなす
const SILENCE_DELAY_MS = 800;
// バッファの上限（約5秒）。無音を検出できなかった場合のフォールバック
const MAX_BUFFER_BYTES = 160000;

let subscription: EmitterSubscription | null = null;
let audioBuffer: number[] = [];
let muted = false;
let hasSpeech = false;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let flushCallback: ((chunk: ArrayBuffer) => void) | null = null;

export function muteAudio(): void {
  muted = true;
  audioBuffer = [];
}

export function unmuteAudio(): void {
  muted = false;
  audioBuffer = [];
}

function computeRMS(bytes: number[]): number {
  let sum = 0;
  const samples = Math.floor(bytes.length / 2);
  for (let i = 0; i < samples * 2; i += 2) {
    let sample = (bytes[i + 1] << 8) | bytes[i];
    if (sample > 0x7FFF) sample -= 0x10000;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples);
}

function flush(): void {
  if (audioBuffer.length === 0 || !flushCallback) return;
  const buffer = new ArrayBuffer(audioBuffer.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < audioBuffer.length; i++) {
    view[i] = audioBuffer[i];
  }
  audioBuffer = [];
  flushCallback(buffer);
}

export async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'マイクの使用許可',
        message: '会話機能のためにマイクへのアクセスが必要です',
        buttonPositive: '許可',
        buttonNegative: 'キャンセル',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  try {
    LiveAudioStream.init(AUDIO_CONFIG);
    return true;
  } catch {
    return false;
  }
}

export function initAudio(): void {
  audioBuffer = [];
  muted = false;
  hasSpeech = false;
  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
  if (Platform.OS === 'android') {
    LiveAudioStream.init(AUDIO_CONFIG);
  }
}

export function startAudio(onChunk: (chunk: ArrayBuffer) => void): void {
  audioBuffer = [];
  hasSpeech = false;
  flushCallback = onChunk;

  subscription = LiveAudioStream.on('data', (base64: string) => {
    if (muted) return;

    const binary = atob(base64);
    const chunk: number[] = [];
    for (let i = 0; i < binary.length; i++) {
      chunk.push(binary.charCodeAt(i));
    }

    const rms = computeRMS(chunk);
    audioBuffer.push(...chunk);

    if (rms > SILENCE_THRESHOLD) {
      // 発話中 → 無音タイマーをリセット
      hasSpeech = true;
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
    } else if (hasSpeech) {
      // 発話後の無音 → タイマーをセット（まだなければ）
      if (!silenceTimer) {
        silenceTimer = setTimeout(() => {
          silenceTimer = null;
          hasSpeech = false;
          flush();
        }, SILENCE_DELAY_MS);
      }
    }

    // フォールバック：上限を超えたら強制送信
    if (audioBuffer.length >= MAX_BUFFER_BYTES) {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      hasSpeech = false;
      flush();
    }
  });

  LiveAudioStream.start();
}

export function stopAudio(): void {
  LiveAudioStream.stop();
  subscription?.remove();
  subscription = null;
  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
  audioBuffer = [];
  muted = false;
  hasSpeech = false;
  flushCallback = null;
}

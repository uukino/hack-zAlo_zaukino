import LiveAudioStream from 'react-native-live-audio-stream';
import { Platform, PermissionsAndroid, EmitterSubscription } from 'react-native';

const AUDIO_CONFIG = {
  sampleRate: 16000,
  channels: 1 as const,
  bitsPerSample: 16 as const,
  bufferSize: 4096,
  audioSource: 6, // Android: VOICE_RECOGNITION
};

// 約1秒分(16000 samples * 2 bytes = 32000 bytes)溜まったら送信する
const FLUSH_BYTES = 32000;

let subscription: EmitterSubscription | null = null;
let audioBuffer: number[] = [];

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
  // iOS: Info.plist の NSMicrophoneUsageDescription に基づき OS が権限ダイアログを表示する
  try {
    LiveAudioStream.init(AUDIO_CONFIG);
    return true;
  } catch {
    return false;
  }
}

export function initAudio(): void {
  audioBuffer = [];
  if (Platform.OS === 'android') {
    LiveAudioStream.init(AUDIO_CONFIG);
  }
}

export function startAudio(onChunk: (chunk: ArrayBuffer) => void): void {
  audioBuffer = [];
  subscription = LiveAudioStream.on('data', (base64: string) => {
    const binary = atob(base64);
    for (let i = 0; i < binary.length; i++) {
      audioBuffer.push(binary.charCodeAt(i));
    }
    // 一定量溜まったらフラッシュ
    if (audioBuffer.length >= FLUSH_BYTES) {
      const buffer = new ArrayBuffer(audioBuffer.length);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < audioBuffer.length; i++) {
        view[i] = audioBuffer[i];
      }
      audioBuffer = [];
      onChunk(buffer);
    }
  });
  LiveAudioStream.start();
}

export function stopAudio(): void {
  LiveAudioStream.stop();
  subscription?.remove();
  subscription = null;
  audioBuffer = [];
}

import LiveAudioStream from 'react-native-live-audio-stream';
import { Platform, PermissionsAndroid, EmitterSubscription } from 'react-native';

const AUDIO_CONFIG = {
  sampleRate: 16000,  // Deepgramが推奨する16kHz
  channels: 1 as const,
  bitsPerSample: 16 as const,
  bufferSize: 4096,
  audioSource: 6,    // Android: VOICE_RECOGNITION(音声認識に最適化されたソース)
};

let subscription: EmitterSubscription | null = null;

export async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    // iOS はInfo.plistの記載 + 初回アクセス時にシステムダイアログが出る
    return true;
  }
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

export function initAudio(): void {
  LiveAudioStream.init(AUDIO_CONFIG);
}

export function startAudio(onChunk: (chunk: ArrayBuffer) => void): void {
  subscription = LiveAudioStream.on('data', (base64: string) => {
    // react-native-live-audio-stream はbase64文字列でPCMデータを渡す
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      view[i] = binary.charCodeAt(i);
    }
    onChunk(buffer);
  });
  LiveAudioStream.start();
}

export function stopAudio(): void {
  LiveAudioStream.stop();
  subscription?.remove();
  subscription = null;
}

declare module 'react-native-live-audio-stream' {
  import { EmitterSubscription } from 'react-native';

  interface AudioStreamOptions {
    sampleRate: number;
    channels: 1 | 2;
    bitsPerSample: 8 | 16;
    bufferSize?: number;
    audioSource?: number; // Android only: 6 = VOICE_RECOGNITION
  }

  const LiveAudioStream: {
    init(options: AudioStreamOptions): void;
    start(): void;
    stop(): void;
    on(event: 'data', callback: (data: string) => void): EmitterSubscription;
  };

  export default LiveAudioStream;
}

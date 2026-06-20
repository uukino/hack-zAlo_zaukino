// react-native-live-audio-stream は RN 0.65+ の NativeEventEmitter API に未対応のため
// require() でシムを先に当ててから他モジュールをロードする
// (import は巻き上げられるためここでは require を使う必要がある)
const { NativeModules } = require('react-native');
const liveAudio = NativeModules.LiveAudioStream;
if (liveAudio) {
  if (!liveAudio.addListener) liveAudio.addListener = () => {};
  if (!liveAudio.removeListeners) liveAudio.removeListeners = () => {};
}

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);

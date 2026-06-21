// src/constants/personalityImages.ts
// 性格プリセットの画像キー(assets内のファイル名)から実体を引くマップ
import type { ImageSourcePropType } from 'react-native';

const personalityImages: Record<string, ImageSourcePropType> = {
  hiniku: require('../../assets/hiniku.png'),
  akarui: require('../../assets/akarui.png'),
  jishinkajou: require('../../assets/jishinkajou.png'),
  ogesa: require('../../assets/ogesa.png'),
  dokuzetsu: require('../../assets/dokuzetsu.png'),
  tennen: require('../../assets/tennen.png'),
  makezugirai: require('../../assets/makezugirai.png'),
  ogyou: require('../../assets/ogyou.png'),
  henai: require('../../assets/henai.png'),
  tereya: require('../../assets/tereya.png'),
  choushinori: require('../../assets/choushinori.png'),
  mottaiburu: require('../../assets/mottaiburu.png'),
  zatsugakusuki: require('../../assets/zatsugakusuki.png'),
  tsuyoki: require('../../assets/tsuyoki.png'),
  sewasuki: require('../../assets/sewasuki.png'),
  nazo: require('../../assets/nazo.png'),
  nekketsu: require('../../assets/nekketsu.png'),
  amaenbou: require('../../assets/amaenbou.png'),
  ganko: require('../../assets/ganko.png'),
  miehari: require('../../assets/miehari.png'),
  samishigari: require('../../assets/samishigari.png'),
};

export function getPersonalityImage(key: string | null | undefined): ImageSourcePropType | null {
  if (!key) return null;
  return personalityImages[key] ?? null;
}

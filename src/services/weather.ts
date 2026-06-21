// src/services/weather.ts
// 現在地を取得し、Open-Meteoで現在の雲量(%)を取得する
import * as Location from 'expo-location';

export async function getCurrentCloudCover(): Promise<number | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[weather] 位置情報の使用が許可されませんでした');
    return null;
  }

  const position = await Location.getCurrentPositionAsync({});
  const { latitude, longitude } = position.coords;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=cloud_cover`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn('[weather] Open-Meteo エラー:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const cloudCover = data?.current?.cloud_cover;
  return typeof cloudCover === 'number' ? cloudCover : null;
}

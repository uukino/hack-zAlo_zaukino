// src/components/CarCrossText.tsx
// trigger が true になると、画面下部を車の絵文字が右から左へ横切る
// (特定のメッセージに紐づかない、画面全体のオーバーレイ演出)
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';

interface CarCrossTextProps {
  trigger: boolean;
  onComplete?: () => void;
}

const CAR_EMOJI = '🚗';
const CAR_SIZE = 32;
const CROSS_DURATION = 1400;
const BOTTOM_OFFSET = 90;

export function CarCrossText({ trigger, onComplete }: CarCrossTextProps) {
  const { width } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(width + CAR_SIZE)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const hasStarted = useRef(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!trigger || hasStarted.current) return;
    hasStarted.current = true;

    translateX.setValue(width + CAR_SIZE);
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -CAR_SIZE,
        duration: CROSS_DURATION,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(bounce, { toValue: -4, duration: 110, useNativeDriver: true }),
          Animated.timing(bounce, { toValue: 0, duration: 110, useNativeDriver: true }),
        ]),
        { iterations: Math.ceil(CROSS_DURATION / 220) },
      ),
    ]).start(() => {
      setFinished(true);
      onComplete?.();
    });
  }, [trigger, width, translateX, bounce, onComplete]);

  if (!trigger || finished) return null;

  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.car,
        { bottom: BOTTOM_OFFSET, transform: [{ translateX }, { translateY: bounce }] },
      ]}
    >
      {CAR_EMOJI}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  car: {
    position: 'absolute',
    left: 0,
    fontSize: CAR_SIZE,
  },
});

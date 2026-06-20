// src/components/CountdownEffectText.tsx
// trigger が true になると3秒のカウントダウンを表示し、
// 0になったら崩壊・爆発・車横切り・何も起こらない、のいずれかを抽選して実行する
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextStyle, View } from 'react-native';
import { SandCrumbleText } from './SandCrumbleText';
import { ExplodeText } from './ExplodeText';

interface CountdownEffectTextProps {
  text: string;
  trigger: boolean;
  style?: TextStyle;
  onCarEffect?: () => void;
}

type SubEffect = 'crumble' | 'explode' | 'car' | 'none';
const SUB_EFFECTS: SubEffect[] = ['crumble', 'explode', 'car', 'none'];
const COUNTDOWN_SECONDS = 3;

export function CountdownEffectText({ text, trigger, style, onCarEffect }: CountdownEffectTextProps) {
  const [count, setCount] = useState(COUNTDOWN_SECONDS);
  const [subEffect, setSubEffect] = useState<SubEffect | null>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!trigger || hasStarted.current) return;
    hasStarted.current = true;

    let remaining = COUNTDOWN_SECONDS;
    const interval = setInterval(() => {
      remaining -= 1;
      setCount(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        setSubEffect(SUB_EFFECTS[Math.floor(Math.random() * SUB_EFFECTS.length)]);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [trigger]);

  useEffect(() => {
    if (subEffect === 'car') {
      onCarEffect?.();
    }
  }, [subEffect, onCarEffect]);

  if (subEffect === 'crumble') {
    return <SandCrumbleText text={text} trigger style={style} />;
  }
  if (subEffect === 'explode') {
    return <ExplodeText text={text} trigger style={style} />;
  }

  return (
    <View style={styles.wrapper}>
      <Text style={style}>{text}</Text>
      {trigger && subEffect === null && count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: -10,
    right: -10,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: '#e53935',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});

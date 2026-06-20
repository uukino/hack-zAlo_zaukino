// src/components/ParticleText.tsx
// テキストを粒子(砂粒)に分解して物理アニメーションさせる共通コア。
// 重力・空気抵抗・床バウンドの有無をphysicsで指定することで
// 「砂のように崩れる」「爆発して飛び散る」などの演出を作り分けられる。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, Text, TextStyle, View } from 'react-native';

interface Grain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  pos: Animated.ValueXY;
  opacity: Animated.Value;
}

export interface ParticlePhysics {
  gravity: number;
  dragPerFrame: number; // 1 = 空気抵抗なし
  bounce: { damping: number; driftDamping: number; floorOffset: number } | null;
  lifetimeMs: number;
  fadeStartRatio: number;
  initVelocity: () => { vx: number; vy: number };
  grainSize?: () => number;
}

interface ParticleTextProps {
  text: string;
  trigger: boolean;
  style?: TextStyle;
  physics: ParticlePhysics;
  onComplete?: () => void;
}

const MAX_GRAINS = 240;

function makeGrains(width: number, height: number, charCount: number, physics: ParticlePhysics): Grain[] {
  if (charCount === 0 || width === 0) return [];
  const grainsPerChar = Math.max(3, Math.min(10, Math.floor(MAX_GRAINS / charCount)));
  const charWidth = width / charCount;
  const grains: Grain[] = [];

  for (let i = 0; i < charCount; i++) {
    for (let g = 0; g < grainsPerChar; g++) {
      const x = i * charWidth + Math.random() * charWidth;
      const y = Math.random() * height;
      const { vx, vy } = physics.initVelocity();
      grains.push({
        x,
        y,
        vx,
        vy,
        size: physics.grainSize ? physics.grainSize() : 1.5 + Math.random() * 2,
        pos: new Animated.ValueXY({ x, y }),
        opacity: new Animated.Value(1),
      });
    }
  }
  return grains;
}

export function ParticleText({ text, trigger, style, physics, onComplete }: ParticleTextProps) {
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
  const hasTriggered = useRef(false);
  const rafRef = useRef<number | null>(null);
  const charCount = Array.from(text).length;

  const grains = useMemo(
    () => (layout ? makeGrains(layout.width, layout.height, charCount, physics) : []),
    [layout, text],
  );

  const handleLayout = (e: LayoutChangeEvent) => {
    if (layout) return;
    const { width, height } = e.nativeEvent.layout;
    setLayout({ width, height });
  };

  useEffect(() => {
    if (!trigger || hasTriggered.current || grains.length === 0 || !layout) return;
    hasTriggered.current = true;

    const start = Date.now();
    const floor = physics.bounce ? layout.height + physics.bounce.floorOffset : null;

    const tick = () => {
      const elapsed = Date.now() - start;
      let anyAlive = false;

      grains.forEach((grain) => {
        grain.vy += physics.gravity;
        grain.vx *= physics.dragPerFrame;
        grain.vy *= physics.dragPerFrame;
        grain.x += grain.vx;
        grain.y += grain.vy;

        if (floor !== null && grain.y > floor) {
          grain.y = floor;
          grain.vy *= physics.bounce!.damping;
          grain.vx *= physics.bounce!.driftDamping;
        }
        grain.pos.setValue({ x: grain.x, y: grain.y });

        if (elapsed > physics.lifetimeMs * physics.fadeStartRatio) {
          const fadeProgress = Math.min(
            1,
            (elapsed - physics.lifetimeMs * physics.fadeStartRatio) /
              (physics.lifetimeMs * (1 - physics.fadeStartRatio)),
          );
          grain.opacity.setValue(1 - fadeProgress);
        }
        if (elapsed < physics.lifetimeMs) anyAlive = true;
      });

      if (anyAlive) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onComplete?.();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [trigger, grains, layout, physics, onComplete]);

  const dotColor = (style?.color as string) ?? '#333';
  const overlayHeight = layout ? layout.height + (physics.bounce?.floorOffset ?? 60) : 0;

  return (
    <View onLayout={handleLayout} style={styles.wrapper}>
      <Text style={[style, trigger && styles.hidden]}>{text}</Text>
      {trigger && layout && (
        <View style={[styles.grainLayer, { width: layout.width, height: overlayHeight }]}>
          {grains.map((grain, i) => (
            <Animated.View
              key={i}
              style={[
                styles.grain,
                {
                  width: grain.size,
                  height: grain.size,
                  backgroundColor: dotColor,
                  opacity: grain.opacity,
                  transform: grain.pos.getTranslateTransform(),
                },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  hidden: { opacity: 0 },
  grainLayer: { position: 'absolute', top: 0, left: 0 },
  grain: { position: 'absolute', top: 0, left: 0, borderRadius: 1 },
});

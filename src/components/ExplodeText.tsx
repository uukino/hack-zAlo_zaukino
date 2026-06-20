// src/components/ExplodeText.tsx
// trigger が true になると、文字を粒子に分解して放射状に爆発させ、
// 空気抵抗で減速しながら飛び散らせて消すテキスト表示
import React from 'react';
import { TextStyle } from 'react-native';
import { ParticlePhysics, ParticleText } from './ParticleText';

interface ExplodeTextProps {
  text: string;
  trigger: boolean;
  style?: TextStyle;
  onComplete?: () => void;
}

const EXPLODE_PHYSICS: ParticlePhysics = {
  gravity: 0.25,
  dragPerFrame: 0.94,
  bounce: null,
  lifetimeMs: 850,
  fadeStartRatio: 0.35,
  initVelocity: () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 7;
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.8 - 2,
    };
  },
  grainSize: () => 1.5 + Math.random() * 2.5,
};

export function ExplodeText({ text, trigger, style, onComplete }: ExplodeTextProps) {
  return (
    <ParticleText text={text} trigger={trigger} style={style} physics={EXPLODE_PHYSICS} onComplete={onComplete} />
  );
}

// src/components/SandCrumbleText.tsx
// trigger が true になると、文字を砂粒に分解して重力で落下させ、
// 床でバウンドさせながら崩壊させるテキスト表示
import React from 'react';
import { TextStyle } from 'react-native';
import { ParticlePhysics, ParticleText } from './ParticleText';

interface SandCrumbleTextProps {
  text: string;
  trigger: boolean;
  style?: TextStyle;
  onComplete?: () => void;
}

const SAND_PHYSICS: ParticlePhysics = {
  gravity: 0.9,
  dragPerFrame: 1,
  bounce: { damping: -0.3, driftDamping: 0.85, floorOffset: 40 },
  lifetimeMs: 1100,
  fadeStartRatio: 0.4,
  initVelocity: () => ({
    vx: (Math.random() - 0.5) * 3,
    vy: -Math.random() * 1.5,
  }),
};

export function SandCrumbleText({ text, trigger, style, onComplete }: SandCrumbleTextProps) {
  return (
    <ParticleText text={text} trigger={trigger} style={style} physics={SAND_PHYSICS} onComplete={onComplete} />
  );
}

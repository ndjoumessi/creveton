// MiniLineChart — petite courbe SVG (ex. score des N dernières parties).
// data: nombres (ancien → récent). Affiche une polyline + points.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import { colors } from '../constants/theme';

export default function MiniLineChart({
  data = [],
  width = 280,
  height = 80,
  color = colors.gold500,
  padding = 10,
}) {
  if (!data.length) return <View style={{ width, height }} />;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const n = data.length;

  const points = data.map((v, i) => {
    const x = padding + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = padding + innerH - ((v - min) / span) * innerH;
    return { x, y };
  });
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View style={styles.wrap}>
      <Svg width={width} height={height}>
        {/* Ligne de base */}
        <Line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke={colors.border}
          strokeWidth={1}
        />
        <Polyline points={polyline} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={color} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
});

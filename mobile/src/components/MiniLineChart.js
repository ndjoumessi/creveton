// MiniLineChart — courbe SVG (ex. score des N dernières parties).
// data: nombres (ancien → récent). Affiche une polyline + points.
// Rendu par défaut = historique (ResultsScreen) : ligne de base + points pleins.
// Props optionnelles (défauts inertes) pour le mode « détaillé » (StatsScreen) :
//   fillArea      — aire sous la courbe (fillOpacity 0.15, n ≥ 2)
//   showGrid      — 4 graduations horizontales + valeurs (remplace la ligne de base)
//   outlinedDots  — points blancs cerclés `color`, dernier point plein et grossi
//   showLastValue — valeur du dernier point affichée au-dessus (Outfit bold)
//   scaleToData   — échelle Y = min/max réels (défaut : plancher 0 / plafond ≥ 1)
//   formatValue   — formatage des chiffres (graduations + dernier point)
//   lastValueColor, paddingTop, paddingBottom — surcharges fines.
// Theme-aware : palette via useTheme (identique en mode clair à l'ancien rendu).

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { fonts } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

export default function MiniLineChart({
  data = [],
  width = 280,
  height = 80,
  color,
  padding = 10,
  paddingTop,
  paddingBottom,
  fillArea = false,
  showGrid = false,
  outlinedDots = false,
  showLastValue = false,
  scaleToData = false,
  lastValueColor,
  formatValue = (v) => String(v),
}) {
  const { colors } = useTheme();
  if (!data.length) return <View style={{ width, height }} />;

  const stroke = color || colors.gold500;
  const padT = paddingTop ?? padding;
  const padB = paddingBottom ?? padding;
  const max = scaleToData ? Math.max(...data) : Math.max(...data, 1);
  const min = scaleToData ? Math.min(...data) : Math.min(...data, 0);
  const span = max - min || 1;
  const innerW = width - padding * 2;
  const innerH = height - padT - padB;
  const baseY = padT + innerH;
  const n = data.length;

  const points = data.map((v, i) => {
    const x = padding + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = padT + innerH - ((v - min) / span) * innerH;
    return { x, y };
  });
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const area =
    `M ${points[0].x},${baseY} ` +
    points.map((p) => `L ${p.x},${p.y}`).join(' ') +
    ` L ${points[n - 1].x},${baseY} Z`;

  // 4 graduations Y (valeurs décroissantes de max vers min).
  const grads = showGrid
    ? [0, 1, 2, 3].map((i) => ({
        y: padT + (innerH * i) / 3,
        val: Math.round(max - (span * i) / 3),
      }))
    : [];

  return (
    <View style={styles.wrap}>
      <Svg width={width} height={height}>
        {showGrid ? (
          grads.map((g, i) => (
            <Line
              key={`g${i}`}
              x1={padding}
              y1={g.y}
              x2={width - padding}
              y2={g.y}
              stroke={colors.divider}
              strokeWidth={1}
            />
          ))
        ) : (
          /* Ligne de base */
          <Line
            x1={padding}
            y1={height - padB}
            x2={width - padding}
            y2={height - padB}
            stroke={colors.border}
            strokeWidth={1}
          />
        )}
        {grads.map((g, i) => (
          <SvgText
            key={`t${i}`}
            x={width - padding}
            y={g.y - 2}
            fontSize={9}
            fontFamily={fonts.titleSemiBold}
            fill={colors.textFaint}
            textAnchor="end"
          >
            {formatValue(g.val)}
          </SvgText>
        ))}
        {fillArea && n > 1 ? <Path d={area} fill={stroke} fillOpacity={0.15} /> : null}
        {n > 1 ? (
          <Polyline points={polyline} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" />
        ) : null}
        {points.map((p, i) =>
          outlinedDots ? (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === n - 1 ? 5 : 4}
              fill={i === n - 1 ? stroke : colors.white}
              stroke={stroke}
              strokeWidth={2}
            />
          ) : (
            <Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={stroke} />
          )
        )}
        {/* Valeur au-dessus du dernier point */}
        {showLastValue ? (
          <SvgText
            x={points[n - 1].x}
            y={points[n - 1].y - 9}
            fontSize={11}
            fontFamily={fonts.titleBold}
            fill={lastValueColor || stroke}
            textAnchor={n === 1 ? 'middle' : 'end'}
          >
            {formatValue(data[n - 1])}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
});

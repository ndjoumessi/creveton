// MiniLineChart — courbe SVG (ex. score des N dernières parties).
// data: nombres (ancien → récent). Affiche une polyline + points.
// Rendu par défaut = historique (ResultsScreen) : ligne de base + points pleins.
// Props optionnelles (défauts inertes) pour le mode « détaillé » (StatsScreen) :
//   fillArea      — aire sous la courbe (fillOpacity 0.15, n ≥ 2)
//   showGrid      — 4 graduations horizontales + valeurs (remplace la ligne de base)
//   outlinedDots  — points blancs cerclés `color`, dernier point plein et grossi
//   showLastValue — valeur du dernier point affichée au-dessus (Outfit bold)
//   scaleToData   — échelle Y = min/max réels (défaut : plancher 0 / plafond ≥ 1)
//   formatValue   — formatage des chiffres (graduations + dernier point + tooltip)
//   lastValueColor, paddingTop, paddingBottom — surcharges fines.
// Responsive (opt-in) : `width` omis ou `width="auto"` → largeur mesurée du conteneur
//   via onLayout (re-render au changement). Un `width` numérique = comportement figé
//   historique, strictement inchangé.
// Interactif (inerte par défaut) : une bande tactile invisible par point (largeur =
//   segment de la courbe, pleine hauteur — cible ≥ 44 px). Tap → tooltip (valeur via
//   `formatValue` ; les data sont des nombres nus, donc pas de date) + point évidé
//   agrandi. Re-tap → désélection. Fade ~motion.fast, instantané sous reduce-motion.
//   Le label statique `showLastValue` est masqué quand le tooltip du même point est
//   ouvert (pas de chevauchement). AUCUN élément visible tant que rien n'est sélectionné.
// Theme-aware : palette via useTheme (identique en mode clair à l'ancien rendu).

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, PanResponder, Animated, StyleSheet } from 'react-native';
import Svg, { Path, Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { fonts, motion, radius, zIndex } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useReduceMotion } from '../hooks/useReduceMotion';

// Seuil (px) en deçà duquel un geste est considéré comme un TAP (et non un scroll).
// Au-delà sur X ou Y, on ne sélectionne rien : le mouvement appartient au parent.
const TAP_SLOP = 8;

export default function MiniLineChart({
  data = [],
  width = 'auto',
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
  const reduceMotion = useReduceMotion();
  const autoWidth = width == null || width === 'auto';
  const [measuredW, setMeasuredW] = useState(0);
  const [selected, setSelected] = useState(null);
  const [tipSize, setTipSize] = useState(null);
  const tipOpacity = useRef(new Animated.Value(0)).current;

  // Coordonnées courantes des points, lues par le PanResponder (créé une seule
  // fois, sinon closure périmée). Réassignées à chaque rendu, plus bas.
  const pointsRef = useRef([]);
  // PanResponder de la surcouche tactile — remplace les Pressables plein-écran qui
  // captaient tout le geste et bloquaient le scroll parent. Clé du fix :
  //   · onStartShouldSetPanResponder=true    → on devient responder au TOUCHER
  //     (pour pouvoir détecter un tap au relâchement),
  //   · onMoveShouldSetPanResponder(Capture)=false → on ne retient JAMAIS le
  //     mouvement : dès que le doigt glisse, le ScrollView parent récupère le geste,
  //   · onPanResponderTerminationRequest=true → on cède volontiers au parent.
  // Résultat : tap statique = tooltip ; tout drag (vertical) = scroll de la page.
  const panRef = useRef(null);
  if (!panRef.current) {
    panRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (evt, gesture) => {
        // Geste ayant bougé au-delà du seuil → c'était un scroll, on ne fait rien.
        if (Math.abs(gesture.dx) > TAP_SLOP || Math.abs(gesture.dy) > TAP_SLOP) return;
        const pts = pointsRef.current;
        if (!pts.length) return;
        // Point le plus proche du x touché (même UX que les anciennes bandes :
        // taper n'importe où dans la colonne sélectionne le point de cette colonne).
        const x = evt.nativeEvent.locationX;
        let best = 0;
        let bestDist = Infinity;
        for (let i = 0; i < pts.length; i += 1) {
          const d = Math.abs(pts[i].x - x);
          if (d < bestDist) { bestDist = d; best = i; }
        }
        setSelected((cur) => (cur === best ? null : best));
      },
      onPanResponderTerminate: () => {},
    });
  }

  const n = data.length;
  // Sélection défensive : si la donnée rétrécit, on retombe sur « rien ».
  const sel = selected != null && selected < n ? selected : null;

  useEffect(() => {
    if (sel == null) {
      tipOpacity.setValue(0);
      return;
    }
    if (reduceMotion) {
      tipOpacity.setValue(1);
      return;
    }
    tipOpacity.setValue(0);
    Animated.timing(tipOpacity, {
      toValue: 1,
      duration: motion.fast,
      useNativeDriver: true,
    }).start();
  }, [sel, reduceMotion, tipOpacity]);

  const onWrapLayout = autoWidth
    ? (e) => setMeasuredW(Math.round(e.nativeEvent.layout.width))
    : undefined;

  if (!data.length) {
    return autoWidth ? (
      <View style={[styles.wrapAuto, { height }]} onLayout={onWrapLayout} />
    ) : (
      <View style={{ width, height }} />
    );
  }
  // Mode auto, pas encore mesuré : coquille pleine largeur en attente d'onLayout.
  if (autoWidth && !(measuredW > 0)) {
    return <View style={[styles.wrapAuto, { height }]} onLayout={onWrapLayout} />;
  }
  const w = autoWidth ? measuredW : width;

  const stroke = color || colors.gold500;
  const padT = paddingTop ?? padding;
  const padB = paddingBottom ?? padding;
  const max = scaleToData ? Math.max(...data) : Math.max(...data, 1);
  const min = scaleToData ? Math.min(...data) : Math.min(...data, 0);
  const span = max - min || 1;
  const innerW = w - padding * 2;
  const innerH = height - padT - padB;
  const baseY = padT + innerH;

  const points = data.map((v, i) => {
    const x = padding + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = padT + innerH - ((v - min) / span) * innerH;
    return { x, y };
  });
  pointsRef.current = points; // vu par le PanResponder (closure créée une fois)
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

  // Bandes tactiles invisibles : une par point, bornées aux mi-distances entre
  // points voisins (pleine hauteur du graphe → cible ≥ 44 px même quand la
  // bande est étroite).
  const bands = points.map((p, i) => {
    const left = i === 0 ? 0 : (points[i - 1].x + p.x) / 2;
    const right = i === n - 1 ? w : (p.x + points[i + 1].x) / 2;
    return { left, width: right - left };
  });

  // Position du tooltip : centré sur le point, borné aux bords ; au-dessus du
  // point, bascule en dessous s'il déborderait en haut.
  const tipW = tipSize?.width ?? 0;
  const tipH = tipSize?.height ?? 0;
  const selPoint = sel != null ? points[sel] : null;
  const tipRawTop = selPoint ? selPoint.y - tipH - 10 : 0;
  const tipTop = tipRawTop < 0 ? (selPoint ? selPoint.y + 12 : 0) : tipRawTop;
  // Colonne des valeurs d'axe Y (à droite, présente UNIQUEMENT avec la grille) :
  // on interdit au tooltip d'y empiéter, sinon il chevauche un libellé — cas le
  // plus visible au DERNIER point (le plus à droite ET souvent proche du sommet).
  // Le tooltip, centré sur le point, ne peut plus déborder à droite au-delà de la
  // colonne des libellés. Sans grille → aucune colonne → borne historique inchangée.
  const axisZone = showGrid ? padding + 30 : 0;
  const tipLeft = selPoint
    ? Math.min(Math.max(selPoint.x - tipW / 2, 0), Math.max(w - tipW - axisZone, 0))
    : 0;

  return (
    <View style={autoWidth ? styles.wrapAuto : styles.wrap} onLayout={onWrapLayout}>
      <Svg width={w} height={height}>
        {showGrid ? (
          grads.map((g, i) => (
            <Line
              key={`g${i}`}
              x1={padding}
              y1={g.y}
              x2={w - padding}
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
            x2={w - padding}
            y2={height - padB}
            stroke={colors.border}
            strokeWidth={1}
          />
        )}
        {grads.map((g, i) => (
          <SvgText
            key={`t${i}`}
            x={w - padding}
            y={g.y - 2}
            fontSize={9}
            // intentional: graduations en Outfit SemiBold (l'ancien ScoreChart de
            // Stats les rendait en police système regular — delta entériné, audit
            // d'équivalence P1 ; charte « chiffres en Outfit »).
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
        {/* Feedback de sélection : point agrandi/évidé par-dessus le point courant. */}
        {selPoint ? (
          <Circle
            cx={selPoint.x}
            cy={selPoint.y}
            r={outlinedDots ? 6.5 : 6}
            fill={colors.white}
            stroke={stroke}
            strokeWidth={2.5}
          />
        ) : null}
        {/* Valeur au-dessus du dernier point (masquée si son tooltip est ouvert). */}
        {showLastValue && sel !== n - 1 ? (
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
      {/* Surcouche tactile invisible : le PanResponder gère le tap (voir plus haut).
          Il ne retient pas le mouvement → le scroll vertical du ScrollView parent
          passe librement même quand le doigt démarre sur le graphe. */}
      <View style={StyleSheet.absoluteFill} {...panRef.current.panHandlers}>
        {/* Éléments d'accessibilité par point : annoncés par le lecteur d'écran,
            mais pointerEvents=none → ils ne captent aucun tactile (géré par le
            PanResponder parent), donc aucune interférence avec le scroll. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {points.map((p, i) => (
            <View
              key={i}
              style={[styles.band, { left: bands[i].left, width: bands[i].width }]}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`Point ${i + 1} sur ${n} : ${formatValue(data[i])} points`}
              accessibilityState={{ selected: sel === i }}
            />
          ))}
        </View>
      </View>
      {/* Tooltip du point sélectionné (valeur seule : data = nombres nus). */}
      {sel != null ? (
        <Animated.View
          pointerEvents="none"
          onLayout={(e) => {
            const { width: tw, height: th } = e.nativeEvent.layout;
            setTipSize({ width: tw, height: th });
          }}
          style={[
            styles.tooltip,
            {
              left: tipLeft,
              top: tipTop,
              backgroundColor: colors.textDark,
              opacity: tipSize ? tipOpacity : 0,
            },
          ]}
        >
          <Text style={[styles.tooltipText, { color: colors.cream }]}>
            {formatValue(data[sel])}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
  wrapAuto: { alignSelf: 'stretch' },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  tooltip: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    zIndex: zIndex.tooltip,
    elevation: 4,
  },
  tooltipText: {
    fontFamily: fonts.titleBold,
    fontSize: 11,
  },
});

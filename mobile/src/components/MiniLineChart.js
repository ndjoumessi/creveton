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
import { View, Text, PanResponder, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Path, Polyline, Circle, Line, G, Text as SvgText } from 'react-native-svg';
import { fonts, motion, radius, zIndex } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useReduceMotion } from '../hooks/useReduceMotion';

// react-native-svg accepte des props animées sur ses primitives. `useNativeDriver`
// reste FALSE : ni `strokeDashoffset` ni `fillOpacity` ne sont des props natives.
const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

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
  // Repères d'axe X (opt-in, défaut inerte) : tableau ALIGNÉ sur `data` — seules les
  // entrées non-nulles sont rendues (ex. une date courte au point du milieu). Rendu
  // fontSize 9 / textFaint / Space Grotesk, dans la bande paddingBottom sous la
  // baseline (requiert paddingBottom ≥ 14, sinon ignoré pour ne pas mordre la courbe).
  xLabels,
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
  // Résultat : tap statique = tooltip ; drag VERTICAL = scroll de la page.
  //
  // Parcours au doigt (scrub) : on réclame en plus les gestes franchement
  // HORIZONTAUX (|dx| nettement > |dy|). Le parent défile à la verticale, les deux
  // axes ne se disputent donc jamais : glisser de gauche à droite promène la
  // sélection le long de la courbe, glisser de haut en bas fait défiler la page.
  // Une fois le scrub engagé on REFUSE de céder (`onPanResponderTerminationRequest`
  // → false), sinon le ScrollView reprend la main au premier tremblement vertical.
  const panRef = useRef(null);
  const scrubbingRef = useRef(false);
  if (!panRef.current) {
    // Index du point le plus proche d'une abscisse (même UX que les anciennes
    // bandes : n'importe où dans la colonne sélectionne le point de la colonne).
    const nearest = (x) => {
      const pts = pointsRef.current;
      if (!pts.length) return null;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < pts.length; i += 1) {
        const d = Math.abs(pts[i].x - x);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    };
    const isHorizontal = (g) =>
      Math.abs(g.dx) > TAP_SLOP && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;

    panRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (evt, g) => isHorizontal(g),
      onMoveShouldSetPanResponderCapture: () => false,
      // Tant qu'on parcourt, on garde le geste ; sinon on cède volontiers.
      onPanResponderTerminationRequest: () => !scrubbingRef.current,
      onPanResponderMove: (evt, g) => {
        if (!isHorizontal(g)) return;
        scrubbingRef.current = true;
        const i = nearest(evt.nativeEvent.locationX);
        if (i != null) setSelected(i);
      },
      onPanResponderRelease: (evt, gesture) => {
        // Fin d'un parcours : on GARDE le point atteint (pas de bascule).
        if (scrubbingRef.current) {
          scrubbingRef.current = false;
          return;
        }
        // Geste ayant bougé au-delà du seuil sans être horizontal → c'était un
        // scroll, on ne fait rien.
        if (Math.abs(gesture.dx) > TAP_SLOP || Math.abs(gesture.dy) > TAP_SLOP) return;
        const i = nearest(evt.nativeEvent.locationX);
        if (i == null) return;
        setSelected((cur) => (cur === i ? null : i));
      },
      onPanResponderTerminate: () => {
        scrubbingRef.current = false;
      },
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

  // ── Animation de tracé ────────────────────────────────────────────────────
  // La courbe se dessine de gauche à droite au montage (et à chaque changement
  // de données), puis l'aire, les points et le libellé apparaissent en fondu.
  // Technique : `strokeDasharray` = longueur totale, `strokeDashoffset` animé de
  // cette longueur vers 0 — le trait est « déroulé » plutôt que redessiné.
  // La longueur est EXACTE (somme des segments) et non estimée : le tracé est une
  // polyligne, pas une courbe de Bézier.
  // `reduceMotion` court-circuite tout et rend l'état final (charte a11y).
  const drawAnim = useRef(new Animated.Value(0)).current;
  const dataKey = data.join('|');
  useEffect(() => {
    if (reduceMotion) {
      drawAnim.setValue(1);
      return undefined;
    }
    drawAnim.setValue(0);
    const anim = Animated.timing(drawAnim, {
      toValue: 1,
      duration: motion.max,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // props SVG : non prises en charge par le driver natif
    });
    anim.start();
    return () => anim.stop();
  }, [dataKey, measuredW, reduceMotion, drawAnim]);

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
  // Colonne d'axe RÉSERVÉE à droite (largeur fixe) : les libellés de graduation y
  // vivent exclusivement ; le tracé ET le tooltip sont bornés à sa GAUCHE. Les deux
  // occupent donc des colonnes horizontalement DISJOINTES → aucun texte-sur-texte
  // possible, quelle que soit la hauteur (approche structurelle qui remplace le
  // positionnement dynamique fragile des itérations précédentes). 42px couvre tout
  // libellé réaliste (jusqu'à ~6 chiffres à fontSize 9 ≈ 30px) avec marge. Sans grille
  // (aucun libellé) → colonne nulle, tracé pleine largeur (comportement historique).
  const axisW = showGrid ? 42 : 0;
  const plotRight = w - padding - axisW; // bord droit de la zone tracé + tooltip
  const innerW = plotRight - padding;    // = w - 2·padding - axisW
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

  // Longueur EXACTE du tracé : somme des segments (polyligne, pas de Bézier).
  // Sert de `strokeDasharray` — le trait est masqué puis déroulé.
  const pathLen = points.reduce(
    (acc, p, i) => (i === 0 ? 0 : acc + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y)),
    0
  ) || 1;
  const dashOffset = drawAnim.interpolate({ inputRange: [0, 1], outputRange: [pathLen, 0] });
  // Aire, points et libellé n'apparaissent qu'une fois le trait bien engagé (60 %),
  // sinon ils flottent devant une courbe encore absente.
  const trailIn = drawAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] });
  const areaOpacity = drawAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 0.15] });

  // Graduations Y (4 repères, valeurs décroissantes de max vers min), rendues dans la
  // colonne d'axe réservée à droite. Le nombre n'a plus besoin d'être réduit pour
  // éviter le chevauchement (les colonnes tracé/axe sont disjointes) → on restitue la
  // précision d'échelle complète perdue lors des itérations précédentes.
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

  // Position du tooltip. Horizontalement : centré sur le point mais STRICTEMENT borné
  // à la zone de tracé (bord droit ≤ plotRight) → il n'entre jamais dans la colonne
  // d'axe. Verticalement : au-dessus du point, bascule en dessous s'il déborderait en
  // haut, borné à l'écran. Plus d'anti-collision verticale : tooltip et libellés étant
  // dans des colonnes disjointes, une coïncidence de hauteur ne produit aucun
  // chevauchement de texte.
  const tipW = tipSize?.width ?? 0;
  const tipH = tipSize?.height ?? 0;
  const selPoint = sel != null ? points[sel] : null;
  const tipRawTop = selPoint ? selPoint.y - tipH - 10 : 0;
  const rawTop = tipRawTop < 0 ? (selPoint ? selPoint.y + 12 : 0) : tipRawTop;
  const tipTop = selPoint ? Math.min(Math.max(rawTop, 0), Math.max(height - tipH, 0)) : 0;
  // Borne horizontale ABSOLUE : le bord droit du tooltip ne dépasse jamais plotRight,
  // donc il reste hors de la colonne d'axe → jamais de chevauchement avec un libellé.
  const tipLeft = selPoint
    ? Math.min(Math.max(selPoint.x - tipW / 2, 0), Math.max(plotRight - tipW, 0))
    : 0;

  // Y du label « valeur du dernier point » (showLastValue) : au-dessus du point par
  // défaut, mais SOUS lui si sa baseline devient trop haute (< 12) — sinon les glyphes
  // (fontSize 11) sortent par le HAUT du SVG (y<0) et react-native-svg les rend EN
  // MIROIR. Ce cas survient quand le dernier point est au sommet, i.e. sa valeur ==
  // graduation max. (Le bug est devenu visible après la séparation des colonnes : le
  // label, jadis superposé au libellé d'axe à droite, est maintenant isolé.)
  const lastLabelY =
    n > 0 && points[n - 1].y - 9 >= 12 ? points[n - 1].y - 9 : (n > 0 ? points[n - 1].y + 16 : 0);

  // Le libellé « valeur du dernier point » (showLastValue) fait DOUBLON avec un
  // libellé de graduation quand la valeur du dernier point coïncide avec une valeur
  // AFFICHÉE sur l'axe (max, min ou intermédiaire — d'abord observé au max « 525 »
  // fantôme, puis symétriquement au min « 225 » sur Results h=120) : la colonne d'axe
  // affiche déjà cette valeur à la même hauteur. On masque alors showLastValue —
  // le libellé d'axe reste l'unique référence. Hors coïncidence : affiché comme avant
  // (avec la bascule anti-miroir lastLabelY ci-dessus).
  const lastAtGrad =
    showGrid && n > 0 && grads.some((g) => g.val === Math.round(data[n - 1]));

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
        {/* Repères d'axe X : dans la bande paddingBottom (sous la baseline, jamais
            sur la courbe/points). x clampé aux bords de la zone tracé. Aucun conflit
            possible avec le tooltip (il ne passe SOUS un point que lorsque celui-ci
            est en haut du graphe) ni avec showLastValue (bascule à y+16 max). */}
        {Array.isArray(xLabels) && padB >= 14
          ? points.map((p, i) =>
              xLabels[i] ? (
                <SvgText
                  key={`x${i}`}
                  x={Math.min(Math.max(p.x, 18), plotRight - 18)}
                  y={height - 4}
                  fontSize={9}
                  fontFamily={fonts.bodyRegular}
                  fill={colors.textFaint}
                  textAnchor="middle"
                >
                  {xLabels[i]}
                </SvgText>
              ) : null
            )
          : null}
        {fillArea && n > 1 ? <AnimatedPath d={area} fill={stroke} fillOpacity={areaOpacity} /> : null}
        {n > 1 ? (
          <AnimatedPolyline
            points={polyline}
            fill="none"
            stroke={stroke}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={[pathLen, pathLen]}
            strokeDashoffset={dashOffset}
          />
        ) : null}
        {/* Les points apparaissent APRÈS le trait (fondu tardif) : posés d'emblée,
            ils flotteraient devant une courbe encore en train de se dessiner. Le
            point de sélection ci-dessous n'est PAS dans ce groupe — il doit rester
            visible immédiatement si l'utilisateur tape pendant l'animation. */}
        <AnimatedG opacity={trailIn}>
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
        </AnimatedG>
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
        {showLastValue && sel !== n - 1 && !lastAtGrad ? (
          <SvgText
            x={points[n - 1].x}
            y={lastLabelY}
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

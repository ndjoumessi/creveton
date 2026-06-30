// Palette des graphiques Recharts adaptée au thème (clair / « Cockpit Émeraude Nuit »).
// Recharts ne lit pas les variables CSS du thème : on fournit donc des couleurs
// concrètes par thème pour les axes, la grille et les tooltips. Côté composant,
// brancher sur `useThemeStore((s) => s.isDark)` → réactif au basculement de thème.
//
// Les valeurs reflètent les tokens d'index.css : en nuit, axisText ≈ --muted,
// axisLine/grid ≈ --border, tooltipBg ≈ --surface, tooltipText ≈ --ink,
// inactive ≈ --fg-faint.

const LIGHT = {
  axisText: '#6b7280',
  axisLine: '#e5e7eb',
  grid: '#eef1ee',
  inactive: '#9ca3af',
  tooltipBg: '#ffffff',
  tooltipText: '#0b2e1a',
  tooltipBorder: '#e5e7eb',
};

const DARK = {
  axisText: '#81c784',
  axisLine: '#234a2c',
  grid: '#234a2c',
  inactive: '#4f8a55',
  tooltipBg: '#17341f',
  tooltipText: '#e8f5e9',
  tooltipBorder: '#234a2c',
};

/**
 * Couleurs de graphique pour le thème courant.
 * `tooltip` est spreadable directement : <Tooltip {...ct.tooltip} formatter={…} />
 * (pose contentStyle + itemStyle + labelStyle pour que le texte reste lisible en nuit).
 */
export function chartTheme(isDark) {
  const c = isDark ? DARK : LIGHT;
  return {
    axisText: c.axisText,
    axisLine: c.axisLine,
    grid: c.grid,
    inactive: c.inactive,
    tooltip: {
      contentStyle: {
        background: c.tooltipBg,
        border: `1px solid ${c.tooltipBorder}`,
        borderRadius: 10,
        fontFamily: 'Space Grotesk',
        fontSize: 13,
      },
      itemStyle: { color: c.tooltipText },
      labelStyle: { color: c.tooltipText },
    },
  };
}

export default chartTheme;

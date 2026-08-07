// Palette des graphiques Recharts adaptée au thème (clair / « Cockpit Émeraude Nuit »).
// Recharts ne lit pas les variables CSS du thème : on fournit donc des couleurs
// concrètes par thème pour les axes, la grille et les tooltips. Côté composant,
// brancher sur `useThemeStore((s) => s.isDark)` → réactif au basculement de thème.
//
// Les valeurs reflètent les tokens d'index.css : en nuit, axisText ≈ --muted,
// axisLine/grid ≈ --border, tooltipBg ≈ --surface, tooltipText ≈ --ink,
// inactive ≈ --fg-faint.

// Police des graphes. Littérale et NON `var(--font-body)` : les ticks Recharts
// atterrissent sur des attributs de présentation SVG, où var() ne se résout pas.
// Miroir de --font-body (index.css) — à garder synchronisé.
const CHART_FONT = "'Inter', system-ui, sans-serif";

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
    fontFamily: CHART_FONT,
    tooltip: {
      contentStyle: {
        background: c.tooltipBg,
        border: `1px solid ${c.tooltipBorder}`,
        borderRadius: 10,
        fontFamily: CHART_FONT,
        fontSize: 13,
      },
      itemStyle: { color: c.tooltipText },
      labelStyle: { color: c.tooltipText },
    },
  };
}

export default chartTheme;

/**
 * Jauge semi-circulaire (SVG) 0–100 %. Couleur selon la valeur :
 * rouge < 50 %, orange 50–70 %, vert > 70 %. Chiffre central en Outfit.
 *
 * ─ Pourquoi les couleurs ne sont plus ici ─
 * Elles étaient littérales, et le composant est né avant le thème sombre. Le
 * chiffre central était peint en `#0b2e1a` (green900) : 14,1:1 sur le panneau
 * clair, mais **1,30:1** sur le panneau sombre — invisible, comme on le voyait
 * sur « Stats globales ». Le rail, lui, faisait l'inverse : `#e8efe9` est
 * discret en clair (1,12:1) et devient une bande blanche à 9,76:1 en sombre,
 * donc l'élément le plus criard de la jauge. Et les deux arcs de valeur les
 * plus fréquents passaient sous le minimum de 3:1 exigé pour un objet
 * graphique (rouge 2,99 · vert 2,64).
 *
 * Les trois couches sont désormais portées par des classes CSS, qui ont une
 * variante sombre (cf. index.css). Le composant ne décide plus que du PALIER,
 * pas de la teinte — c'est le seul découpage qui empêche l'oubli de se répéter.
 */
export default function Gauge({ value = 0, size = 180, label }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = size * 0.42;
  const cx = size / 2;
  const cy = size / 2;
  const circ = Math.PI * r; // longueur du demi-cercle
  const tone = v < 50 ? 'low' : v < 70 ? 'mid' : 'high';
  // Demi-cercle : de gauche (180°) à droite (0°).
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <div className="gauge" style={{ width: size }}>
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
        <path className="gauge-track" d={arc} fill="none" strokeWidth="12" strokeLinecap="round" />
        <path
          className={`gauge-arc ${tone}`}
          d={arc}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v / 100)}
        />
        <text className="gauge-value" x={cx} y={cy - 2} textAnchor="middle" style={{ fontSize: size * 0.2 }}>
          {Math.round(v)}%
        </text>
      </svg>
      {label && <div className="gauge-label">{label}</div>}
    </div>
  );
}

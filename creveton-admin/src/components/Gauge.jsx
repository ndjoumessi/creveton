/**
 * Jauge semi-circulaire (SVG) 0–100 %. Couleur selon la valeur :
 * rouge < 50 %, orange 50–70 %, vert > 70 %. Chiffre central en Outfit.
 */
export default function Gauge({ value = 0, size = 180, label }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = size * 0.42;
  const cx = size / 2;
  const cy = size / 2;
  const circ = Math.PI * r; // longueur du demi-cercle
  const color = v < 50 ? '#e74c3c' : v < 70 ? '#f59e0b' : '#2a8a4f';
  // Demi-cercle : de gauche (180°) à droite (0°).
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <div className="gauge" style={{ width: size }}>
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
        <path d={arc} fill="none" stroke="#e8efe9" strokeWidth="12" strokeLinecap="round" />
        <path
          d={arc}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v / 100)}
          style={{ transition: 'stroke-dashoffset 600ms ease, stroke 300ms' }}
        />
        <text x={cx} y={cy - 2} textAnchor="middle" style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: size * 0.2, fill: '#0b2e1a' }}>
          {Math.round(v)}%
        </text>
      </svg>
      {label && <div className="gauge-label">{label}</div>}
    </div>
  );
}

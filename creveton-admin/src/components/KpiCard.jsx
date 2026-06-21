import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Sparkline from './Sparkline';
import { num } from '../utils/format';

/**
 * KPI card premium : icône teintée + valeur (Outfit 800, Règle Outfit-pour-les-
 * Chiffres) + label + variation vs hier + sparkline inline 60×24.
 * @param tone  green | gold | blue | violet — teinte du carré d'icône.
 * @param delta nombre (% vs hier) — vert si ≥ 0, rouge sinon. null = masqué.
 */
export default function KpiCard({ icon, label, value, tone = 'green', delta = null, spark = [] }) {
  const up = delta != null && delta >= 0;
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <div className="kpi-label">{label}</div>
        <div className={`kpi-icon ${tone}`}>{icon}</div>
      </div>
      <div className="kpi-value">{typeof value === 'number' ? num(value) : value}</div>
      <div className="kpi-foot">
        {delta != null ? (
          <span className={`kpi-delta ${up ? 'up' : 'down'}`}>
            {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {up ? '+' : ''}{delta}% <span className="muted" style={{ fontWeight: 400 }}>vs hier</span>
          </span>
        ) : <span />}
        {spark.length > 1 && <Sparkline values={spark} color={up ? '#2a8a4f' : '#e74c3c'} fill />}
      </div>
    </div>
  );
}

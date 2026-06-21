import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Sparkline from './Sparkline';
import { useCountUp } from '../hooks/useCountUp';
import { num } from '../utils/format';

/**
 * KPI card premium : carré d'icône teinté 48×48 + valeur (Outfit 800, count-up au
 * mount) + label + variation vs hier + sparkline inline 100×36. Liseré-top 3px
 * teinté + hover (scale + ombre) gérés en CSS via `.kpi--<tone>`.
 * @param tone  green | gold | blue | violet — teinte du carré d'icône & du liseré.
 * @param delta nombre (% vs hier) — vert si ≥ 0, rouge sinon. null = masqué.
 */
export default function KpiCard({ icon, label, value, tone = 'green', delta = null, spark = [] }) {
  const up = delta != null && delta >= 0;
  const numeric = typeof value === 'number';
  const [counted, ref] = useCountUp(numeric ? value : 0, { duration: 800 });
  return (
    <div className={`card kpi kpi--${tone}`} ref={ref}>
      <div className="kpi-top">
        <div className="kpi-label">{label}</div>
        <div className={`kpi-icon ${tone}`}>{icon}</div>
      </div>
      <div className="kpi-value">{numeric ? num(counted) : value}</div>
      <div className="kpi-foot">
        {delta != null ? (
          <span className={`kpi-delta ${up ? 'up' : 'down'}`}>
            {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {up ? '+' : ''}{delta}% <span className="muted" style={{ fontWeight: 400 }}>vs hier</span>
          </span>
        ) : <span />}
        {spark.length > 1 && <Sparkline values={spark} width={100} height={36} color={up ? '#2a8a4f' : '#e74c3c'} fill />}
      </div>
    </div>
  );
}

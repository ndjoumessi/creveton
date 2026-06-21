import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { colors } from '../constants/theme';

/**
 * Carte KPI : valeur principale, variation vs 30j, mini-courbe de tendance.
 * @param {string} label
 * @param {string} value        valeur formatée (FCFA / nombre).
 * @param {number} delta        variation en % (signée).
 * @param {Array}  spark        [{ i, v }] pour la mini-courbe.
 * @param {ReactNode} icon
 * @param {ReactNode} extra     ligne secondaire (répartition, en attente…).
 */
export default function KPICard({ label, value, delta, spark = [], icon, extra }) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <div>
          <div className="kpi-label">{label}</div>
          <div className="kpi-value">{value}</div>
        </div>
        {icon && <div className="kpi-icon">{icon}</div>}
      </div>
      <div className="kpi-foot">
        <div className="stack" style={{ gap: 4 }}>
          {delta != null && (
            <span className={`kpi-delta ${up ? 'up' : 'down'}`}>
              {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {up ? '+' : ''}{delta}% <span className="muted" style={{ fontWeight: 500 }}>vs 30j</span>
            </span>
          )}
          {extra && <span className="kpi-extra">{extra}</span>}
        </div>
        {spark.length > 0 && (
          <div className="kpi-spark">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={spark}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={up ? colors.green500 : colors.red400}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

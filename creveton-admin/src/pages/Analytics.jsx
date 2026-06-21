import { useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { Users, UserPlus, Activity, TrendingUp } from 'lucide-react';
import analyticsService from '../services/analytics.service';
import { useApiData } from '../hooks/useApiData';
import { colors, chartColors } from '../constants/theme';
import { num, pct } from '../utils/format';
import KPICard from '../components/KPICard';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

// Sélecteur de période : libellé affiché → valeur attendue par l'API (§3.8).
const PERIODS = [
  { label: '7j', value: '7d' },
  { label: '30j', value: '30d' },
  { label: '90j', value: '90d' },
];

export default function Analytics() {
  const [period, setPeriod] = useState('30d');
  const { data, loading } = useApiData(() => analyticsService.get(period), [period]);

  if (loading && !data) return <LoadingSpinner label="Chargement de l’analytique…" />;
  const d = data;

  // Sélecteur de période injecté dans les actions du header.
  const periodSelector = (
    <div className="lang-toggle">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          className={period === p.value ? 'active' : ''}
          onClick={() => setPeriod(p.value)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Analytique"
        description="Engagement, rétention et funnel d’acquisition de la plateforme."
        actions={periodSelector}
      />

      {/* KPI principaux */}
      <div className="grid grid-kpi" style={{ marginBottom: 18 }}>
        <KPICard label="DAU (actifs / jour)" value={num(d.dau)} icon={<Users size={19} />} />
        <KPICard label="MAU (actifs / mois)" value={num(d.mau)} icon={<Activity size={19} />} />
        <KPICard label="Ratio DAU / MAU" value={pct(d.dau_mau_ratio)} icon={<TrendingUp size={19} />} />
        <KPICard label="Nouveaux inscrits" value={num(d.new_signups)} icon={<UserPlus size={19} />} />
      </div>

      {/* Rétention par cohorte + sessions */}
      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card card-pad">
          <h3 className="card-title" style={{ marginBottom: 4 }}>Rétention par cohorte</h3>
          <p className="card-sub" style={{ marginBottom: 14 }}>Rétention J1 / J7 / J30</p>
          <div className="grid grid-3">
            <div className="kpi" style={{ padding: 0 }}>
              <div className="kpi-label">J1</div>
              <div className="kpi-value">{pct(d.retention.d1)}</div>
            </div>
            <div className="kpi" style={{ padding: 0 }}>
              <div className="kpi-label">J7</div>
              <div className="kpi-value">{pct(d.retention.d7)}</div>
            </div>
            <div className="kpi" style={{ padding: 0 }}>
              <div className="kpi-label">J30</div>
              <div className="kpi-value">{pct(d.retention.d30)}</div>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="card-title" style={{ marginBottom: 4 }}>Sessions</h3>
          <p className="card-sub" style={{ marginBottom: 14 }}>Qualité de l’engagement par session</p>
          <div className="grid grid-2">
            <div className="kpi" style={{ padding: 0 }}>
              <div className="kpi-label">Durée moyenne de session</div>
              <div className="kpi-value">{`${d.avg_session_min} min`}</div>
            </div>
            <div className="kpi" style={{ padding: 0 }}>
              <div className="kpi-label">Parties / session</div>
              <div className="kpi-value">{d.games_per_session}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Courbe d'activité + funnel */}
      <div className="grid grid-2">
        <div className="card card-pad">
          <h3 className="card-title" style={{ marginBottom: 4 }}>Activité quotidienne (DAU &amp; inscriptions)</h3>
          <p className="card-sub" style={{ marginBottom: 12 }}>Évolution sur la période</p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={d.series} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} stroke="#eee" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: colors.muted }}
                interval={Math.ceil(d.series.length / 8)}
              />
              <YAxis tick={{ fontSize: 11, fill: colors.muted }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="dau" name="DAU" stroke={chartColors[0]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="signups" name="Inscriptions" stroke={chartColors[1]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card card-pad">
          <h3 className="card-title" style={{ marginBottom: 4 }}>Funnel d’inscription</h3>
          <p className="card-sub" style={{ marginBottom: 12 }}>Taux de passage à chaque étape (%)</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={d.funnel} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} stroke="#eee" />
              <XAxis dataKey="step" tick={{ fontSize: 11, fill: colors.muted }} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: colors.muted }} />
              <Tooltip formatter={(v) => `${v} %`} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {d.funnel.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

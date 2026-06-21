import { useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { Wallet, Landmark, Users, ArrowLeftRight, Activity } from 'lucide-react';
import api, { withMock } from '../services/api';
import mockDashboard from '../mocks/mockDashboard';
import { useApiData } from '../hooks/useApiData';
import { colors, chartColors } from '../constants/theme';
import { fcfa, num } from '../utils/format';
import KPICard from '../components/KPICard';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

const fetchDashboard = () =>
  withMock(() => api.get('/admin/dashboard').then((r) => r.data), mockDashboard);

const PERIODS = ['7j', '30j', '90j'];
const fcfaShort = (n) => `${Math.round(n / 1000)}k`;

function SystemPill({ label, state }) {
  const txt = { ok: 'Opérationnel', warn: 'Dégradé', down: 'Hors service' }[state] || state;
  return (
    <div className="system-pill">
      <span className={`dot ${state}`} /> <strong style={{ fontWeight: 600 }}>{label}</strong>
      <span className="muted" style={{ marginLeft: 'auto' }}>{txt}</span>
    </div>
  );
}

export default function Dashboard() {
  const { data, loading } = useApiData(fetchDashboard, [], { pollMs: 30000 });
  const [period, setPeriod] = useState('30j');

  if (loading && !data) return <LoadingSpinner label="Chargement du tableau de bord…" />;
  const d = data || mockDashboard;
  const { kpis, byType, donut, series, system } = d;
  const donutTotal = donut.reduce((s, x) => s + x.value, 0);

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Vue d’ensemble temps réel de l’activité de la plateforme."
      />

      {/* KPI */}
      <div className="grid grid-kpi" style={{ marginBottom: 18 }}>
        <KPICard
          label={kpis.volume.label} value={fcfa(kpis.volume.value)} delta={kpis.volume.delta}
          spark={kpis.volume.spark} icon={<Wallet size={19} />}
          extra={`Frais perçus : ${fcfa(kpis.volume.fees)}`}
        />
        <KPICard
          label={kpis.balance.label} value={fcfa(kpis.balance.value)} delta={kpis.balance.delta}
          spark={kpis.balance.spark} icon={<Landmark size={19} />}
        />
        <KPICard
          label={kpis.users.label} value={num(kpis.users.value)} delta={kpis.users.delta}
          spark={kpis.users.spark} icon={<Users size={19} />}
          extra={`${num(kpis.users.players)} joueurs · ${kpis.users.admins} admins · ${kpis.users.merchants} marchands`}
        />
        <KPICard
          label={kpis.transactions.label} value={num(kpis.transactions.value)} delta={kpis.transactions.delta}
          spark={kpis.transactions.spark} icon={<ArrowLeftRight size={19} />}
          extra={`${kpis.transactions.pending} en attente`}
        />
      </div>

      {/* Bar + Donut */}
      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card card-pad">
          <div className="between" style={{ marginBottom: 12 }}>
            <div><h3 className="card-title">Volume de transactions par type</h3><p className="card-sub">Inscriptions · Challenges · Payouts · Recharges</p></div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byType} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.muted }} interval={0} />
              <YAxis tickFormatter={fcfaShort} tick={{ fontSize: 11, fill: colors.muted }} />
              <Tooltip formatter={(v) => fcfa(v)} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {byType.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card card-pad">
          <h3 className="card-title" style={{ marginBottom: 4 }}>Répartition des types</h3>
          <p className="card-sub" style={{ marginBottom: 8 }}>Part de chaque flux</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2}>
                {donut.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fcfa(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="stack" style={{ gap: 7, marginTop: 6 }}>
            {donut.map((x, i) => (
              <div key={x.name} className="between" style={{ fontSize: 12.5 }}>
                <span className="row"><span className="dot" style={{ background: chartColors[i % chartColors.length] }} /> {x.name}</span>
                <strong>{((x.value / donutTotal) * 100).toFixed(0)}%</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Line + system */}
      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="between" style={{ marginBottom: 12 }}>
            <div><h3 className="card-title">Volume par type</h3><p className="card-sub">Évolution sur la période</p></div>
            <div className="lang-toggle">
              {PERIODS.map((p) => (
                <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={series[period]} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} stroke="#eee" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: colors.muted }} interval={Math.ceil(series[period].length / 8)} />
              <YAxis tickFormatter={fcfaShort} tick={{ fontSize: 11, fill: colors.muted }} />
              <Tooltip formatter={(v) => fcfa(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="inscriptions" name="Inscriptions" stroke={chartColors[0]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="challenges" name="Challenges" stroke={chartColors[1]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="payouts" name="Payouts" stroke={chartColors[2]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="recharges" name="Recharges" stroke={chartColors[3]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card card-pad">
          <h3 className="card-title" style={{ marginBottom: 4 }}>État du système</h3>
          <p className="card-sub" style={{ marginBottom: 14 }}>Services & indicateurs temps réel</p>
          <div className="system-pill" style={{ marginBottom: 10 }}>
            <Activity size={16} color={colors.green500} /> <strong style={{ fontWeight: 600 }}>API</strong>
            <span className="muted" style={{ marginLeft: 'auto' }}>{system.api === 'ok' ? 'Opérationnelle' : 'Dégradée'} · {system.latency_ms} ms</span>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <SystemPill label="Mobile Money" state={system.services.mobile_money} />
            <SystemPill label="SMS (Twilio)" state={system.services.sms} />
            <SystemPill label="Push (FCM)" state={system.services.push} />
          </div>
        </div>
      </div>
    </>
  );
}

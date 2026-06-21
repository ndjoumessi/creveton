import { Link } from 'react-router-dom';
import { Users, Gamepad2, FileCheck2, Trophy, ArrowRight, Check, X, Server, Database, Zap, RefreshCw, UserPlus, Target } from 'lucide-react';
import dashboardService from '../services/dashboard.service';
import sessionsService from '../services/sessions.service';
import questionsService from '../services/questions.service';
import { useApiData } from '../hooks/useApiData';
import { num, dateFr, dateTimeFr, initials, avatarColor, isToday } from '../utils/format';
import { themeLabels, levelLabels } from '../constants/theme';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import ThemeBadge from '../components/ThemeBadge';
import { notify } from '../components/Toast';

const truncate = (s, n = 50) => (s && s.length > n ? `${s.slice(0, n)}…` : s);
const Avatar = ({ name, lg }) => (
  <div className={`avatar-c ${lg ? 'avatar-lg' : ''}`} style={{ background: avatarColor(name) }}>{initials(name)}</div>
);

const fetchAll = async () => {
  const settle = (p, fb) => Promise.resolve(p).then((r) => r).catch(() => fb);
  const [overview, sessions] = await Promise.all([
    settle(dashboardService.overview(), { kpis: {}, recent_users: [], pending_questions: [], system: {} }),
    settle(sessionsService.list({}), { data: [] }),
  ]);
  return { ...overview, sessions: sessions.data || [] };
};

function KpiTile({ icon, label, value }) {
  return (
    <div className="card kpi">
      <div className="kpi-top"><div className="kpi-label">{label}</div><div className="kpi-icon">{icon}</div></div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

function SysPill({ icon, label, state, value }) {
  const up = state === 'operational';
  return (
    <div className="system-pill">
      {icon}<strong style={{ fontWeight: 600 }}>{label}</strong>
      <span className="row" style={{ marginLeft: 'auto', gap: 6 }}>
        {value ? <span className="muted">{value}</span> : <><span className={`dot ${up ? 'ok' : 'down'}`} /> <span className="muted">{up ? 'Opérationnel' : 'Indisponible'}</span></>}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const { data, refetch } = useApiData(fetchAll, [], { pollMs: 30000 });
  if (!data) return <LoadingSpinner label="Chargement du tableau de bord…" />;

  const kpis = data.kpis || {};
  const recentUsers = data.recent_users || [];
  const pending = data.pending_questions || [];
  const system = data.system || {};
  const sessions = data.sessions || [];

  // Activité du jour
  const todaySessions = sessions.filter((s) => isToday(s.played_at));
  const avgScoreToday = todaySessions.length ? Math.round(todaySessions.reduce((a, s) => a + s.score, 0) / todaySessions.length) : 0;
  const signupsToday = recentUsers.filter((u) => isToday(u.created_at)).length;

  const decide = async (q, to) => {
    try {
      await questionsService.transition(q.id, to, to === 'rejected' ? 'Rejetée depuis le dashboard' : undefined);
      notify.success(to === 'approved' ? 'Question approuvée' : 'Question rejetée');
      refetch();
    } catch { notify.error('Action impossible.'); }
  };

  return (
    <>
      <PageHeader title="Tableau de bord" description="Vue d’ensemble et actions rapides — MVP gratuit." />

      <div className="grid grid-kpi" style={{ marginBottom: 20 }}>
        <KpiTile icon={<Users size={19} />} label="Utilisateurs inscrits" value={num(kpis.total_users)} />
        <KpiTile icon={<Gamepad2 size={19} />} label="Parties jouées aujourd’hui" value={num(kpis.games_today)} />
        <KpiTile icon={<FileCheck2 size={19} />} label="Questions actives" value={num(kpis.active_questions)} />
        <KpiTile icon={<Trophy size={19} />} label="Tournois ouverts" value={num(kpis.open_tournaments)} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card card-pad">
          <h3 className="card-title">Activité récente</h3>
          <p className="card-sub" style={{ marginBottom: 8 }}>Derniers utilisateurs inscrits</p>
          {recentUsers.length === 0 ? <p className="muted" style={{ padding: '14px 0' }}>Aucun utilisateur.</p> : recentUsers.map((u) => (
            <div className="list-row" key={u.id}>
              <Avatar name={u.name} />
              <div className="grow"><div className="list-name">{u.name}</div><div className="list-sub">{u.ville || '—'}</div></div>
              <span className="muted" style={{ fontSize: 12.5 }}>{dateFr(u.created_at)}</span>
            </div>
          ))}
          <div style={{ marginTop: 12 }}><Link className="card-link" to="/users">Voir tous les utilisateurs <ArrowRight size={14} /></Link></div>
        </div>

        <div className="card card-pad">
          <div className="between" style={{ marginBottom: 6 }}>
            <h3 className="card-title">Questions à réviser</h3>
            {pending.length > 0 && <span className="badge" style={{ background: '#fef3c7', color: '#a16207' }}>{pending.length}</span>}
          </div>
          <p className="card-sub" style={{ marginBottom: 8 }}>En attente de modération</p>
          {pending.length === 0 ? <p className="muted" style={{ padding: '14px 0' }}>Aucune question en attente. 🎉</p> : pending.map((q) => (
            <div className="list-row" key={q.id}>
              <div className="grow"><div className="list-name" style={{ fontSize: 13.5 }}>{truncate(q.text_fr)}</div><div style={{ marginTop: 4 }}><ThemeBadge theme={q.theme} /></div></div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-sm btn-success" onClick={() => decide(q, 'approved')}><Check size={14} /> Approuver</button>
                <button className="btn btn-sm btn-danger" onClick={() => decide(q, 'rejected')}><X size={14} /> Rejeter</button>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12 }}><Link className="card-link" to="/questions">Gérer les questions <ArrowRight size={14} /></Link></div>
        </div>
      </div>

      {/* Dernières parties + Activité du jour */}
      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card card-pad">
          <h3 className="card-title">Dernières parties jouées</h3>
          <p className="card-sub" style={{ marginBottom: 8 }}>5 parties les plus récentes</p>
          {sessions.length === 0 ? <p className="muted" style={{ padding: '14px 0' }}>Aucune partie.</p> : sessions.slice(0, 5).map((s) => (
            <div className="list-row" key={s.id}>
              <Avatar name={s.user.name} />
              <div className="grow">
                <div className="list-name">{s.user.name}</div>
                <div className="list-sub">{themeLabels[s.theme] || s.theme} · {levelLabels[s.level] || s.level}</div>
              </div>
              <div className="stack" style={{ alignItems: 'flex-end', gap: 2 }}>
                <strong style={{ color: 'var(--green700)' }}>{num(s.score)} pts</strong>
                <span className="muted" style={{ fontSize: 11.5 }}>{dateFr(s.played_at)}</span>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12 }}><Link className="card-link" to="/sessions">Voir toutes les parties <ArrowRight size={14} /></Link></div>
        </div>

        <div className="card card-pad">
          <h3 className="card-title">Activité du jour</h3>
          <p className="card-sub" style={{ marginBottom: 14 }}>Statistiques des dernières 24h</p>
          <div className="grid grid-3" style={{ gap: 12 }}>
            <div className="stat"><div className="row" style={{ gap: 7 }}><UserPlus size={16} color="#2a8a4f" /><span className="muted" style={{ fontSize: 12.5 }}>Inscriptions</span></div><div className="kpi-value" style={{ fontSize: 28, marginTop: 8 }}>{num(signupsToday)}</div></div>
            <div className="stat"><div className="row" style={{ gap: 7 }}><Gamepad2 size={16} color="#2a8a4f" /><span className="muted" style={{ fontSize: 12.5 }}>Parties</span></div><div className="kpi-value" style={{ fontSize: 28, marginTop: 8 }}>{num(kpis.games_today)}</div></div>
            <div className="stat"><div className="row" style={{ gap: 7 }}><Target size={16} color="#2a8a4f" /><span className="muted" style={{ fontSize: 12.5 }}>Score moyen</span></div><div className="kpi-value" style={{ fontSize: 28, marginTop: 8 }}>{num(avgScoreToday)}</div></div>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="card-title" style={{ marginBottom: 4 }}>Statut système</h3>
        <p className="card-sub" style={{ marginBottom: 14 }}>Services & dernière synchronisation</p>
        <div className="sys-grid">
          <SysPill icon={<Server size={16} color="#2a8a4f" />} label="Backend API" state={system.api} />
          <SysPill icon={<Database size={16} color="#2a8a4f" />} label="Base de données" state={system.db} />
          <SysPill icon={<Zap size={16} color="#2a8a4f" />} label="Redis" state={system.redis} />
          <SysPill icon={<RefreshCw size={16} color="#6b7280" />} label="Dernière sync" value={dateTimeFr(system.last_sync)} />
        </div>
      </div>
    </>
  );
}

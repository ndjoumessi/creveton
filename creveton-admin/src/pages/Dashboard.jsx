import { Link } from 'react-router-dom';
import { Users, Gamepad2, FileCheck2, Trophy, ArrowRight, Check, X, Server, Database, Zap, RefreshCw } from 'lucide-react';
import questionsService from '../services/questions.service';
import usersService from '../services/users.service';
import tournamentsService from '../services/tournaments.service';
import dashboardService from '../services/dashboard.service';
import { useApiData } from '../hooks/useApiData';
import { num, dateFr, dateTimeFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import ThemeBadge from '../components/ThemeBadge';
import { notify } from '../components/Toast';

const truncate = (s, n = 56) => (s && s.length > n ? `${s.slice(0, n)}…` : s);
const initials = (name) => (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// Chaque appel est isolé : un endpoint en échec (ex. /tournaments 501,
// /admin/dashboard 404) ne doit JAMAIS faire planter tout le dashboard.
const settle = (p, fallback) => Promise.resolve(p).then((r) => r).catch(() => fallback);
const DEFAULT_SUMMARY = { games_today: 0, system: { api: 'down', database: 'down', redis: 'down' }, last_questions_sync: null };

const fetchAll = async () => {
  const [q, u, t, s] = await Promise.all([
    settle(questionsService.list({}), { data: [] }),
    settle(usersService.list({}), { data: [] }),
    settle(tournamentsService.list(), { data: [] }),
    settle(dashboardService.summary(), DEFAULT_SUMMARY),
  ]);
  return {
    questions: q?.data || [],
    users: u?.data || [],
    tournaments: t?.data || [],
    summary: s || DEFAULT_SUMMARY,
  };
};

function KpiTile({ icon, label, value }) {
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <div className="kpi-label">{label}</div>
        <div className="kpi-icon">{icon}</div>
      </div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

function SysPill({ icon, label, state = 'ok', value }) {
  const txt = { ok: 'Opérationnel', warn: 'Dégradé', down: 'Hors service' }[state];
  return (
    <div className="system-pill">
      {icon}
      <strong style={{ fontWeight: 600 }}>{label}</strong>
      <span className="row" style={{ marginLeft: 'auto', gap: 6 }}>
        {value ? <span className="muted">{value}</span> : <><span className={`dot ${state}`} /> <span className="muted">{txt}</span></>}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const { data, refetch } = useApiData(fetchAll, [], { pollMs: 30000 });

  // Garde défensive : tant que les données ne sont pas prêtes, on affiche le
  // spinner (data ne devrait jamais être null grâce à `settle`, mais on protège
  // contre tout déstructuration de null → page blanche).
  if (!data) return <LoadingSpinner label="Chargement du tableau de bord…" />;
  const { questions, users, tournaments, summary } = data;

  const approvedCount = questions.filter((q) => q.status === 'approved').length;
  const pending = questions.filter((q) => q.status === 'pending_review');
  const openTournaments = tournaments.filter((t) => ['open', 'running'].includes(t.status)).length;
  const recentUsers = [...users].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

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

      {/* Ligne 1 — KPI */}
      <div className="grid grid-kpi" style={{ marginBottom: 20 }}>
        <KpiTile icon={<Users size={19} />} label="Utilisateurs inscrits" value={num(users.length)} />
        <KpiTile icon={<Gamepad2 size={19} />} label="Parties jouées aujourd’hui" value={num(summary.games_today)} />
        <KpiTile icon={<FileCheck2 size={19} />} label="Questions actives" value={num(approvedCount)} />
        <KpiTile icon={<Trophy size={19} />} label="Tournois ouverts" value={num(openTournaments)} />
      </div>

      {/* Ligne 2 — Activité récente + Questions à réviser */}
      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card card-pad">
          <div className="between" style={{ marginBottom: 6 }}>
            <h3 className="card-title">Activité récente</h3>
          </div>
          <p className="card-sub" style={{ marginBottom: 8 }}>Derniers utilisateurs inscrits</p>
          {recentUsers.length === 0 ? (
            <p className="muted" style={{ padding: '14px 0' }}>Aucun utilisateur.</p>
          ) : (
            recentUsers.map((u) => (
              <div className="list-row" key={u.id}>
                <div className="avatar-sm">{initials(u.name)}</div>
                <div className="grow">
                  <div className="list-name">{u.name}</div>
                  <div className="list-sub">{u.ville || '—'}</div>
                </div>
                <span className="muted" style={{ fontSize: 12.5 }}>{dateFr(u.created_at)}</span>
              </div>
            ))
          )}
          <div style={{ marginTop: 12 }}>
            <Link className="card-link" to="/users">Voir tous les utilisateurs <ArrowRight size={14} /></Link>
          </div>
        </div>

        <div className="card card-pad">
          <div className="between" style={{ marginBottom: 6 }}>
            <h3 className="card-title">Questions à réviser</h3>
            {pending.length > 0 && <span className="badge" style={{ background: '#fef3c7', color: '#a16207' }}>{pending.length}</span>}
          </div>
          <p className="card-sub" style={{ marginBottom: 8 }}>En attente de modération</p>
          {pending.length === 0 ? (
            <p className="muted" style={{ padding: '14px 0' }}>Aucune question en attente. 🎉</p>
          ) : (
            pending.slice(0, 5).map((q) => (
              <div className="list-row" key={q.id}>
                <div className="grow">
                  <div className="list-name" style={{ fontSize: 13.5 }}>{truncate(q.text_fr)}</div>
                  <div style={{ marginTop: 4 }}><ThemeBadge theme={q.theme} /></div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-sm btn-success" onClick={() => decide(q, 'approved')}><Check size={14} /> Approuver</button>
                  <button className="btn btn-sm btn-danger" onClick={() => decide(q, 'rejected')}><X size={14} /> Rejeter</button>
                </div>
              </div>
            ))
          )}
          <div style={{ marginTop: 12 }}>
            <Link className="card-link" to="/questions">Gérer les questions <ArrowRight size={14} /></Link>
          </div>
        </div>
      </div>

      {/* Ligne 3 — Statut système */}
      <div className="card card-pad">
        <h3 className="card-title" style={{ marginBottom: 4 }}>Statut système</h3>
        <p className="card-sub" style={{ marginBottom: 14 }}>Services & dernière synchronisation</p>
        <div className="sys-grid">
          <SysPill icon={<Server size={16} color="#2a8a4f" />} label="Backend API" state={summary.system.api} />
          <SysPill icon={<Database size={16} color="#2a8a4f" />} label="Base de données" state={summary.system.database} />
          <SysPill icon={<Zap size={16} color="#2a8a4f" />} label="Redis" state={summary.system.redis} />
          <SysPill icon={<RefreshCw size={16} color="#6b7280" />} label="Sync questions" value={dateTimeFr(summary.last_questions_sync)} />
        </div>
      </div>
    </>
  );
}

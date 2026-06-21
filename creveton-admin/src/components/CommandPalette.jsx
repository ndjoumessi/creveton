import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, LayoutDashboard, Trophy, FileQuestion, Gamepad2, Swords, Users, Settings, CornerDownLeft,
} from 'lucide-react';
import usersService from '../services/users.service';
import questionsService from '../services/questions.service';
import sessionsService from '../services/sessions.service';
import { useFocusTrap } from '../hooks/useFocusTrap';

const PAGES = [
  { label: 'Tableau de bord', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Classement', to: '/classement', icon: Trophy },
  { label: 'Questions', to: '/questions', icon: FileQuestion },
  { label: 'Parties', to: '/sessions', icon: Gamepad2 },
  { label: 'Tournois', to: '/tournaments', icon: Swords },
  { label: 'Utilisateurs', to: '/users', icon: Users },
  { label: 'Paramètres', to: '/settings', icon: Settings },
];

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ users: [], questions: [], sessions: [] });
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const trapRef = useFocusTrap(open, () => setOpen(false));

  // Cmd/Ctrl+K → ouvrir/fermer.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) { setQ(''); setActive(0); setResults({ users: [], questions: [], sessions: [] }); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  // Recherche données (debounce) quand la requête a ≥ 2 caractères.
  useEffect(() => {
    if (!open || q.trim().length < 2) { setResults({ users: [], questions: [], sessions: [] }); return undefined; }
    const id = setTimeout(async () => {
      const [u, qu, s] = await Promise.all([
        usersService.list({ q, limit: 4 }).then((r) => r.data || []).catch(() => []),
        questionsService.list({ q, limit: 4 }).then((r) => r.data || []).catch(() => []),
        sessionsService.list({ q, limit: 4 }).then((r) => r.data || []).catch(() => []),
      ]);
      setResults({ users: u.slice(0, 4), questions: qu.slice(0, 4), sessions: s.slice(0, 4) });
    }, 220);
    return () => clearTimeout(id);
  }, [q, open]);

  const pageMatches = useMemo(
    () => PAGES.filter((p) => p.label.toLowerCase().includes(q.trim().toLowerCase())),
    [q],
  );

  // Liste plate des actions navigables (pour clavier ↑↓ + Enter).
  const flat = useMemo(() => {
    const items = pageMatches.map((p) => ({ key: `page:${p.to}`, label: p.label, icon: p.icon, to: p.to }));
    results.users.forEach((u) => items.push({ key: `u:${u.id}`, label: u.name, sub: u.email, to: '/users' }));
    results.questions.forEach((qq) => items.push({ key: `q:${qq.id}`, label: (qq.text_fr || '').slice(0, 60), sub: 'Question', to: '/questions' }));
    results.sessions.forEach((se) => items.push({ key: `s:${se.id}`, label: `Partie · ${se.user?.name || ''}`, sub: se.theme, to: '/sessions' }));
    return items;
  }, [pageMatches, results]);

  const go = (to) => { setOpen(false); navigate(to); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); go(flat[active].to); }
  };

  if (!open) return null;
  return (
    <div className="overlay cmdk-overlay" onMouseDown={() => setOpen(false)}>
      <div className="cmdk" ref={trapRef} role="dialog" aria-modal="true" aria-label="Palette de commandes" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Rechercher une page, un joueur, une question…"
            aria-label="Recherche"
          />
          <kbd className="cmdk-kbd">Esc</kbd>
        </div>
        <div className="cmdk-list">
          {flat.length === 0 && <div className="cmdk-empty">Aucun résultat.</div>}
          {flat.map((it, i) => {
            const Icon = it.icon;
            return (
              <button
                key={it.key}
                className={`cmdk-item ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(it.to)}
              >
                <span className="cmdk-ico">{Icon ? <Icon size={16} /> : <Search size={15} />}</span>
                <span className="cmdk-main">
                  <span className="cmdk-label">{it.label}</span>
                  {it.sub && <span className="cmdk-sub">{it.sub}</span>}
                </span>
                {i === active && <CornerDownLeft size={14} className="muted" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

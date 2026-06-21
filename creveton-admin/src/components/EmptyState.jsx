import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title = 'Aucune donnée', message }) {
  return (
    <div className="empty">
      <Icon size={32} strokeWidth={1.5} />
      <div className="stack" style={{ alignItems: 'center' }}>
        <strong style={{ color: 'var(--ink)' }}>{title}</strong>
        {message && <span style={{ fontSize: 13 }}>{message}</span>}
      </div>
    </div>
  );
}

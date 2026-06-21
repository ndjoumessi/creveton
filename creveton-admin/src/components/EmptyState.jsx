import { Inbox } from 'lucide-react';

/**
 * État vide générique. Accepte une illustration personnalisée (`illustration`),
 * un titre, un message et une action (CTA).
 */
export default function EmptyState({ icon: Icon = Inbox, illustration, title = 'Aucune donnée', message, action }) {
  return (
    <div className="empty">
      <div className="empty-illus">{illustration || <Icon size={40} strokeWidth={1.5} />}</div>
      <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
        <h3>{title}</h3>
        {message && <span style={{ fontSize: 14 }}>{message}</span>}
      </div>
      {action}
    </div>
  );
}

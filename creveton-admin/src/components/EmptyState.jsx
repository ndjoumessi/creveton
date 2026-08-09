import { Inbox } from 'lucide-react';
import i18n from '../i18n';

/**
 * État vide générique. Accepte une illustration personnalisée (`illustration`),
 * un titre, un message et une action (CTA).
 *
 * Le titre par défaut était le littéral français « Aucune donnée » : sur la page
 * Games en anglais, la table vide affichait « Aucune donnée » AU-DESSUS du
 * message « No data » passé par l'appelant. Même piège que `deltaLabel` dans
 * KpiCard — un défaut écrit en dur traverse la traduction sans qu'on le voie,
 * parce que les appelants passent presque toujours la prop. `common.noData`
 * existait déjà.
 */
export default function EmptyState({ icon: Icon = Inbox, illustration, title, message, action }) {
  const heading = title ?? i18n.t('common.noData');
  return (
    <div className="empty">
      <div className="empty-illus">{illustration || <Icon size={40} strokeWidth={1.5} />}</div>
      <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
        <h3>{heading}</h3>
        {message && <span style={{ fontSize: 14 }}>{message}</span>}
      </div>
      {action}
    </div>
  );
}

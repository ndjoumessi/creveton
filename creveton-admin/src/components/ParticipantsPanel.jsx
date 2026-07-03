import './ParticipantsPanel.css';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, UserPlus, Users } from 'lucide-react';
import Avatar from './Avatar';
import { num, fcfa } from '../utils/format';

// Normalise pour un filtre insensible casse ET accents (prénoms camerounais :
// « aicha » doit matcher « Aïcha », « marlene » → « Marlène »).
const norm = (s) => (s || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase();

/**
 * ParticipantsPanel — Cockpit Émeraude
 * -------------------------------------------------
 * Liste des participants d'un tournoi. Adapté du redesign fourni :
 * - État vide DIFFÉRENCIÉ : « aucun inscrit » vs « filtre sans résultat »
 *   (la distinction porte sur la LISTE des participants, pas sur le dropdown
 *   d'enrôlement de l'annuaire — celui-ci vit dans TournoiDetail).
 * - Skeleton de chargement propre au panneau (participants === null).
 * - Recherche = filtre CLIENT sur les participants déjà chargés, avec icône,
 *   debounce et compteur de résultats.
 *
 * L'enrôlement (recherche annuaire → sélection → confirmation) reste géré par
 * TournoiDetail ; ici `onInvite` ouvre simplement ce flux existant.
 *
 * Props :
 * - participants : Array<{ id, userId, name, avatarUrl, rank?, score?, payout? }>
 *                  | null  (null = chargement → skeleton)
 * - totalSlots   : number  (max_players ; 0 = illimité)
 * - isClosed     : bool     (affiche la colonne Gain)
 * - canAdd       : bool     (affiche la CTA « Inscrire un joueur »)
 * - canRemove    : bool     (affiche le bouton Retirer par ligne)
 * - onInvite     : () => void            (ouvre le flux d'enrôlement existant)
 * - onRemove     : (participant) => void (déclenche la confirmation de retrait)
 */
export default function ParticipantsPanel({
  participants,
  totalSlots = 0,
  isClosed = false,
  canAdd = false,
  canRemove = false,
  onInvite,
  onRemove,
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const debounceRef = useRef(null);

  const isLoading = participants === null;
  const registeredCount = participants?.length ?? 0;

  // Debounce du filtre client (léger : évite le churn de rendu sur grande liste).
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(norm(query.trim())), 150);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const isSearchMode = debounced.length > 0;

  const filtered = useMemo(() => {
    if (!participants) return [];
    if (!isSearchMode) return participants;
    return participants.filter((p) => norm(p.name).includes(debounced));
  }, [participants, isSearchMode, debounced]);

  const subtitle = isLoading
    ? t('common.loading')
    : totalSlots > 0
      ? t('tournaments.detail.slotsSummary', { count: registeredCount, total: totalSlots })
      : t('tournaments.detail.registeredCount', { count: registeredCount });

  return (
    <section className="cve-panel card" role="region" aria-label={t('tournaments.detail.participants')}>
      <header className="cve-panel__header">
        <div className="cve-panel__heading">
          <h3 className="cve-panel__title">{t('tournaments.detail.participants')}</h3>
          <p className="cve-panel__subtitle">{subtitle}</p>
        </div>
        {canAdd && (
          <button className="btn btn-sm btn-gold cve-panel__cta" onClick={onInvite}>
            <UserPlus size={14} strokeWidth={2} />
            {t('tournaments.detail.addParticipant')}
          </button>
        )}
      </header>

      {/* Filtre client sur les participants chargés */}
      <div className="cve-panel__search">
        <Search size={17} strokeWidth={2} className="cve-panel__search-icon" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('tournaments.detail.filterPlaceholder')}
          className="cve-input cve-input--with-icon"
          aria-label={t('tournaments.detail.filterPlaceholder')}
          disabled={isLoading || registeredCount === 0}
        />
        {query && (
          <button
            className="cve-panel__search-clear"
            onClick={() => setQuery('')}
            aria-label={t('common.clear', 'Effacer')}
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      {isSearchMode && !isLoading && (
        <p className="cve-panel__result-count" aria-live="polite">
          {t('tournaments.detail.resultCount', { count: filtered.length })}
        </p>
      )}

      <div className="cve-panel__body">
        {isLoading ? (
          <ParticipantsSkeleton />
        ) : registeredCount === 0 ? (
          <EmptyState
            icon={<Users size={40} strokeWidth={1.5} />}
            title={t('tournaments.detail.noParticipantsTitle')}
            description={t('tournaments.detail.noParticipantsMessage')}
            cta={canAdd ? (
              <button className="btn btn-gold btn-sm" onClick={onInvite}>
                <UserPlus size={16} strokeWidth={2} />
                {t('tournaments.detail.addParticipant')}
              </button>
            ) : null}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={40} strokeWidth={1.5} />}
            title={t('tournaments.detail.noResults')}
            description={t('tournaments.detail.noResultsMessage', { query: query.trim() })}
          />
        ) : (
          <ul className="cve-participant-list">
            {filtered.map((p) => (
              <ParticipantRow
                key={p.id}
                participant={p}
                isClosed={isClosed}
                canRemove={canRemove}
                onRemove={onRemove}
                t={t}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ParticipantRow({ participant, isClosed, canRemove, onRemove, t }) {
  const { name, avatarUrl, rank, score, payout } = participant;
  return (
    <li className="cve-participant-row">
      <Avatar name={name} src={avatarUrl} size="sm" />
      <div className="cve-participant-row__info">
        <span className="cve-participant-row__name">{name}</span>
        {typeof rank === 'number' && rank > 0 && (
          <span className="cve-participant-row__rank">#{rank}</span>
        )}
      </div>
      {isClosed && (
        <span className="cve-participant-row__gain">{payout > 0 ? fcfa(payout) : '—'}</span>
      )}
      {typeof score === 'number' && (
        <span className="cve-participant-row__score">
          {num(score)} <span className="cve-participant-row__score-unit">pts</span>
        </span>
      )}
      {canRemove && (
        <button
          className="btn btn-sm btn-danger-ghost cve-participant-row__remove"
          onClick={() => onRemove?.(participant)}
        >
          {t('tournaments.actions.remove')}
        </button>
      )}
    </li>
  );
}

function EmptyState({ title, description, icon, cta }) {
  return (
    <div className="cve-empty-state" role="status">
      <div className="cve-empty-state__icon">{icon}</div>
      <p className="cve-empty-state__title">{title}</p>
      <p className="cve-empty-state__description">{description}</p>
      {cta}
    </div>
  );
}

function ParticipantsSkeleton() {
  return (
    <ul className="cve-participant-list" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="cve-participant-row cve-participant-row--skeleton">
          <div className="skeleton cve-skel-avatar" />
          <div className="skeleton cve-skel-line" />
        </li>
      ))}
    </ul>
  );
}

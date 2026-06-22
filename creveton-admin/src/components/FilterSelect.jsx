import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import './FilterSelect.css';

/**
 * Select custom réutilisable (dropdown maison, pas le <select> natif).
 * Ferme sur clic extérieur / Échap. Option active = ✓ + teinte. Quand une valeur
 * (≠ '') est choisie, le trigger passe en « actif » et affiche une croix de reset.
 *
 * @param options  [{ value, label, icon?, dot? }] — value '' = option « tous ».
 * @param value    valeur courante ('' = aucun filtre).
 * @param onChange (value) => void
 */
export default function FilterSelect({ options, value, onChange, placeholder, ariaLabel, clearLabel = 'Réinitialiser' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const active = value !== '' && value != null;
  const selected = options.find((o) => o.value === value);

  return (
    <div className={`fsel ${active ? 'is-active' : ''} ${open ? 'is-open' : ''}`} ref={ref}>
      <button
        type="button"
        className="fsel-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {selected?.icon && <span className="fsel-ic" aria-hidden="true">{selected.icon}</span>}
        <span className="fsel-label">{selected ? selected.label : placeholder}</span>
        {active ? (
          <span
            className="fsel-clear"
            role="button"
            tabIndex={0}
            aria-label={clearLabel}
            onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange(''); setOpen(false); } }}
          >
            <X size={13} />
          </span>
        ) : (
          <ChevronDown size={15} className={`fsel-chev ${open ? 'open' : ''}`} aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="fsel-menu" role="listbox">
          {options.map((o) => (
            <button
              type="button"
              key={o.value || '__all'}
              className={`fsel-opt ${o.value === value ? 'is-selected' : ''}`}
              role="option"
              aria-selected={o.value === value}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.icon && <span className="fsel-opt-ic" aria-hidden="true">{o.icon}</span>}
              {o.dot && <span className="fsel-opt-dot" style={{ background: o.dot }} aria-hidden="true" />}
              <span className="fsel-opt-label">{o.label}</span>
              {o.value === value && <Check size={15} className="fsel-opt-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

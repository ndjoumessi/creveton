import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

/** Modal centrée. Ferme sur Échap / clic overlay. Focus trap (a11y). */
export default function Modal({ open, onClose, title, children, footer, width }) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        style={width ? { width } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="card-title" style={{ fontSize: 17 }}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

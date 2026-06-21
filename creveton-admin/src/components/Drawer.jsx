import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

/** Panneau latéral droit (fiche détail). Échap ferme, clic overlay ferme, focus trap. */
export default function Drawer({ open, onClose, title, children, footer, width }) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="drawer"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        style={width ? { width: `min(${width}px, 96vw)` } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <h3 className="card-title" style={{ fontSize: 17 }}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

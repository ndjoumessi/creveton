import { useState, useEffect } from 'react';
import { initials, avatarColor } from '../utils/format';

/**
 * Avatar : photo (prop `src`) si disponible, sinon initiales sur fond de couleur
 * DÉTERMINISTE dérivée du nom. Si l'image échoue à charger (404), on retombe
 * gracieusement sur les initiales. Tailles : sm (36) · md (44) · lg (64) · xl (72).
 */
export default function Avatar({ name, size = 'sm', src = null }) {
  const cls = { sm: '', md: 'avatar-md', lg: 'avatar-lg', xl: 'avatar-xl' }[size] || '';
  const [failed, setFailed] = useState(false);
  // Réinitialise l'état d'erreur quand la source change (nouvel upload).
  useEffect(() => { setFailed(false); }, [src]);

  if (src && !failed) {
    return (
      <img
        className={`avatar-c avatar-img ${cls}`}
        src={src}
        alt={name || ''}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={`avatar-c ${cls}`} style={{ background: avatarColor(name) }} aria-hidden="true">
      {initials(name)}
    </div>
  );
}

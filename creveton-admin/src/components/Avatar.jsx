import { initials, avatarColor } from '../utils/format';

/**
 * Avatar coloré : initiales sur fond de couleur DÉTERMINISTE dérivée du nom
 * (même nom → même couleur). Tailles : sm (36) · md (44) · lg (64) · xl (72).
 */
export default function Avatar({ name, size = 'sm' }) {
  const cls = { sm: '', md: 'avatar-md', lg: 'avatar-lg', xl: 'avatar-xl' }[size] || '';
  return (
    <div className={`avatar-c ${cls}`} style={{ background: avatarColor(name) }} aria-hidden="true">
      {initials(name)}
    </div>
  );
}

import { forwardRef } from 'react';

// Fin wrapper autour des icônes Lucide : taille/couleur/épaisseur cohérentes.
// Décoratif par défaut (aria-hidden) — accolé à un libellé texte. Pour une icône
// SEULE et cliquable, le bouton parent porte l'aria-label.
export const Icon = forwardRef(
  ({ icon: IconComponent, size = 18, color = 'currentColor', strokeWidth = 1.75, className = '', ...props }, ref) => (
    <IconComponent
      ref={ref}
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
      {...props}
    />
  ),
);

Icon.displayName = 'Icon';

export default Icon;

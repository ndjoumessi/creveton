import { forwardRef } from 'react';

// Fin wrapper autour des icônes Lucide React Native : taille/couleur/épaisseur
// cohérentes. Passer une `color` explicite (token theme) à chaque appel — RN
// n'a pas de `currentColor`.
const Icon = forwardRef(({ icon: IconComponent, size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }, ref) => (
  <IconComponent ref={ref} size={size} color={color} strokeWidth={strokeWidth} {...props} />
));

Icon.displayName = 'Icon';

export default Icon;

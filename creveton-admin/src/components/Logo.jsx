/**
 * Logo Creveton — vrai logo de marque (cœur drapeau camerounais dans des mains).
 * Doit correspondre EXACTEMENT au logo de l'app mobile (et au favicon).
 * Servi depuis /public/logo.png.
 */
export default function Logo({ size = 40, className = '' }) {
  return (
    <img
      src="/logo.png"
      alt="Creveton"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
}

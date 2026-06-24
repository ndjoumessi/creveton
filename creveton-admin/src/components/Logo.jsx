/**
 * Logo Creveton — vrai logo de marque (cœur drapeau camerounais dans des mains).
 * Doit correspondre EXACTEMENT au logo de l'app mobile (et au favicon).
 * Servi depuis /public/logo.png.
 */
export default function Logo({ size = 40, className = '' }) {
  return (
    <div
      className={className}
      style={{
        width: size + 8,
        height: size + 8,
        borderRadius: '50%',
        backgroundColor: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <img
        src="/logo.png"
        alt="Creveton"
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    </div>
  );
}

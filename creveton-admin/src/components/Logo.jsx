/**
 * Logo Creveton — carré arrondi or + « C » vert foncé.
 * Doit correspondre EXACTEMENT au logo de l'app mobile (et au favicon).
 * SVG inline pour rester net à toutes les tailles, sans requête réseau.
 */
export default function Logo({ size = 40, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Creveton"
    >
      <rect width="80" height="80" rx="18" fill="#d4a017" />
      <text
        x="40"
        y="56"
        textAnchor="middle"
        fontSize="48"
        fontWeight="900"
        fontFamily="Outfit, Arial, sans-serif"
        fill="#0b2e1a"
      >
        C
      </text>
    </svg>
  );
}

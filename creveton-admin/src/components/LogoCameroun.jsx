/**
 * LogoCameroun — placeholder vectoriel en attendant le vrai PNG
 * (« drapeau camerounais en cœur dans des mains »).
 * Cœur aux trois bandes verticales du drapeau (vert · rouge · or) + étoile or.
 * SVG inline → net à toutes les tailles, sans requête réseau.
 * À remplacer par <img src="/logo.png" /> quand l'asset final est livré.
 */
export default function LogoCameroun({ size = 80, className = '' }) {
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
      <defs>
        <clipPath id="cm-heart">
          <path d="M40 71 C40 71 9 50 9 28 C9 16.5 18 9 27.5 9 C33.5 9 37.8 12 40 16.5 C42.2 12 46.5 9 52.5 9 C62 9 71 16.5 71 28 C71 50 40 71 40 71 Z" />
        </clipPath>
      </defs>
      {/* Trois bandes verticales du drapeau, découpées en cœur */}
      <g clipPath="url(#cm-heart)">
        <rect x="0" y="0" width="27" height="80" fill="#007a5e" />
        <rect x="27" y="0" width="26" height="80" fill="#ce1126" />
        <rect x="53" y="0" width="27" height="80" fill="#fcd116" />
      </g>
      {/* Étoile or au centre */}
      <path
        fill="#fcd116"
        d="M40 22 L43.1 31.4 L53 31.4 L45 37.2 L48.1 46.6 L40 40.8 L31.9 46.6 L35 37.2 L27 31.4 L36.9 31.4 Z"
      />
      {/* Contour cœur discret */}
      <path
        d="M40 71 C40 71 9 50 9 28 C9 16.5 18 9 27.5 9 C33.5 9 37.8 12 40 16.5 C42.2 12 46.5 9 52.5 9 C62 9 71 16.5 71 28 C71 50 40 71 40 71 Z"
        fill="none"
        stroke="rgba(0,0,0,0.12)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

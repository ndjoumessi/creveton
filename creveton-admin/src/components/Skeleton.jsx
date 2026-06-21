/**
 * Skeleton loaders (shimmer) — à utiliser sur TOUS les états de chargement API.
 * Jamais d'écran blanc : on montre la silhouette du contenu attendu.
 */
export function Skeleton({ w, h = 14, r = 8, style }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/** Rangée de KPI cards en chargement (par défaut 4). */
export function SkeletonKpis({ count = 4 }) {
  return (
    <div className="grid grid-kpi" style={{ marginBottom: 20 }}>
      {Array.from({ length: count }).map((_, i) => <div key={i} className="skeleton skel-kpi" />)}
    </div>
  );
}

/** Table en chargement (en-tête + lignes). */
export function SkeletonTable({ rows = 8, cols = 5 }) {
  return (
    <div className="card skel-table">
      {Array.from({ length: rows }).map((_, r) => (
        <div className="skel-tr" key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} w={c === 0 ? 36 : `${Math.max(40, 120 - c * 12)}px`} h={c === 0 ? 36 : 14} r={c === 0 ? 10 : 8} style={{ flex: c === 0 ? 'none' : 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Bloc card générique en chargement. */
export function SkeletonCard({ h = 280 }) {
  return <div className="skeleton" style={{ height: h, borderRadius: 16 }} />;
}

export default Skeleton;

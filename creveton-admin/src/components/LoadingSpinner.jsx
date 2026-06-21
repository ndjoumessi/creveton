export default function LoadingSpinner({ label }) {
  return (
    <div className="spinner-wrap">
      <div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
        <div className="spinner" />
        {label && <span className="muted" style={{ fontSize: 13 }}>{label}</span>}
      </div>
    </div>
  );
}

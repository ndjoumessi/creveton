import { Component } from 'react';

/**
 * Capture les erreurs de rendu React (sinon → page blanche silencieuse) et
 * affiche un écran d'erreur lisible avec le message + la stack, plutôt que de
 * démonter tout l'arbre sans rien afficher.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Visible aussi dans la console navigateur pour le diagnostic.
    console.error('[ErrorBoundary] Erreur de rendu :', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ minHeight: '100vh', background: '#f8f9fa', padding: '48px 24px', fontFamily: "'Space Grotesk', system-ui, sans-serif", color: '#374151' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", color: '#0b2e1a', fontSize: 22, marginTop: 0 }}>
            Une erreur est survenue
          </h1>
          <p style={{ color: '#6b7280' }}>
            L’interface a rencontré une erreur de rendu. Détails techniques ci-dessous :
          </p>
          <pre style={{ background: '#fef2f2', color: '#b91c1c', padding: 14, borderRadius: 8, overflowX: 'auto', fontSize: 13, whiteSpace: 'pre-wrap' }}>
            {String(error?.message || error)}
          </pre>
          {error?.stack && (
            <pre style={{ background: '#f3f4f6', color: '#4b5563', padding: 14, borderRadius: 8, overflowX: 'auto', fontSize: 12, maxHeight: 280 }}>
              {error.stack}
            </pre>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              onClick={() => { this.setState({ error: null }); window.location.assign('/'); }}
              style={{ background: '#0b2e1a', color: '#d4a017', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}
            >
              Retour au tableau de bord
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}
            >
              Recharger la page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

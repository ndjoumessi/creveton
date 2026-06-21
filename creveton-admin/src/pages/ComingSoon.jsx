import { Clock } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

export default function ComingSoon() {
  const { pathname } = useLocation();
  return (
    <>
      <PageHeader title="Bientôt disponible" description={`Le module « ${pathname} » est en cours de développement.`} />
      <div className="card">
        <div className="empty">
          <Clock size={32} strokeWidth={1.5} />
          <strong style={{ color: 'var(--ink)' }}>Module à venir</strong>
          <span style={{ fontSize: 13 }}>Cette section sera connectée au backend dans une prochaine itération.</span>
        </div>
      </div>
    </>
  );
}

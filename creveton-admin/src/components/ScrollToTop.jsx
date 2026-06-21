import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/** Bouton « Retour en haut » : apparaît après 400 px de défilement. */
export default function ScrollToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!show) return null;
  return (
    <button
      className="scroll-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Retour en haut"
      title="Retour en haut"
    >
      <ArrowUp size={20} />
    </button>
  );
}

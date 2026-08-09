import { useEffect } from 'react';

/**
 * Rejoue le défilement vers l'ancre de l'URL après le montage.
 *
 * Pourquoi c'est nécessaire : sous `BrowserRouter`, le navigateur cherche
 * `#about` au moment où il analyse le document — c'est-à-dire AVANT que React
 * ait rendu quoi que ce soit. L'élément n'existe pas encore, le saut natif ne
 * trouve rien, et la page reste en haut. Le symptôme ne se voit qu'au
 * chargement à FROID (lien partagé, rafraîchissement, favori) : un clic depuis
 * la page, lui, fonctionne nativement puisque la cible est déjà dans le DOM.
 *
 * Deux passes, et c'est délibéré :
 *   1. tout de suite après le montage — mieux vaut une position approchée que
 *      le haut de page ;
 *   2. une fois les polices web prêtes — tant qu'Outfit et Inter ne sont pas
 *      appliquées, le repli `system-ui` donne des hauteurs de section
 *      différentes, donc un document plus court, et le premier saut tombe à
 *      côté de la cible.
 *
 * Un geste de l'utilisateur (molette, doigt, clavier) annule la seconde passe :
 * s'il a commencé à lire ailleurs entre-temps, le ramener de force à l'ancre
 * serait pire que le défaut qu'on corrige. On écoute `wheel`/`touchstart`/
 * `keydown` et non `scroll` — `scroll` est justement ce que notre propre saut
 * déclenche, il s'annulerait lui-même.
 */
export function useHashScroll() {
  useEffect(() => {
    const raw = window.location.hash.slice(1);
    if (!raw) return undefined;

    let id;
    try {
      id = decodeURIComponent(raw);
    } catch {
      // Hash mal encodé (%-séquence invalide) : on retombe sur le brut plutôt
      // que de laisser `decodeURIComponent` casser le montage de la page.
      id = raw;
    }
    if (!id) return undefined;

    let cancelled = false;
    let raf = 0;
    const takeOver = () => {
      cancelled = true;
    };
    window.addEventListener('wheel', takeOver, { passive: true, once: true });
    window.addEventListener('touchstart', takeOver, { passive: true, once: true });
    window.addEventListener('keydown', takeOver, { once: true });

    const jump = () => {
      const target = document.getElementById(id);
      // `behavior: 'auto'` et non `smooth` : sur une arrivée par lien partagé,
      // le lecteur veut être À la section, pas la regarder défiler depuis le
      // héro. C'est aussi ce que fait le saut natif qu'on remplace.
      if (target) target.scrollIntoView({ block: 'start', behavior: 'auto' });
    };

    jump();

    const settle = () => {
      raf = requestAnimationFrame(() => {
        if (!cancelled) jump();
      });
    };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(settle).catch(settle);
    } else {
      settle();
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('wheel', takeOver);
      window.removeEventListener('touchstart', takeOver);
      window.removeEventListener('keydown', takeOver);
    };
  }, []);
}

export default useHashScroll;

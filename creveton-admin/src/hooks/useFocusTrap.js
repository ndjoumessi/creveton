import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/**
 * Piège le focus clavier dans un conteneur (modal/drawer) tant qu'il est ouvert,
 * et ferme sur Échap. Restaure le focus à l'élément précédent à la fermeture.
 * Renvoie une ref à poser sur le conteneur.
 *
 * IMPORTANT : l'effet ne dépend QUE de `open`. `onClose` est lu via une ref, donc
 * un handler recréé à chaque rendu (ex. closure inline dans un modal qui se
 * re-rend à chaque frappe) ne relance PAS l'effet. Sans cela, le focus initial
 * (`first.focus()`) se redéclenchait à chaque caractère → impossible d'écrire
 * dans les champs (le focus sautait hors de l'input à chaque frappe).
 */
export function useFocusTrap(open, onClose) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const node = ref.current;
    const previouslyFocused = document.activeElement;

    const focusables = () => Array.from(node?.querySelectorAll(FOCUSABLE) || []).filter((el) => el.offsetParent !== null);
    // Focus initial UNE SEULE FOIS à l'ouverture (deps = [open]).
    const first = focusables()[0];
    if (first) first.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { onCloseRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    };
  }, [open]);

  return ref;
}

export default useFocusTrap;

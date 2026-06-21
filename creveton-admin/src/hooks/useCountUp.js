import { useEffect, useRef, useState } from 'react';

/**
 * Anime un compteur de 0 → `end` quand l'élément entre dans le viewport
 * (IntersectionObserver). Renvoie [value, ref] : poser `ref` sur l'élément.
 */
export function useCountUp(end, { duration = 1400 } = {}) {
  const [value, setValue] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const obs = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || started.current) return;
      started.current = true;
      const target = Number(end) || 0;
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        // easeOutCubic
        const eased = 1 - (1 - p) ** 3;
        setValue(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    obs.observe(node);
    return () => obs.disconnect();
  }, [end, duration]);

  return [value, ref];
}

export default useCountUp;

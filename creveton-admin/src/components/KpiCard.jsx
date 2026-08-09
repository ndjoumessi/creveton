import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import Sparkline from './Sparkline';
import { useCountUp } from '../hooks/useCountUp';
import { num } from '../utils/format';
import i18n from '../i18n';

/**
 * En dessous de ce nombre d'observations sur la période PRÉCÉDENTE, un
 * pourcentage de variation ne mesure plus rien. « Parties aujourd'hui : 3 »
 * avec « −62 % vs hier » et une sparkline rouge, c'était 8 → 3 : du bruit
 * habillé en tendance, et la seule tache rouge du tableau de bord. Sous le
 * seuil on montre la paire brute, qui dit exactement la même chose sans
 * prétendre à une signification statistique.
 */
export const MIN_DELTA_SAMPLE = 20;

/**
 * KPI card : carré d'icône 48×48 + valeur (Outfit 800, count-up au mount) +
 * label + variation vs période précédente + sparkline inline.
 *
 * La prop `tone` (green | gold | blue | violet) a été RETIRÉE. Elle peignait le
 * liseré supérieur et le carré d'icône, et le tableau de bord comme les Finances
 * l'assignaient PAR POSITION : la première carte était verte parce qu'elle était
 * première, la quatrième violette parce qu'elle était quatrième. Une couleur qui
 * ne code rien coûte plus qu'elle ne rapporte — le lecteur cherche le code et
 * n'en trouve pas. Trois règles de DESIGN.md y passaient : l'Or Rare (l'or
 * atterrissait en décor sur « Parties aujourd'hui » et « Retraits »), le Sens
 * Doublé, et l'anti-référence « jauges arc-en-ciel qui noient la donnée ».
 *
 * @param delta nombre (% vs période précédente) — vert si > 0, rouge si < 0,
 *              NEUTRE à 0. null = masqué.
 * @param base  effectif de la période précédente. Sous MIN_DELTA_SAMPLE, le
 *              pourcentage cède la place à la paire brute (`base → value`).
 */
// `deltaLabel` par DÉFAUT et non littéral : c'était `'vs hier'` en dur, et
// aucune des quatre cartes du tableau de bord ne passe la prop — la console
// anglaise affichait donc « -100% vs hier » sous « Games today ». La clé
// existait déjà (`common.vsYesterday`), personne ne la lisait.
export default function KpiCard({ icon, label, value, delta = null, base = null, deltaLabel, spark = [] }) {
  const deltaText = deltaLabel ?? i18n.t('common.vsYesterday');
  // Zéro n'est ni une hausse ni une baisse. La condition était `>= 0`, donc
  // « +0 % » s'affichait en vert avec une flèche montante : sur la page
  // Finances, trois cartes à zéro annonçaient toutes une croissance. Trois
  // états, pas deux.
  const trend = delta == null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const up = trend === 'up';
  const numeric = typeof value === 'number';
  const smallSample = base != null && base < MIN_DELTA_SAMPLE;
  const [counted, ref] = useCountUp(numeric ? value : 0, { duration: 800 });
  return (
    <div className="card kpi" ref={ref}>
      <div className="kpi-top">
        <div className="kpi-label">{label}</div>
        <div className="kpi-icon">{icon}</div>
      </div>
      <div className="kpi-value">{numeric ? num(counted) : value}</div>
      <div className="kpi-foot">
        {trend && smallSample && numeric ? (
          // Paire brute : pas de flèche, pas de couleur de tendance. L'écart
          // est visible, on n'y ajoute pas un jugement que l'effectif ne porte pas.
          <span className="kpi-delta raw">
            {num(base)} → {num(value)} <span className="muted" style={{ fontWeight: 400 }}>{deltaText}</span>
          </span>
        ) : trend ? (
          <span className={`kpi-delta ${trend}`}>
            {trend === 'up' ? <ArrowUpRight size={14} /> : trend === 'down' ? <ArrowDownRight size={14} /> : <Minus size={14} />}
            {up ? '+' : ''}{delta}% <span className="muted" style={{ fontWeight: 400 }}>{deltaText}</span>
          </span>
        ) : <span />}
        {spark.length > 1 && (
          // Couleur NEUTRE et non teintée par la tendance : la direction est
          // déjà portée par la flèche ET la couleur du delta juste à gauche.
          // Peindre la courbe en rouge en plus, c'était doubler un jugement —
          // sur trois parties, la moitié du tableau de bord virait à l'alerte.
          // On laisse le défaut de Sparkline (#2a8a4f) : `stroke`/`fill` sont des
          // attributs de présentation SVG, où var() ne se résout pas (même piège
          // que les ticks Recharts, cf. chartTheme.js).
          <Sparkline values={spark} width={100} height={36} fill />
        )}
      </div>
    </div>
  );
}

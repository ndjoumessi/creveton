import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import Sparkline from './Sparkline';
import { useCountUp } from '../hooks/useCountUp';
import { num } from '../utils/format';
import i18n from '../i18n';

/**
 * KPI card premium : carré d'icône teinté 48×48 + valeur (Outfit 800, count-up au
 * mount) + label + variation vs hier + sparkline inline 100×36. Liseré-top 3px
 * teinté + hover (scale + ombre) gérés en CSS via `.kpi--<tone>`.
 * @param tone  green | gold | blue | violet — teinte du carré d'icône & du liseré.
 * @param delta nombre (% vs hier) — vert si > 0, rouge si < 0, NEUTRE à 0. null = masqué.
 */
// `deltaLabel` par DÉFAUT et non littéral : c'était `'vs hier'` en dur, et
// aucune des quatre cartes du tableau de bord ne passe la prop — la console
// anglaise affichait donc « -100% vs hier » sous « Games today ». La clé
// existait déjà (`common.vsYesterday`), personne ne la lisait.
export default function KpiCard({ icon, label, value, tone = 'green', delta = null, deltaLabel, spark = [] }) {
  const deltaText = deltaLabel ?? i18n.t('common.vsYesterday');
  // Zéro n'est ni une hausse ni une baisse. La condition était `>= 0`, donc
  // « +0 % » s'affichait en vert avec une flèche montante : sur la page
  // Finances, trois cartes à zéro annonçaient toutes une croissance. Trois
  // états, pas deux.
  const trend = delta == null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const up = trend === 'up';
  const numeric = typeof value === 'number';
  const [counted, ref] = useCountUp(numeric ? value : 0, { duration: 800 });
  return (
    <div className={`card kpi kpi--${tone}`} ref={ref}>
      <div className="kpi-top">
        <div className="kpi-label">{label}</div>
        <div className={`kpi-icon ${tone}`}>{icon}</div>
      </div>
      <div className="kpi-value">{numeric ? num(counted) : value}</div>
      <div className="kpi-foot">
        {trend ? (
          <span className={`kpi-delta ${trend}`}>
            {trend === 'up' ? <ArrowUpRight size={14} /> : trend === 'down' ? <ArrowDownRight size={14} /> : <Minus size={14} />}
            {up ? '+' : ''}{delta}% <span className="muted" style={{ fontWeight: 400 }}>{deltaText}</span>
          </span>
        ) : <span />}
        {spark.length > 1 && (
          <Sparkline
            values={spark}
            width={100}
            height={36}
            color={trend === 'down' ? '#e74c3c' : trend === 'up' ? '#2a8a4f' : '#9ca3af'}
            fill
          />
        )}
      </div>
    </div>
  );
}

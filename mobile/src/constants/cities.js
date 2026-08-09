// Villes camerounaises proposées à l'inscription.
//
// Pourquoi une liste longue : la saisie libre existe (la liste ne peut pas être
// exhaustive), mais chaque ville absente est une saisie manuelle de plus — donc
// une graphie de plus à réconcilier côté console admin, où le filtre « ville »
// lit ce qui est RÉELLEMENT en base. Les seize entrées d'origine laissaient
// dehors des villes de plus de 100 000 habitants (Nkongsamba, Kousséri, Loum,
// Bafang…) : leurs habitants n'avaient d'autre choix que de taper le nom.
//
// Critère de contenu, volontairement vérifiable plutôt que subjectif :
//   1. les 58 chefs-lieux de département,
//   2. Buea (chef-lieu de région du Sud-Ouest, mais pas de département — le
//      Fako a Limbe pour chef-lieu),
//   3. une poignée de villes importantes qui ne sont chefs-lieux de rien
//      (Tiko, Loum, Mbanga, Obala…).
// Tout le reste passe par la saisie libre, et c'est très bien ainsi.

import { searchNormalize } from '../utils/format';

// Sentinelle « autre ville » — stockée telle quelle en base (le backend accepte
// `ville` libre) mais AFFICHÉE traduite : les autres entrées sont des noms
// propres, invariants d'une langue à l'autre ; celui-ci est un MOT, et il
// s'affichait « Autre » dans une interface anglaise. Il reste en queue de liste.
export const OTHER_CITY = 'Autre';

// Tête de liste : couvre la grande majorité des inscriptions sans défiler.
// L'ordre est délibéré (poids démographique), pas alphabétique.
const MAJOR = [
  'Yaoundé', 'Douala', 'Bafoussam', 'Bamenda', 'Garoua', 'Maroua',
  'Ngaoundéré', 'Bertoua', 'Ebolowa', 'Buea', 'Kribi', 'Limbe',
  'Edéa', 'Kumba', 'Dschang', 'Foumban',
];

// Le reste, par ordre alphabétique — avec la recherche au-dessus, la longueur
// ne coûte rien.
const OTHERS = [
  'Abong-Mbang', 'Akonolinga', 'Ambam', 'Bafang', 'Bafia', 'Baham', 'Bali',
  'Bandjoun', 'Bangangté', 'Bangem', 'Banyo', 'Batouri', 'Éséka', 'Figuil',
  'Foumbot', 'Fundong', 'Guider', 'Kaélé', 'Kousséri', 'Kumbo', 'Loum',
  'Mamfe', 'Manjo', 'Mbalmayo', 'Mbanga', 'Mbengwi', 'Mbouda', 'Meiganga',
  'Melong', 'Menji', 'Mfou', 'Mokolo', 'Monatélé', 'Mora', 'Mundemba',
  'Muyuka', 'Nanga-Eboko', 'Ndop', 'Ngoumou', 'Nkambé', 'Nkongsamba', 'Ntui',
  'Obala', 'Poli', 'Sangmélima', 'Tcholliré', 'Tibati', 'Tignère', 'Tiko',
  'Wum', 'Yabassi', 'Yagoua', 'Yokadouma',
].sort((a, b) => a.localeCompare(b, 'fr'));

export const CITIES = [...MAJOR, ...OTHERS, OTHER_CITY];

// Comparaison plus tolérante que celle des pays : plusieurs chefs-lieux portent
// un trait d'union (Abong-Mbang, Nanga-Eboko) que personne ne tape. Sans ça,
// « abong mbang » ne trouvait rien et l'écran proposait de CRÉER cette graphie —
// exactement la saisie parasite que la liste est censée éviter.
const loose = (value) =>
  searchNormalize(value).replace(/[-'’.]/g, ' ').replace(/\s+/g, ' ').trim();

export function matchesCity(city, query) {
  return loose(city).includes(loose(query));
}

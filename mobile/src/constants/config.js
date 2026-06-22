// Configuration globale de l'app — valeurs dérivées de l'environnement & du CDC.

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

// Base socket.io (sans le suffixe /api/v1)
export const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ||
  API_URL.replace(/\/api\/v1\/?$/, '');

// Clés AsyncStorage
export const STORAGE_KEYS = {
  accessToken: 'crv.access_token',
  refreshToken: 'crv.refresh_token',
  user: 'crv.user',
  lastSyncAt: 'crv.last_sync_at',
  // URL de l'API utilisée lors du dernier sync — sert à invalider le cache de
  // questions si l'on change d'environnement (ex. local → staging).
  cacheApiUrl: 'crv.cache_api_url',
};

// Délai au-delà duquel un retour au premier plan déclenche un delta sync (CDC §2.8)
export const FOREGROUND_SYNC_THRESHOLD_MS = 30 * 60 * 1000; // 30 min

// Retry réseau (intercepteur 503 — Mobile Money / SMS indisponible)
export const RETRY = {
  maxRetries: 3,
  baseDelayMs: 1500,
};

// Thèmes de quiz (API §5)
export const THEMES = [
  { key: 'culture', label: 'Culture', emoji: '🎭' },
  { key: 'geographie', label: 'Géographie', emoji: '🗺️' },
  { key: 'histoire', label: 'Histoire', emoji: '📜' },
  { key: 'industrie', label: 'Industrie', emoji: '🏭' },
  { key: 'sport', label: 'Sport', emoji: '⚽' },
  { key: 'science', label: 'Science', emoji: '🔬' },
];

// Niveaux de difficulté (API §5)
export const LEVELS = [
  { key: 'beginner', label: 'Débutant', points: 50 },
  { key: 'intermediate', label: 'Intermédiaire', points: 75 },
  { key: 'expert', label: 'Expert', points: 100 },
];

// Modes de jeu chronométrés (timer GLOBAL, pas par question) — tous thèmes/niveaux
// mélangés. blitz : 60 s. marathon : 180 s + 20 questions + bonus thème serveur.
export const MODE_DURATION_S = { blitz: 60, marathon: 180 };
export const MODE_QUESTION_COUNT = { blitz: 20, marathon: 20 };
export const TIMED_MODES = ['blitz', 'marathon'];

// Paramètres de jeu
export const GAME = {
  questionsPerSession: 10,
  timePerQuestionS: 30,
  speedBonusThresholdMs: 5000, // ≤ 5 s → +50 %
  cheatThresholdMs: 1000, // < 1 s répété → triche
  streakX15: 3, // ×1,5 dès 3 bonnes réponses
  streakX2: 5, // ×2 dès 5
};

// Langues
export const LANGS = [
  { key: 'fr', label: 'Français' },
  { key: 'en', label: 'English' },
];

export const SEXES = [
  { key: 'H', label: 'Homme' },
  { key: 'F', label: 'Femme' },
  { key: 'N', label: 'Non précisé' },
];

export default {
  API_URL,
  SOCKET_URL,
  STORAGE_KEYS,
  FOREGROUND_SYNC_THRESHOLD_MS,
  RETRY,
  THEMES,
  LEVELS,
  MODE_DURATION_S,
  MODE_QUESTION_COUNT,
  TIMED_MODES,
  GAME,
  LANGS,
  SEXES,
};

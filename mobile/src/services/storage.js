// Wrapper léger autour d'AsyncStorage (données non sensibles) et de SecureStore
// (tokens auth, chiffrés). Les clés SecureStore n'acceptent que [A-Za-z0-9._-],
// ce que respectent `crv.access_token` / `crv.refresh_token`.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../constants/config';

export async function getItem(key) {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key, value) {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

export async function removeItem(key) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export async function getJSON(key) {
  const raw = await getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setJSON(key, value) {
  await setItem(key, JSON.stringify(value));
}

// Tokens (SecureStore, chiffré) -------------------------------------------
async function getSecure(key) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setSecure(key, value) {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    /* noop */
  }
}

async function removeSecure(key) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* noop */
  }
}

export const getAccessToken = () => getSecure(STORAGE_KEYS.accessToken);
export const getRefreshToken = () => getSecure(STORAGE_KEYS.refreshToken);

export async function setTokens({ access_token, refresh_token }) {
  if (access_token) await setSecure(STORAGE_KEYS.accessToken, access_token);
  if (refresh_token) await setSecure(STORAGE_KEYS.refreshToken, refresh_token);
}

export async function clearTokens() {
  await removeSecure(STORAGE_KEYS.accessToken);
  await removeSecure(STORAGE_KEYS.refreshToken);
}

// User (AsyncStorage — profil potentiellement > 2 Ko, hors limite SecureStore)
export const getStoredUser = () => getJSON(STORAGE_KEYS.user);
export const setStoredUser = (user) => setJSON(STORAGE_KEYS.user, user);
export const clearStoredUser = () => removeItem(STORAGE_KEYS.user);

// Dernier email connecté (non sensible → AsyncStorage) — pré-remplissage Login.
export const getLastEmail = () => getItem(STORAGE_KEYS.lastEmail);
export const setLastEmail = (email) => setItem(STORAGE_KEYS.lastEmail, email);

// Mot de passe enregistré (case à cocher du Login) — SecureStore OBLIGATOIRE.
// C'est le secret le plus sensible que l'app détient : contrairement au jeton
// de rafraîchissement, il survit à une révocation de toutes les sessions et
// ouvre aussi la console admin s'il y est réutilisé. AsyncStorage l'écrirait en
// clair dans une base SQLite lisible sur un appareil rooté.
//
// La PRÉSENCE de la clé porte à elle seule l'état de la case : pas de booléen
// séparé à garder synchronisé, donc pas de dérive possible entre « la case est
// cochée » et « un mot de passe est réellement stocké ».
export const getSavedPassword = () => getSecure(STORAGE_KEYS.savedPassword);
export const setSavedPassword = (password) =>
  setSecure(STORAGE_KEYS.savedPassword, password);
export const clearSavedPassword = () => removeSecure(STORAGE_KEYS.savedPassword);

// Remplace le mot de passe enregistré s'il en existe un, sans jamais en créer.
// Utilisé après un changement / une réinitialisation : le consentement donné
// sur l'écran de connexion suit le mot de passe, mais rien n'est écrit pour
// quelqu'un qui n'avait pas coché la case.
export async function updateSavedPasswordIfAny(password) {
  const existing = await getSavedPassword();
  if (existing) await setSavedPassword(password);
}

// Sync --------------------------------------------------------------------
export const getLastSyncAt = () => getItem(STORAGE_KEYS.lastSyncAt);
export const setLastSyncAt = (iso) => setItem(STORAGE_KEYS.lastSyncAt, iso);
export const clearLastSyncAt = () => removeItem(STORAGE_KEYS.lastSyncAt);

// URL de l'API du dernier sync (invalidation de cache au changement d'environnement).
export const getCacheApiUrl = () => getItem(STORAGE_KEYS.cacheApiUrl);
export const setCacheApiUrl = (url) => setItem(STORAGE_KEYS.cacheApiUrl, url);

// Dernier niveau vu sur l'écran Profil (détection « badge tout juste débloqué »).
export const getBadgesSeenLevel = () => getItem(STORAGE_KEYS.badgesSeenLevel);
export const setBadgesSeenLevel = (level) =>
  setItem(STORAGE_KEYS.badgesSeenLevel, String(level));

// Records atteints (parties, meilleure série, taux). Persistés parce que le
// taux et la série sont calculés sur la FENÊTRE d'historique chargée : sans
// mémoire, une vieille série de 12 sortant de la fenêtre reverrouillerait le
// badge. Un badge qui se retire est pire qu'un badge redondant — un exploit
// passé reste un fait.
export const getBadgesBest = () => getJSON(STORAGE_KEYS.badgesBest);
export const setBadgesBest = (best) => setJSON(STORAGE_KEYS.badgesBest, best);

export default {
  getItem,
  setItem,
  removeItem,
  getJSON,
  setJSON,
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  getLastEmail,
  setLastEmail,
  getSavedPassword,
  setSavedPassword,
  clearSavedPassword,
  updateSavedPasswordIfAny,
  getLastSyncAt,
  setLastSyncAt,
  clearLastSyncAt,
  getCacheApiUrl,
  setCacheApiUrl,
  getBadgesSeenLevel,
  setBadgesSeenLevel,
  getBadgesBest,
  setBadgesBest,
};

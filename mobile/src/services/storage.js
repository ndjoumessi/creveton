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

// Sync --------------------------------------------------------------------
export const getLastSyncAt = () => getItem(STORAGE_KEYS.lastSyncAt);
export const setLastSyncAt = (iso) => setItem(STORAGE_KEYS.lastSyncAt, iso);
export const clearLastSyncAt = () => removeItem(STORAGE_KEYS.lastSyncAt);

// URL de l'API du dernier sync (invalidation de cache au changement d'environnement).
export const getCacheApiUrl = () => getItem(STORAGE_KEYS.cacheApiUrl);
export const setCacheApiUrl = (url) => setItem(STORAGE_KEYS.cacheApiUrl, url);

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
  getLastSyncAt,
  setLastSyncAt,
  clearLastSyncAt,
  getCacheApiUrl,
  setCacheApiUrl,
};

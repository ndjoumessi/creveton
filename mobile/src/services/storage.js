// Wrapper léger autour d'AsyncStorage pour tokens / user / sync.

import AsyncStorage from '@react-native-async-storage/async-storage';
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

// Tokens ------------------------------------------------------------------
export const getAccessToken = () => getItem(STORAGE_KEYS.accessToken);
export const getRefreshToken = () => getItem(STORAGE_KEYS.refreshToken);

export async function setTokens({ access_token, refresh_token }) {
  if (access_token) await setItem(STORAGE_KEYS.accessToken, access_token);
  if (refresh_token) await setItem(STORAGE_KEYS.refreshToken, refresh_token);
}

export async function clearTokens() {
  await removeItem(STORAGE_KEYS.accessToken);
  await removeItem(STORAGE_KEYS.refreshToken);
}

// User --------------------------------------------------------------------
export const getStoredUser = () => getJSON(STORAGE_KEYS.user);
export const setStoredUser = (user) => setJSON(STORAGE_KEYS.user, user);
export const clearStoredUser = () => removeItem(STORAGE_KEYS.user);

// Sync --------------------------------------------------------------------
export const getLastSyncAt = () => getItem(STORAGE_KEYS.lastSyncAt);
export const setLastSyncAt = (iso) => setItem(STORAGE_KEYS.lastSyncAt, iso);

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
  getLastSyncAt,
  setLastSyncAt,
};

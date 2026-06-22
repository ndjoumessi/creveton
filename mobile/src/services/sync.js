// Delta sync service — CDC §2.8.
//
// Algorithme :
//   - si pas de last_sync_at  → snapshot complet GET /questions/all (paginé)
//   - sinon                   → GET /questions/delta?since={last_sync_at}
//   - UPSERT new[] + updated[] dans SQLite
//   - soft-delete deleted_ids[]
//   - stocker synced_at comme nouveau last_sync_at
//
// Déclencheurs : lancement app, retour premier plan (> 30 min), push force_sync.
// Non bloquant : tourne en arrière-plan, ne jette jamais vers l'UI.

import { AppState } from 'react-native';
import { questions as questionsApi } from './endpoints';
import {
  initDatabase,
  upsertQuestions,
  softDeleteQuestions,
  countQuestions,
  clearQuestions,
} from './database';
import {
  getLastSyncAt,
  setLastSyncAt,
  clearLastSyncAt,
  getCacheApiUrl,
  setCacheApiUrl,
} from './storage';
import { FOREGROUND_SYNC_THRESHOLD_MS, API_URL } from '../constants/config';
import { useQuestionsStore } from '../store/questionsStore';

let isSyncing = false;
let lastForegroundAt = Date.now();
let appStateSub = null;

// Snapshot complet au premier lancement (pagination par curseur).
async function fullSnapshot() {
  let cursor;
  let total = 0;
  let syncedAt = null;
  do {
    const resp = await questionsApi.all({ limit: 200, cursor });
    const batch = resp.data || [];
    await upsertQuestions(batch);
    total += batch.length;
    syncedAt = resp.synced_at || syncedAt;
    cursor = resp.page?.has_more ? resp.page?.next_cursor : null;
  } while (cursor);
  return { count: total, syncedAt };
}

// Sync incrémental.
async function deltaSync(since) {
  const resp = await questionsApi.delta(since);
  const newQ = resp.new || [];
  const updated = resp.updated || [];
  await upsertQuestions([...newQ, ...updated]);
  await softDeleteQuestions(resp.deleted_ids || []);
  return {
    syncedAt: resp.synced_at,
    changed: newQ.length + updated.length + (resp.deleted_ids?.length || 0),
  };
}

// Point d'entrée : exécute un sync si besoin. Jamais bloquant.
export async function runSync({ force = false } = {}) {
  if (isSyncing && !force) return;
  isSyncing = true;
  const store = useQuestionsStore.getState();
  store.setStatus('syncing');
  try {
    await initDatabase();

    // Invalidation de cache par URL d'API : si EXPO_PUBLIC_API_URL a changé depuis
    // le dernier sync (ex. local → staging), les question_ids en cache n'existent
    // pas sur le nouveau backend (« Question introuvable »). On purge SQLite + le
    // curseur de sync → le bloc ci-dessous repart sur un snapshot complet.
    const cachedUrl = await getCacheApiUrl();
    if (cachedUrl && cachedUrl !== API_URL) {
      await clearQuestions();
      await clearLastSyncAt();
      store.setLastSyncAt(null);
    }

    const since = await getLastSyncAt();
    let result;
    if (!since) {
      result = await fullSnapshot();
    } else {
      result = await deltaSync(since);
    }
    if (result.syncedAt) {
      await setLastSyncAt(result.syncedAt);
      store.setLastSyncAt(result.syncedAt);
    }
    const count = await countQuestions();
    store.setCount(count);
    store.setStatus('idle');
    store.setError(null);
    // Mémorise l'URL de l'API de ce sync réussi (référence pour l'invalidation).
    await setCacheApiUrl(API_URL);
    return result;
  } catch (e) {
    // Non bloquant : on log l'état mais on n'interrompt pas l'UI.
    store.setStatus('error');
    store.setError(e?.message || 'sync_failed');
    return null;
  } finally {
    isSyncing = false;
  }
}

// Retrait d'urgence déclenché par un push silencieux force_sync (§14).
export async function handleForceSync(questionIds = []) {
  try {
    await initDatabase();
    await softDeleteQuestions(questionIds);
    const count = await countQuestions();
    useQuestionsStore.getState().setCount(count);
    // On enchaîne avec un delta pour rester cohérent.
    await runSync({ force: true });
  } catch {
    /* noop */
  }
}

// Abonnement au cycle de vie : retour au premier plan après > 30 min → sync.
export function startSyncLifecycle() {
  if (appStateSub) return appStateSub;
  appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      const elapsed = Date.now() - lastForegroundAt;
      lastForegroundAt = Date.now();
      if (elapsed > FOREGROUND_SYNC_THRESHOLD_MS) {
        runSync();
      }
    } else if (state === 'background') {
      lastForegroundAt = Date.now();
    }
  });
  return appStateSub;
}

export function stopSyncLifecycle() {
  appStateSub?.remove?.();
  appStateSub = null;
}

export default { runSync, handleForceSync, startSyncLifecycle, stopSyncLifecycle };

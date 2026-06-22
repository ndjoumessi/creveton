'use strict';

const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const tournamentModel = require('../models/tournament.model');

/**
 * Logique des tournois côté admin (réf. spec §8/§12).
 *
 * Garde-fou conformité (CDC §7 / loi 2010/012) : tant que le flag
 * `tournaments.paid.enabled` est false, aucun tournoi PAYANT ne peut être créé
 * (mode gratuit forcé). Les payouts répartissent la cagnotte au top 3.
 */

const MIN_PLAYERS_TO_START = 2;
// Répartition de la cagnotte par rang (top 3). Somme = 1.
const PRIZE_SPLIT = [0.5, 0.3, 0.2];

/** POST /admin/tournaments — créer/programmer. */
async function create(input, createdBy) {
  if (input.entry_fee > 0 && !env.features.tournamentsPaidEnabled) {
    throw new ApiError('FEATURE_DISABLED', {
      message: 'Les tournois payants sont désactivés (mode gratuit forcé). Flag tournaments.paid.enabled = false.',
    });
  }
  const row = await tournamentModel.create({
    name: input.name,
    type: input.type,
    theme: input.theme,
    entry_fee: input.entry_fee ?? 0,
    max_players: input.max_players,
    prize_pool: input.prize_pool ?? 0,
    starts_at: input.starts_at,
    created_by: createdBy,
  });
  return tournamentModel.toView(row, 0);
}

/**
 * POST /tournaments/:id/join — inscription d'un joueur.
 *
 * Tournois GRATUITS (entry_fee = 0) : inscription immédiate, statut « confirmed »
 * (idempotent grâce à addParticipant / ON CONFLICT DO NOTHING). Tournois PAYANTS :
 * derrière le flag `tournaments.paid.enabled` (CDC §3.5/§3.6). Tant qu'il est false,
 * 403 FEATURE_DISABLED ; le paiement Mobile Money reste à brancher à l'activation.
 */
async function joinTournament(tournamentId, userId) {
  const t = await tournamentModel.findById(tournamentId);
  if (!t || t.deleted_at) throw new ApiError('TOURNAMENT_NOT_FOUND');

  if (Number(t.entry_fee) > 0) {
    if (!env.features.tournamentsPaidEnabled) {
      throw new ApiError('FEATURE_DISABLED', {
        message: 'Les tournois payants sont désactivés (mode gratuit forcé). Flag tournaments.paid.enabled = false.',
      });
    }
    // Flag activé : le paiement Mobile Money reste à implémenter (module transactions).
    throw new ApiError('FEATURE_DISABLED');
  }

  if (t.status !== 'open') {
    throw new ApiError('TOURNAMENT_NOT_OPEN', { message: `Statut « ${t.status} » : inscriptions fermées.` });
  }

  if (t.max_players != null) {
    const count = await tournamentModel.countParticipants(tournamentId);
    if (count >= t.max_players) throw new ApiError('TOURNAMENT_FULL');
  }

  await tournamentModel.addParticipant(tournamentId, userId);

  return {
    tournament_id: tournamentId,
    user_id: userId,
    status: 'confirmed',
    entry_fee: 0,
  };
}

/** GET /admin/tournaments — liste tous les tournois (vue admin) + synthèse. */
async function listAll() {
  const rows = await tournamentModel.findAll();
  const data = rows.map((r) => tournamentModel.toView(r, r.registered_players));
  const stats = {
    total: data.length,
    scheduled: data.filter((t) => t.status === 'scheduled').length,
    open: data.filter((t) => t.status === 'open').length,
    running: data.filter((t) => t.status === 'running').length,
    closed: data.filter((t) => ['closed', 'paid'].includes(t.status)).length,
    cancelled: data.filter((t) => t.status === 'cancelled').length,
    registered_players_total: data.reduce((s, t) => s + (t.registered_players || 0), 0),
  };
  return { data, stats };
}

/** GET /admin/tournaments/:id — détail + participants classés + statistiques. */
async function getDetail(id) {
  const t = await tournamentModel.findById(id);
  if (!t || t.deleted_at) throw new ApiError('TOURNAMENT_NOT_FOUND');
  const participants = await tournamentModel.participantsDetailed(id);
  const played = participants.filter((p) => p.score > 0).length;
  const scores = participants.map((p) => p.score);
  const stats = {
    registered: participants.length,
    played,
    completion_rate: participants.length ? Number((played / participants.length).toFixed(3)) : 0,
    avg_score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    top_score: scores.length ? Math.max(...scores) : 0,
  };
  return {
    tournament: tournamentModel.toView(t, participants.length),
    participants,
    stats,
  };
}

/** POST /admin/tournaments/:id/start — lancer (vérifie le minimum de joueurs). */
async function start(id) {
  const t = await tournamentModel.findById(id);
  if (!t) throw new ApiError('TOURNAMENT_NOT_FOUND');
  if (!['scheduled', 'open'].includes(t.status)) {
    throw new ApiError('TOURNAMENT_NOT_OPEN', { message: `Statut « ${t.status} » : démarrage impossible.` });
  }
  const players = await tournamentModel.countParticipants(id);
  if (players < MIN_PLAYERS_TO_START) {
    throw new ApiError('TOURNAMENT_NOT_OPEN', {
      message: `Minimum ${MIN_PLAYERS_TO_START} joueurs requis (actuellement ${players}).`,
    });
  }
  const row = await tournamentModel.setStatus(id, 'running');
  return tournamentModel.toView(row, players);
}

/** POST /admin/tournaments/:id/cancel — annuler (remboursements si payant). */
async function cancel(id) {
  const t = await tournamentModel.findById(id);
  if (!t) throw new ApiError('TOURNAMENT_NOT_FOUND');
  if (['paid', 'cancelled'].includes(t.status)) {
    throw new ApiError('TOURNAMENT_NOT_OPEN', { message: `Tournoi déjà « ${t.status} ».` });
  }
  // NB : si entry_fee > 0, les remboursements Mobile Money seraient déclenchés
  // ici (module transactions). En mode gratuit (flag off), rien à rembourser.
  const row = await tournamentModel.setStatus(id, 'cancelled', { endsAt: new Date().toISOString() });
  const refundsIssued = Number(t.entry_fee) > 0;
  return { tournament: tournamentModel.toView(row), refunds_issued: refundsIssued };
}

/**
 * POST /admin/tournaments/:id/payout — valider les résultats et déclencher les
 * paiements. Classe les participants par score, répartit prize_pool au top 3,
 * passe le tournoi en `paid`. Transactionnel.
 */
async function payout(id) {
  const t = await tournamentModel.findById(id);
  if (!t) throw new ApiError('TOURNAMENT_NOT_FOUND');
  if (!['running', 'closed'].includes(t.status)) {
    throw new ApiError('TOURNAMENT_NOT_OPEN', {
      message: `Statut « ${t.status} » : payout impossible (attendu running|closed).`,
    });
  }

  const client = await tournamentModel.getClient();
  const results = [];
  try {
    await client.query('BEGIN');
    const participants = await tournamentModel.rankedParticipants(id, client);
    const pool = Number(t.prize_pool) || 0;

    for (let i = 0; i < participants.length; i += 1) {
      const rank = i + 1;
      const share = PRIZE_SPLIT[i] || 0; // rangs > 3 → 0
      const amount = Math.round(pool * share);
      await tournamentModel.setResult(participants[i].id, rank, amount, client);
      results.push({ user_id: participants[i].user_id, rank, score: participants[i].score, payout: amount });
      // NB : le crédit wallet / transaction payout serait émis ici (module
      // transactions) pour chaque gagnant. En MVP gratuit, pool = 0.
    }

    const row = await client.query(
      `UPDATE tournaments SET status = 'paid', ends_at = now() WHERE id = $1 RETURNING *`,
      [id]
    );
    await client.query('COMMIT');
    return {
      tournament: tournamentModel.toView(row.rows[0], participants.length),
      results,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { create, joinTournament, listAll, getDetail, start, cancel, payout, MIN_PLAYERS_TO_START, PRIZE_SPLIT };

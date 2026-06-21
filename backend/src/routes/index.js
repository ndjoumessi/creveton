'use strict';

const express = require('express');

const authRoutes = require('./auth.routes');
const questionRoutes = require('./question.routes');
const sessionRoutes = require('./session.routes');
const leaderboardRoutes = require('./leaderboard.routes');
const tournamentRoutes = require('./tournament.routes');
const challengeRoutes = require('./challenge.routes');
const userRoutes = require('./user.routes');
const walletRoutes = require('./wallet.routes');
const adminRoutes = require('./admin');
const webhookRoutes = require('./webhook.routes');

const router = express.Router();

// Petit point d'entrée listant la version d'API.
router.get('/', (req, res) => {
  res.json({ name: 'Creveton API', version: 'v1', status: 'ok' });
});

router.use('/auth', authRoutes);
router.use('/questions', questionRoutes);
router.use('/sessions', sessionRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/tournaments', tournamentRoutes);
router.use('/challenges', challengeRoutes);
router.use('/users', userRoutes);
router.use('/wallet', walletRoutes);
router.use('/admin', adminRoutes);
router.use('/webhooks', webhookRoutes);

module.exports = router;

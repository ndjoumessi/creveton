'use strict';

const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const { requirePermission } = require('../../middlewares/admin.middleware');
const usersCtrl = require('../../controllers/admin/users.admin.controller');

const questionRoutes = require('./questions.routes');
const userRoutes = require('./users.routes');
const tournamentRoutes = require('./tournaments.routes');
const analyticsRoutes = require('./analytics.routes');
const dashboardRoutes = require('./dashboard.admin.routes');
const sessionRoutes = require('./sessions.admin.routes');
const leaderboardRoutes = require('./leaderboard.admin.routes');
const settingsRoutes = require('./settings.admin.routes');
const teamRoutes = require('./team.admin.routes');

const router = express.Router();

// Toutes les routes /admin/* exigent une authentification ; le rôle minimum est
// vérifié par opération via requirePermission (admin.middleware) sur chaque route.
router.use(authenticate);

router.use('/dashboard', dashboardRoutes);
router.use('/sessions', sessionRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/questions', questionRoutes);
router.use('/users', userRoutes);
router.use('/tournaments', tournamentRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/settings', settingsRoutes);
router.use('/team', teamRoutes);
// Parrainage : route à plat /admin/referrals/:code (spec §12).
router.get('/referrals/:code', requirePermission('users:read'), usersCtrl.referral);

module.exports = router;

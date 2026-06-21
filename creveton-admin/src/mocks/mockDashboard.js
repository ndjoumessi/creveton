// Données mock du tableau de bord (CDC §3.1) — valeurs réalistes en FCFA.

const spark = (vals) => vals.map((v, i) => ({ i, v }));

function buildSeries(days, base) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const wobble = (n) => Math.round(base[n] * (0.7 + ((i * 37) % 60) / 100));
    out.push({
      date: `J-${i}`,
      inscriptions: wobble(0),
      challenges: wobble(1),
      payouts: wobble(2),
      recharges: wobble(3),
    });
  }
  return out;
}

const mockDashboard = {
  kpis: {
    volume: {
      label: 'Volume complété (FCFA)',
      value: 4280000,
      fees: 214000,
      delta: 12.4,
      spark: spark([22, 25, 24, 28, 31, 29, 34, 38]),
    },
    balance: {
      label: 'Solde plateforme',
      value: 1865500,
      delta: 4.1,
      spark: spark([18, 19, 18, 20, 21, 22, 21, 23]),
    },
    users: {
      label: 'Utilisateurs',
      value: 12480,
      players: 12410,
      admins: 8,
      merchants: 62,
      delta: 8.7,
      spark: spark([90, 96, 101, 110, 118, 121, 123, 125]),
    },
    transactions: {
      label: 'Transactions',
      value: 3340,
      pending: 14,
      delta: -2.3,
      spark: spark([40, 42, 41, 39, 38, 40, 37, 33]),
    },
  },
  byType: [
    { type: 'inscriptions', label: 'Inscriptions tournois', value: 1820000 },
    { type: 'challenges', label: 'Challenges', value: 640000 },
    { type: 'payouts', label: 'Payouts', value: 980000 },
    { type: 'recharges', label: 'Recharges wallet', value: 840000 },
  ],
  donut: [
    { name: 'Inscriptions tournois', value: 1820000 },
    { name: 'Challenges', value: 640000 },
    { name: 'Payouts', value: 980000 },
    { name: 'Recharges wallet', value: 840000 },
  ],
  series: {
    '7j': buildSeries(7, [260000, 90000, 140000, 120000]),
    '30j': buildSeries(30, [240000, 85000, 130000, 115000]),
    '90j': buildSeries(90, [230000, 80000, 125000, 110000]),
  },
  system: {
    api: 'ok',
    latency_ms: 84,
    services: { mobile_money: 'ok', sms: 'ok', push: 'warn' },
  },
};

export function mockAnalytics(period = '30d') {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    series.push({
      date: `J-${i}`,
      dau: 1100 + ((i * 53) % 400),
      signups: 30 + ((i * 17) % 70),
    });
  }
  return {
    period,
    dau: 1240,
    mau: 3380,
    dau_mau_ratio: 0.367,
    new_signups: 1530,
    activation_rate: 0.72,
    retention: { d1: 0.41, d7: 0.21, d30: 0.11 },
    avg_session_min: 6.4,
    games_per_session: 3.2,
    funnel: [
      { step: 'Inscription', value: 100 },
      { step: 'OTP validé', value: 72 },
      { step: '1re partie', value: 58 },
      { step: 'J7 actif', value: 21 },
    ],
    series,
  };
}

export default mockDashboard;

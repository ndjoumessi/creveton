// 10 transactions mock (Mobile Money — CDC §3.5). Montants en FCFA.

const mockTransactions = [
  { id: 'tx-001', reference: 'CRV-TX-2026-0001', user_id: 'u-001', user_name: 'Junior Kamga', type: 'deposit', amount: 5000, provider: 'orange_money', status: 'success', created_at: '2026-06-20T10:03:00Z' },
  { id: 'tx-002', reference: 'CRV-TX-2026-0002', user_id: 'u-002', user_name: 'Awa Mballa', type: 'deposit', amount: 2000, provider: 'mtn_momo', status: 'success', created_at: '2026-06-20T11:20:00Z' },
  { id: 'tx-003', reference: 'CRV-TX-2026-0003', user_id: 'u-004', user_name: 'Sandra Eyenga', type: 'payout', amount: 15000, provider: 'orange_money', status: 'pending', created_at: '2026-06-21T08:45:00Z' },
  { id: 'tx-004', reference: 'CRV-TX-2026-0004', user_id: 'u-007', user_name: 'Nadège Tchoua', type: 'deposit', amount: 10000, provider: 'campay', status: 'success', created_at: '2026-06-19T16:12:00Z' },
  { id: 'tx-005', reference: 'CRV-TX-2026-0005', user_id: 'u-006', user_name: 'Cédric Fotso', type: 'deposit', amount: 1000, provider: 'mtn_momo', status: 'failed', created_at: '2026-06-19T09:30:00Z' },
  { id: 'tx-006', reference: 'CRV-TX-2026-0006', user_id: 'u-010', user_name: 'Estelle Ngo', type: 'entry_fee', amount: 500, provider: 'orange_money', status: 'success', created_at: '2026-06-18T14:00:00Z' },
  { id: 'tx-007', reference: 'CRV-TX-2026-0007', user_id: 'u-001', user_name: 'Junior Kamga', type: 'withdraw', amount: 8000, provider: 'orange_money', status: 'reversed', created_at: '2026-06-17T13:25:00Z' },
  { id: 'tx-008', reference: 'CRV-TX-2026-0008', user_id: 'u-002', user_name: 'Awa Mballa', type: 'deposit', amount: 3000, provider: 'mtn_momo', status: 'success', created_at: '2026-06-17T10:10:00Z' },
  { id: 'tx-009', reference: 'CRV-TX-2026-0009', user_id: 'u-004', user_name: 'Sandra Eyenga', type: 'payout', amount: 20000, provider: 'campay', status: 'pending', created_at: '2026-06-21T07:00:00Z' },
  { id: 'tx-010', reference: 'CRV-TX-2026-0010', user_id: 'u-010', user_name: 'Estelle Ngo', type: 'deposit', amount: 1500, provider: 'orange_money', status: 'success', created_at: '2026-06-16T18:40:00Z' },
];

export default mockTransactions;

import api, { withMock } from './api';
import mockTransactions from '../mocks/mockTransactions';

/**
 * NB : pas d'endpoint admin de liste des transactions dans le backend actuel
 * (les données réelles arrivent avec l'activation des tournois payants). On
 * tente /admin/transactions et on retombe sur les mocks.
 */
export function list(params = {}) {
  return withMock(
    () => api.get('/admin/transactions', { params }).then((r) => r.data),
    () => {
      let data = [...mockTransactions];
      if (params.type) data = data.filter((t) => t.type === params.type);
      if (params.status) data = data.filter((t) => t.status === params.status);
      if (params.provider) data = data.filter((t) => t.provider === params.provider);
      return { data, page: { limit: data.length, next_cursor: null, has_more: false } };
    },
  );
}

export default { list };

import toast from 'react-hot-toast';

/**
 * Fine surcouche autour de react-hot-toast pour homogénéiser les notifications.
 * Le composant <Toaster /> est monté une fois dans main.jsx.
 */
export const notify = {
  success: (msg) => toast.success(msg),
  error: (msg) => toast.error(msg),
  info: (msg) => toast(msg),
  loading: (msg) => toast.loading(msg),
  dismiss: (id) => toast.dismiss(id),
};

export default notify;

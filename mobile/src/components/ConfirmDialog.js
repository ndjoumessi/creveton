// ConfirmDialog — confirmation binaire sur Alert NATIF (pas de Modal custom) :
// centralise le motif « Annuler / Confirmer (destructif) » utilisé partout
// (déconnexion, refus/annulation de défi, inscription tournoi…).
//
// Deux usages :
//   1. Hook déclaratif (recommandé — colle aux call-sites réels) :
//        const confirm = useConfirm();
//        const ok = await confirm({ title, message, confirmLabel, destructive });
//        if (ok) { … }
//      → Promise<bool> ; libellés par défaut : common.confirm / common.cancel.
//      Tap hors de l'alerte (Android) ou retour = résolu à false.
//   2. Composant contrôlé <ConfirmDialog visible … /> pour un état booléen
//      existant : déclenche l'alerte quand `visible` passe à true, ne rend rien.
//
// `destructive: true` → style natif rouge du bouton de confirmation (iOS) ;
// l'action destructrice reste à droite, Annuler en style 'cancel'.

import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

/** Ouvre l'alerte native et résout true (confirmé) / false (annulé ou rejeté). */
function nativeConfirm({ title, message, confirmLabel, cancelLabel, destructive = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => settle(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => settle(true),
        },
      ],
      // Android : tap hors de l'alerte / retour matériel = annulation.
      { cancelable: true, onDismiss: () => settle(false) },
    );
  });
}

/** Hook déclaratif : `confirm(opts) → Promise<bool>` avec libellés i18n par défaut. */
export function useConfirm() {
  const { t } = useTranslation();
  return useCallback(
    ({ title, message, confirmLabel, cancelLabel, destructive = false }) =>
      nativeConfirm({
        title,
        message,
        confirmLabel: confirmLabel || t('common.confirm'),
        cancelLabel: cancelLabel || t('common.cancel'),
        destructive,
      }),
    [t],
  );
}

/** Variante contrôlée (visible/onConfirm/onCancel) — ne rend rien. */
export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}) {
  const confirm = useConfirm();
  // Refs → l'effet ne dépend que de `visible` (pas de ré-alerte sur re-render).
  const propsRef = useRef();
  propsRef.current = { title, message, confirmLabel, cancelLabel, destructive, onConfirm, onCancel };

  useEffect(() => {
    if (!visible) return;
    const p = propsRef.current;
    confirm(p).then((ok) => (ok ? p.onConfirm?.() : p.onCancel?.()));
  }, [visible, confirm]);

  return null;
}

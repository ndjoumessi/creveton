// Wrapper haptique sûr (no-op si le module/échec, jamais bloquant).
import * as Haptics from 'expo-haptics';

export function hapticLight() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    /* noop */
  }
}

export function hapticMedium() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    /* noop */
  }
}

export function hapticSuccess() {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    /* noop */
  }
}

export function hapticError() {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    /* noop */
  }
}

export default { hapticLight, hapticMedium, hapticSuccess, hapticError };

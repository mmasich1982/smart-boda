// rider-app/src/utils/confirmDialog.js
// Yes/No question that works on phones AND on the web build (Alert.alert with buttons does nothing on the web).
// Resolves true only when the person confirms. If the question cannot be shown the answer is "no", so nobody is logged out by accident.
import { Alert, Platform } from 'react-native';

export function confirmAction({ title, message, confirmText = 'Yes', cancelText = 'Cancel' }) {
  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(message ? `${title}\n\n${message}` : title)
      : false;
    return Promise.resolve(ok);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export default { confirmAction };

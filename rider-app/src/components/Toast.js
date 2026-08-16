// rider-app/src/components/Toast.js — a tiny app-wide toast/snackbar
import React, { createContext, useContext, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, kind = 'success') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <View style={[styles.toast, styles[toast.kind]]}>
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext) || { showToast: () => {} };

const styles = StyleSheet.create({
  toast: { position: 'absolute', bottom: 40, left: 20, right: 20, padding: 14, borderRadius: 12, elevation: 4 },
  success: { backgroundColor: '#2e7d32' },
  error: { backgroundColor: '#b91c1c' },
  warn: { backgroundColor: '#b45309' },
  toastText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
});

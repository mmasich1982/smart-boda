// rider-app/src/components/DecisionDialog.js
// An in-app pop-up used where a person must confirm or give a reason (Treasurer queue).
// Looks and behaves the same on phones and on the web (Alert.alert with buttons does nothing on the web).
import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import colors from '../theme/colors';

export default function DecisionDialog({ visible, title, message, children, confirmLabel = 'Yes', cancelLabel = 'Cancel',
  confirmDisabled = false, danger = false, busy = false, onConfirm, onCancel }) {
  const off = confirmDisabled || busy;
  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View testID="decision-dialog" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, maxHeight: '85%' }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 17, fontWeight: '800', marginBottom: 6 }}>{title}</Text>
            {!!message && <Text style={{ color: colors.inkSoft, marginBottom: 10 }}>{message}</Text>}
            {children}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity testID="decision-cancel" onPress={onCancel} style={{ flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.line, alignItems: 'center' }}>
              <Text style={{ fontWeight: '700' }}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="decision-confirm" disabled={off} onPress={onConfirm}
              style={{ flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: danger ? colors.signalRed : colors.bodaOrange, opacity: off ? 0.4 : 1 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>);
}

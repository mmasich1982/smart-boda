// rider-app/src/components/InstallPrompt.js
// INSTALL PROMPT: Handle push notifications and app installation prompts
// Manages device permissions, installation prompts, and notification setup

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useToast } from './Toast';

/**
 * InstallPrompt Component
 * Displays prompts for:
 * - Installing the app to home screen (PWA)
 * - Enabling push notifications
 * - Granting device permissions
 */
export default function InstallPrompt({ visible = false, onDismiss = () => {} }) {
  const { showToast } = useToast();
  const [notificationPermission, setNotificationPermission] = useState(null);
  const [showPrompt, setShowPrompt] = useState(visible);

  useEffect(() => {
    setShowPrompt(visible);
  }, [visible]);

  /**
   * Request notification permissions
   */
  const requestNotificationPermission = async () => {
    try {
      if (!Device.isDevice) {
        showToast('Notifications require a physical device', 'info');
        return;
      }

      const { status } = await Notifications.getPermissionsAsync();
      
      if (status === 'granted') {
        setNotificationPermission('granted');
        showToast('Notifications already enabled', 'success');
        return;
      }

      const { status: newStatus } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });

      if (newStatus === 'granted') {
        setNotificationPermission('granted');
        
        // Set up notification handler
        setupNotificationHandler();
        
        showToast('Notifications enabled successfully!', 'success');
        
        // Store preference
        await storeNotificationPreference(true);
      } else {
        showToast('Notification permission denied', 'warning');
        setNotificationPermission('denied');
      }
    } catch (err) {
      console.error('Error requesting notifications:', err);
      showToast('Failed to request notifications', 'error');
    }
  };

  /**
   * Setup notification handler
   */
  const setupNotificationHandler = () => {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

      // Listen for notifications
      const subscription = Notifications.addNotificationResponseListener((response) => {
        handleNotificationResponse(response);
      });

      return subscription;
    } catch (err) {
      console.error('Error setting up notification handler:', err);
    }
  };

  /**
   * Handle notification response
   */
  const handleNotificationResponse = (response) => {
    const { notification } = response;
    const data = notification?.request?.content?.data;

    console.log('Notification received:', data);

    // Route to appropriate screen based on notification data
    if (data?.type === 'trip_reminder') {
      // Navigate to trips
    } else if (data?.type === 'payment_due') {
      // Navigate to lipa later
    }
  };

  /**
   * Request calendar permissions
   */
  const requestCalendarPermission = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      
      if (status !== 'granted') {
        showToast('Calendar permission required', 'info');
      }
    } catch (err) {
      console.error('Error requesting calendar permission:', err);
    }
  };

  /**
   * Store notification preference in local storage
   */
  const storeNotificationPreference = async (enabled) => {
    try {
      // Store in AsyncStorage or similar
      // await AsyncStorage.setItem('notifications_enabled', JSON.stringify(enabled));
    } catch (err) {
      console.error('Error storing notification preference:', err);
    }
  };

  const handleEnableNotifications = async () => {
    await requestNotificationPermission();
    handleDismiss();
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    onDismiss();
  };

  return (
    <Modal
      visible={showPrompt}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.promptCard}>
          {/* Header */}
          <View style={styles.promptHeader}>
            <Text style={styles.promptIcon}>🔔</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <Text style={styles.promptTitle}>Enable Notifications?</Text>
          <Text style={styles.promptText}>
            Get real-time updates about trip reminders, payment due dates, and service alerts to keep your Smart Boda running smoothly.
          </Text>

          {/* Benefits */}
          <View style={styles.benefitsSection}>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Trip reminders & alerts</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Payment due notifications</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Service schedule alerts</Text>
            </View>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>✓</Text>
              <Text style={styles.benefitText}>Revenue updates</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.promptActions}>
            <TouchableOpacity 
              style={styles.promptBtnSecondary}
              onPress={handleDismiss}
            >
              <Text style={styles.promptBtnSecondaryText}>Not Now</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.promptBtnPrimary}
              onPress={handleEnableNotifications}
            >
              <Text style={styles.promptBtnPrimaryText}>Enable Notifications</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <Text style={styles.promptFooter}>
            You can change notification preferences in Settings anytime
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  promptCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    minHeight: 400,
  },

  promptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  promptIcon: {
    fontSize: 32,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#f2f0e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    color: '#5b606c',
    fontWeight: '700',
  },

  promptTitle: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 10,
  },
  promptText: {
    fontSize: 13,
    color: '#5b606c',
    lineHeight: 20,
    marginBottom: 16,
  },

  benefitsSection: {
    backgroundColor: '#f6f4ef',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 20,
    gap: 8,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  benefitIcon: {
    fontSize: 14,
    color: '#1e9e6f',
    fontWeight: '700',
  },
  benefitText: {
    fontSize: 12,
    color: '#5b606c',
  },

  promptActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  promptBtnSecondary: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  promptBtnSecondaryText: {
    color: '#1a1c20',
    fontSize: 13,
    fontWeight: '700',
  },

  promptBtnPrimary: {
    flex: 1,
    backgroundColor: '#ff7a1a',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  promptBtnPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  promptFooter: {
    fontSize: 10.5,
    color: '#a9adb6',
    textAlign: 'center',
  },
});

export { setupNotificationHandler };
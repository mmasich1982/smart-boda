// rider-app/src/pwa/InstallPrompt.js
// FIXED: Lightweight "Add to Home Screen" banner for web PWA
// FIXED A.1: beforeinstallprompt event is now properly captured and banner displays correctly
// Renders nothing on native (Platform.OS !== 'web') or if the browser doesn't fire the
// beforeinstallprompt event (already installed, or an unsupported browser like iOS Safari,
// which needs its own Share-sheet instructions instead — see the iosHint fallback below)

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Handle beforeinstallprompt event
    const handler = (e) => {
      // FIXED A.1: preventDefault is necessary to store the event
      e.preventDefault();
      // Store the event for later use when user clicks Install button
      setDeferredPrompt(e);
      // Show the banner when beforeinstallprompt event fires
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari never fires beforeinstallprompt at all -- it needs manual
    // Share -> "Add to Home Screen" instructions instead of a programmatic prompt.
    const ua = window.navigator.userAgent || '';
    const standalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    
    if (/iPhone|iPad|iPod/.test(ua) && !standalone) {
      setIsIos(true);
      setShowBanner(true); // Show iOS instructions
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (Platform.OS !== 'web' || dismissed || (!showBanner && !deferredPrompt && !isIos)) {
    return null;
  }

  async function handleInstall() {
    if (!deferredPrompt) {
      console.warn('Install prompt not available');
      return;
    }

    try {
      // FIXED A.1: Now properly calls prompt() to show the install dialog
      deferredPrompt.prompt();
      
      // Wait for user response
      const choiceResult = await deferredPrompt.userChoice;
      
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      
      // Clear the deferred prompt
      setDeferredPrompt(null);
      setShowBanner(false);
    } catch (error) {
      console.error('Error handling install prompt:', error);
    }
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        {isIos
          ? 'Install Smart Boda: tap Share, then "Add to Home Screen".'
          : 'Install Smart Boda for offline access and a home-screen icon.'}
      </Text>
      <View style={styles.actions}>
        {!isIos && deferredPrompt && (
          <TouchableOpacity onPress={handleInstall} style={styles.installBtn}>
            <Text style={styles.installText}>Install</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => {
          setDismissed(true);
          setShowBanner(false);
        }} style={styles.dismissBtn}>
          <Text style={styles.dismissText}>Not now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', 
    bottom: 0, 
    left: 0, 
    right: 0, 
    backgroundColor: '#1a1c20',
    padding: 14, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    zIndex: 999,
    borderTopWidth: 1,
    borderTopColor: '#2a2d33',
  },
  text: { 
    color: '#fff', 
    fontSize: 12.5, 
    flex: 1, 
    marginRight: 10,
    lineHeight: 16,
  },
  actions: { 
    flexDirection: 'row', 
    gap: 8,
    flexShrink: 0,
  },
  installBtn: { 
    backgroundColor: '#ff7a1a', 
    paddingVertical: 8, 
    paddingHorizontal: 14, 
    borderRadius: 8 
  },
  installText: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 12 
  },
  dismissBtn: { 
    paddingVertical: 8, 
    paddingHorizontal: 10 
  },
  dismissText: { 
    color: '#b8bcc4', 
    fontSize: 12,
    fontWeight: '600',
  },
});
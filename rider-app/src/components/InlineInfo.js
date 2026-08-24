// rider-app/src/components/InlineInfo.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * InlineInfo - A component for displaying inline information/alert messages
 * Supports multiple types: 'info', 'warning', 'success', 'error'
 * 
 * @param {string} icon - Optional emoji or icon to display
 * @param {string} title - Bold title text
 * @param {string} message - Message text
 * @param {string} type - Type of message ('info', 'warning', 'success', 'error')
 */
export default function InlineInfo({ 
  icon = 'ℹ️', 
  title, 
  message, 
  type = 'info' 
}) {
  const getColors = () => {
    switch (type) {
      case 'warning':
        return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', icon: '⚠️' };
      case 'error':
        return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', icon: '❌' };
      case 'success':
        return { bg: '#dcfce7', border: '#86efac', text: '#166534', icon: '✅' };
      case 'info':
      default:
        return { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af', icon: 'ℹ️' };
    }
  };

  const colors = getColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={styles.content}>
        {icon && <Text style={styles.icon}>{icon}</Text>}
        <View style={styles.textContainer}>
          {title && (
            <Text style={[styles.title, { color: colors.text }]}>
              {title}
            </Text>
          )}
          {message && (
            <Text style={[styles.message, { color: colors.text }]}>
              {message}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginVertical: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  icon: {
    fontSize: 18,
    marginRight: 12,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  message: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
  },
});
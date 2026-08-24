// rider-app/src/screens/subscription/PrepayScreen.js
// ============================================================================
// ✅ MIGRATION: LocalStore → IndexedDBAdapter
// ✅ PREPAYMENT: 3-60 days flexible payment
// ============================================================================

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useRider } from '../../rider/RiderContext';

const PrepayScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { state } = useRider();

  const { currentExpiryAt, dailyPrice } = route.params || {
    currentExpiryAt: new Date().toISOString(),
    dailyPrice: 34.5
  };

  const [days, setDays] = useState(7);
  const [confirmed, setConfirmed] = useState(false);

  const isMountedRef = useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ========================================================================
  // CALCULATIONS
  // ========================================================================

  const adjustDays = (delta) => {
    setDays((d) => Math.max(3, Math.min(60, d + delta)));
  };

  const total = days * dailyPrice;
  const currentExpiry = new Date(currentExpiryAt);
  const baseDate = new Date(Math.max(currentExpiry.getTime(), Date.now()));
  const newExpiry = new Date(
    baseDate.getTime() + days * 24 * 60 * 60 * 1000
  );

  // ========================================================================
  // HANDLE CONTINUE
  // ========================================================================

  const handleContinue = () => {
    if (!confirmed || !isMountedRef.current) {
      return;
    }

    navigation.navigate('ConfirmPrepayScreen', {
      days,
      total,
      newExpiryAt: newExpiry.toISOString(),
      dailyPrice
    });
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backLink}
      >
        <Text style={styles.backLinkText}>← {t('common.back')}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>
        {t('subscription.pay_ahead')}
      </Text>

      {/* DAY STEPPER */}
      <View style={styles.stepperSection}>
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => adjustDays(-1)}
          >
            <Text style={styles.stepperBtnText}>−</Text>
          </TouchableOpacity>

          <Text style={styles.stepperVal}>{days}</Text>

          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => adjustDays(1)}
          >
            <Text style={styles.stepperBtnText}>＋</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.stepperHint}>
          {t('subscription.days_to_prepay')} (3–60)
        </Text>
      </View>

      {/* BREAKDOWN */}
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.k}>
            {t('subscription.daily_rate')}
          </Text>
          <Text style={styles.v}>
            KES {dailyPrice.toFixed(2)}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.k}>
            {t('subscription.days')}
          </Text>
          <Text style={styles.v}>{days}</Text>
        </View>

        <View style={[styles.row, styles.rowHighlight]}>
          <Text style={styles.kBold}>
            {t('subscription.total_to_pay')}
          </Text>
          <Text style={styles.vBold}>
            KES {total.toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            })}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.k}>
            {t('subscription.new_expiry')}
          </Text>
          <Text style={styles.v}>
            {newExpiry.toLocaleDateString('en-KE')}
          </Text>
        </View>
      </View>

      {/* CONFIRMATION CHECKBOX */}
      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setConfirmed(!confirmed)}
      >
        <Text style={styles.checkbox}>
          {confirmed ? '☑' : '☐'}
        </Text>
        <Text style={styles.checkboxLabel}>
          {t('subscription.confirm_amount_and_date')}
        </Text>
      </TouchableOpacity>

      {/* CONTINUE BUTTON */}
      <TouchableOpacity
        style={[
          styles.continueBtn,
          !confirmed && styles.continueBtnDisabled
        ]}
        onPress={handleContinue}
        disabled={!confirmed}
      >
        <Text style={styles.continueBtnText}>
          {t('subscription.continue_to_payment')} →
        </Text>
      </TouchableOpacity>

      {/* INFO BANNER */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          {t('subscription.prepay_extends_subscription')}
        </Text>
      </View>
    </ScrollView>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f6f4ef'
  },

  backLink: {
    marginBottom: 16
  },
  backLinkText: {
    fontSize: 14,
    color: '#ff7a1a',
    fontWeight: '600'
  },

  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 20
  },

  stepperSection: {
    marginBottom: 20
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 8
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e7e4db'
  },
  stepperBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20'
  },
  stepperVal: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1c20',
    minWidth: 50,
    textAlign: 'center'
  },
  stepperHint: {
    fontSize: 11,
    color: '#5b606c',
    textAlign: 'center',
    fontWeight: '500'
  },

  card: {
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    backgroundColor: '#fff'
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10
  },
  rowHighlight: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db',
    backgroundColor: '#fff8f0',
    paddingHorizontal: 10,
    borderRadius: 6
  },
  k: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '500'
  },
  kBold: {
    fontSize: 13,
    color: '#ff7a1a',
    fontWeight: '700'
  },
  v: {
    fontSize: 12,
    color: '#1a1c20',
    fontWeight: '600'
  },
  vBold: {
    fontSize: 16,
    color: '#ff7a1a',
    fontWeight: '700'
  },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4
  },
  checkbox: {
    fontSize: 20,
    color: '#ff7a1a',
    marginRight: 10,
    fontWeight: 'bold'
  },
  checkboxLabel: {
    fontSize: 13,
    color: '#1a1c20',
    flex: 1,
    fontWeight: '500'
  },

  continueBtn: {
    backgroundColor: '#ff7a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4
  },
  continueBtnDisabled: {
    backgroundColor: '#e9dccc',
    opacity: 0.6,
    shadowOpacity: 0
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  },

  infoBanner: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    flexDirection: 'row',
    gap: 10
  },
  infoIcon: {
    fontSize: 16
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1a1c20',
    lineHeight: 16
  }
});

export default PrepayScreen;
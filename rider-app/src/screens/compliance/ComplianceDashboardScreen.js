// rider-app/src/screens/compliance/ComplianceDashboardScreen.js
// ✅ FIXED: Proper JSX structure, no unexpected text nodes

import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import { useToast } from '../../components/Toast';

const BADGE_COLORS = {
  expired: '#e0453f',
  due: '#e0453f',
  'expiring-1mo': '#c98a12',
  'expiring-2mo': '#e8a844',
  valid: '#1e9e6f',
};

const STATUS_LABELS = {
  expired: '🔴 Expired',
  due: '🔴 Due today',
  'expiring-1mo': '🟡 Expiring within 1 month',
  'expiring-2mo': '🟠 Expiring within 2 months',
  valid: '✅ Valid',
};

function docStatus(expiryDate) {
  if (!expiryDate) return 'valid';
  const now = Date.now();
  const daysLeft = (expiryDate - now) / 86400000;
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 1) return 'due';
  if (daysLeft <= 30) return 'expiring-1mo';
  if (daysLeft <= 60) return 'expiring-2mo';
  return 'valid';
}

export default function ComplianceDashboardScreen({ navigation }) {
  const { state } = useRider();
  const { showToast } = useToast();

  const [documents, setDocuments] = useState([]);
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Load rider ID from local storage
  useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        console.log('[ComplianceDashboardScreen] Loaded riderId:', id);
        setLocalRiderId(id);
        if (!id) {
          setError('Rider information not found.');
        }
      } catch (err) {
        console.error('[ComplianceDashboardScreen] Error loading riderId:', err);
        setError('Error loading rider information.');
      }
    }
    loadRiderId();
  }, []);

  const fetchDocuments = useCallback(async () => {
    const effectiveRiderId = localRiderId || state?.riderId;
    
    if (!effectiveRiderId) {
      console.error('[ComplianceDashboardScreen] No riderId');
      setError('Rider information not found.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const response = await api.get('/compliance/documents', {
        params: { rider_id: effectiveRiderId },
      });
      setDocuments(response.data?.documents || []);
      setError('');
    } catch (err) {
      console.error('[ComplianceDashboardScreen] Fetch error:', err);
      const errorMsg = err.response?.data?.detail || 'Failed to load documents';
      setError(errorMsg);
      if (refreshing) {
        showToast(errorMsg, 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [localRiderId, state?.riderId, refreshing, showToast]);

  useEffect(() => {
    if (localRiderId || state?.riderId) {
      fetchDocuments();
    }
  }, [localRiderId, state?.riderId, fetchDocuments]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDocuments();
  }, [fetchDocuments]);

  const activeDocs = documents.filter((d) => !d.archived);
  const docStatuses = activeDocs.map((d) => ({
    doc: d,
    status: docStatus(d.expiry_date),
  }));
  const actionNeeded = docStatuses.filter((s) => s.status !== 'valid');
  const fullyCompliant = activeDocs.length > 0 && actionNeeded.length === 0;

  // Loading state
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Home</Text>
        </TouchableOpacity>

        <Text style={styles.screenTitle}>License and Insurance Expiry Reminders</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      ) : null}

      {activeDocs.length > 0 ? (
        <View
          style={[
            styles.heroCard,
            fullyCompliant ? styles.heroCardOk : styles.heroCardAction,
          ]}
        >
          <Text
            style={[
              styles.heroStatus,
              fullyCompliant ? styles.heroStatusOk : styles.heroStatusAction,
            ]}
          >
            {fullyCompliant ? '✅ Fully Up To Date' : '⚠️ Action Needed'}
          </Text>
        </View>
      ) : null}

      {docStatuses.length > 0 ? (
        <View style={styles.documentsList}>
          {docStatuses.map(({ doc, status }) => (
            <View key={doc.id} style={styles.docRow}>
              <View style={styles.docInfo}>
                <Text style={styles.docThumb}>📄</Text>
                <View style={styles.docTextSection}>
                  <Text style={styles.docType}>{doc.document_type}</Text>
                  <Text style={styles.docExpiry}>
                    {doc.expiry_date
                      ? `Expires ${new Date(doc.expiry_date).toLocaleDateString()}`
                      : 'No expiry'}
                  </Text>
                </View>
              </View>

              <View style={styles.docActions}>
                <View style={[styles.badge, { borderColor: BADGE_COLORS[status] }]}>
                  <Text style={[styles.badgeText, { color: BADGE_COLORS[status] }]}>
                    {STATUS_LABELS[status]}
                  </Text>
                </View>
                {status !== 'valid' ? (
                  <TouchableOpacity
                    style={styles.renewBtn}
                    onPress={() =>
                      navigation.navigate('RenewDocument', {
                        documentType: doc.document_type,
                      })
                    }
                  >
                    <Text style={styles.renewBtnText}>Renew</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => navigation.navigate('AddDocument')}
      >
        <Text style={styles.addBtnText}>+ Add Your License Or Insurance →</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>An expired document never restricts any app feature.</Text>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f6f4ef',
  },
  container: {
    flex: 1,
    padding: 18,
    backgroundColor: '#f6f4ef',
  },
  header: {
    marginBottom: 16,
  },
  backLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ff7a1a',
    marginBottom: 8,
  },
  screenTitle: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
  },

  errorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 11.5,
    color: '#a5312c',
    fontWeight: '600',
  },

  heroCard: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  heroCardOk: {
    backgroundColor: '#e6f5ef',
    borderColor: '#c6e9df',
  },
  heroCardAction: {
    backgroundColor: '#fdf3df',
    borderColor: '#ffe3c2',
  },
  heroStatus: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 20,
    fontWeight: '700',
  },
  heroStatusOk: {
    color: '#1e9e6f',
  },
  heroStatusAction: {
    color: '#c98a12',
  },

  documentsList: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  docRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  docInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  docThumb: {
    fontSize: 20,
    marginRight: 10,
  },
  docTextSection: {
    flex: 1,
  },
  docType: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 2,
  },
  docExpiry: {
    fontSize: 11,
    color: '#5b606c',
  },
  docActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  renewBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  renewBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  addBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  footer: {
    fontSize: 11,
    color: '#5b606c',
    textAlign: 'center',
    marginTop: 10,
  },
});
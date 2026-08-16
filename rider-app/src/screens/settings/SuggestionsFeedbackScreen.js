// rider-app/src/screens/settings/SuggestionsFeedbackScreen.js
import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import PaginationControls from '../../components/PaginationControls';
import colors from '../../theme/colors';
import api from '../../api/client';
import { useToast } from '../../components/Toast';

export default function SuggestionsFeedbackScreen({ riderId, categories, navigation }) {
  const [category, setCategory] = useState(null);  // BR-SB23-002: optional
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState({ items: [], page: 1, total_pages: 1, total: 0 });
  const { showToast } = useToast();

  function loadHistory() {
    api.get('/suggestions', { params: { rider_id: riderId, page } }).then(res => setHistory(res.data));
  }
  useEffect(loadHistory, [page]);

  async function handleSend() {
    if (!message.trim()) { showToast('Please enter your feedback message.', 'warn'); return; }  // EXC-SB23-001
    await api.post('/suggestions', null, { params: { rider_id: riderId, category_code: category, message } });
    setMessage(''); setCategory(null); setPage(1);
    showToast('Thank you! Your feedback has been sent to the Smart Boda Admin.', 'success');  // NTF-SB23-001
    loadHistory();  // BR-SB23-005: new entry appears at the top of Past Feedback immediately, no refresh needed
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />
      <Text style={styles.title}>Suggestions & Feedback</Text>
      <Text style={styles.sub}>We read every message — tell us what's on your mind.</Text>

      <Text style={styles.label}>What kind of feedback is this? (optional)</Text>
      <View style={styles.tileGrid}>
        {categories.map((c) => (
          <TouchableOpacity key={c.code} onPress={() => setCategory(c.code)}
            style={[styles.tile, category === c.code && styles.tileSelected]}>
            <Text style={styles.tileEmoji}>{c.emoji}</Text>
            <Text style={styles.tileLabel}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Your Message</Text>
      {/* BR-SB23-003 */}
      <TextInput style={styles.textarea} multiline numberOfLines={4} maxLength={500}
        placeholder="e.g. I wish I could see my weekly earnings on the home screen..."
        value={message} onChangeText={setMessage} />
      <PrimaryButton label="Send Feedback →" onPress={handleSend} disabled={!message.trim()} />

      {history.items.length ? (
        <>
          <Text style={styles.historyTitle}>Your Past Feedback</Text>  {/* BR-SB23-004 */}
          {history.items.map((s) => {
            const cat = categories.find(c => c.code === s.category_code);
            return (
              <View key={s.id} style={styles.historyCard}>
                <View style={styles.historyHead}>
                  <Text style={styles.historyCat}>{cat ? `${cat.emoji} ${cat.label}` : '💬 General'}</Text>
                  <Text style={styles.historyDate}>{new Date(s.submitted_at).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.historyMsg}>{s.message}</Text>
              </View>
            );
          })}
          <PaginationControls page={history.page} totalPages={history.total_pages} total={history.total}
            onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
        </>
      ) : (
        <View style={styles.infoBanner}><Text style={styles.infoBannerText}>ℹ️ No feedback sent yet — this is just for you, so feel free to share anything.</Text></View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  sub: { fontSize: 13, color: colors.inkSoft, marginBottom: 18 },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkSoft, marginBottom: 8 },
  tileGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tile: { flex: 1, borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, padding: 10, alignItems: 'center' },
  tileSelected: { borderColor: colors.bodaOrange, backgroundColor: '#fff6ee' },
  tileEmoji: { fontSize: 18, marginBottom: 2 },
  tileLabel: { fontSize: 11, fontWeight: '600', color: colors.ink },
  textarea: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, padding: 12, fontSize: 13, textAlignVertical: 'top', minHeight: 90, marginBottom: 16 },
  historyTitle: { fontWeight: '700', fontSize: 13, color: colors.ink, marginTop: 22, marginBottom: 8 },
  historyCard: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, padding: 12, marginBottom: 10 },
  historyHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  historyCat: { fontSize: 12.5, fontWeight: '700', color: colors.ink },
  historyDate: { fontSize: 11, color: colors.inkSoft },
  historyMsg: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 18 },
  infoBanner: { backgroundColor: colors.cream, borderRadius: 14, padding: 14, marginTop: 18 },
  infoBannerText: { fontSize: 12.5, color: colors.inkSoft },
});

// rider-app/src/screens/settings/LegalDocumentScreen.js — shared scrollable renderer
// (matches cleaned.html's legalDocHeader/legalDocToc/legalDocSections/legalDocFooter exactly)
import React, { useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import RenderHtml from 'react-native-render-html';
import { LEGAL_DOC_VERSION, LEGAL_EFFECTIVE_DATE } from '../../constants/legal';

export default function LegalDocumentScreen({ navigation, icon, title, subtitle, sections, otherDocLabel, otherDocRoute }) {
  const scrollRef = useRef(null);
  const sectionYRef = useRef({});

  function jumpTo(id) {
    const y = sectionYRef.current[id];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.backLink} onPress={() => navigation.goBack()}>← Back</Text>
        <Text style={styles.heroTitle}>{icon} {title}</Text>
        <Text style={styles.heroSub}>{subtitle}</Text>
        <View style={styles.metaRow}>
          <View style={styles.chip}><Text style={styles.chipText}>Version {LEGAL_DOC_VERSION}</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>Effective {LEGAL_EFFECTIVE_DATE}</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>🇰🇪 Kenya</Text></View>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.toc}>
          <Text style={styles.tocTitle}>On this page</Text>
          {sections.map((s) => (
            <TouchableOpacity key={s.id} onPress={() => jumpTo(s.id)}>
              <Text style={styles.tocItem}>{s.num}. {s.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {sections.map((s) => (
          <View key={s.id} style={styles.section} onLayout={(e) => { sectionYRef.current[s.id] = e.nativeEvent.layout.y; }}>
            <Text style={styles.sectionTitle}><Text style={styles.sectionNum}>{s.num}.</Text> {s.title}</Text>
            <RenderHtml source={{ html: s.html }} contentWidth={320} />
          </View>
        ))}

        <View style={styles.divider} />
        <Text style={styles.footerNote}>
          Also read our{' '}
          <Text style={styles.crosslink} onPress={() => navigation.replace(otherDocRoute)}>{otherDocLabel}</Text>.{'\n'}
          Questions about this document? Call or WhatsApp us:{'\n'}📞 +254 757 334481 · 📞 +254 101 605262
        </Text>
        <TouchableOpacity onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}>
          <Text style={styles.backToTop}>↑ Back to top</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef' },
  // use LinearGradient(['#1a1c20','#2a2118','#4a2e0a']) in production, flat color here for brevity
  hero: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    backgroundColor: '#1a1c20' },
  backLink: { color: 'rgba(255,255,255,.75)', fontSize: 12.5, fontWeight: '700', marginBottom: 10 },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  heroSub: { color: 'rgba(255,255,255,.78)', fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { backgroundColor: 'rgba(255,255,255,.14)', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  chipText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  body: { flex: 1 },
  bodyContent: { padding: 20 },
  toc: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 14, padding: 14, marginBottom: 20 },
  tocTitle: { fontWeight: '700', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: '#5b606c', marginBottom: 8 },
  tocItem: { fontSize: 12.5, fontWeight: '600', color: '#1a1c20', marginBottom: 7, lineHeight: 17 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 9, color: '#1a1c20' },
  sectionNum: { color: '#e5650a', fontFamily: 'JetBrainsMono-Regular' },
  divider: { height: 1, backgroundColor: '#e7e4db', marginVertical: 22 },
  footerNote: { fontSize: 11.3, color: '#5b606c', textAlign: 'center', lineHeight: 19 },
  crosslink: { color: '#e5650a', fontWeight: '700' },
  backToTop: { fontSize: 11.3, color: '#e5650a', fontWeight: '700', textAlign: 'center', padding: 8 },
});

// rider-app/src/screens/business/AgeingReport.js
// SMART BIZNA Payment Ageing Report, laid out exactly like the Smart Boda Ageing Report (screens/lipaLater/LipaLaterAgeingScreen.js): the critical-accounts
// banner, the Total Outstanding / Total people summary, four category tabs with counts, search by name or mobile, the category banner, numbered
// records (10 a page) and Prev / Next paging. One component for the Customers report and the Suppliers report.
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { AGEING_TABS } from '../../utils/ageingGroups';
import { C } from './BizUI';

const PER_PAGE = 10;
const money = (n) => `KSh ${(Number(n) || 0).toLocaleString()}`;

export default function AgeingReport({ title, onBack, backLabel, groups, who, whoPlural, itemLabel, empty }) {
  const [tab, setTab] = useState('current');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const cat = AGEING_TABS.find((t) => t.key === tab);
  const totalOutstanding = AGEING_TABS.reduce((x, t) => x + groups[t.key].total, 0);
  const totalPeople = AGEING_TABS.reduce((x, t) => x + groups[t.key].count, 0);
  const critCount = groups.sixtyPlus.count + groups.ninetyPlus.count;
  const critAmount = groups.sixtyPlus.total + groups.ninetyPlus.total;
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase(), d = t.replace(/\D/g, '');
    return groups[tab].people.filter((p) => !t || p.name.toLowerCase().includes(t) || (d && p.phone.replace(/\D/g, '').includes(d)));
  }, [groups, tab, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const cur = Math.min(page, pages), start = (cur - 1) * PER_PAGE;
  const records = filtered.slice(start, start + PER_PAGE);

  return (
    <ScrollView style={st.container} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={onBack} accessibilityRole="button"><Text style={st.back}>{backLabel}</Text></TouchableOpacity>
      <Text style={st.title}>{title}</Text>

      {critCount > 0 ? (
        <View style={st.critical}>
          <Text style={st.critTitle}>🚨 CRITICAL ACCOUNTS</Text>
          <Text style={st.critText}>{critCount} {critCount === 1 ? 'account' : 'accounts'} overdue 60+ days</Text>
          <Text style={st.critAmt}>{money(critAmount)} {who === 'Customers' ? 'at risk' : 'owed'}</Text>
        </View>
      ) : null}

      <View style={st.summary}>
        <View style={st.summaryItem}><Text style={st.summaryLabel}>Total Outstanding</Text><Text style={st.summaryValue}>{money(totalOutstanding)}</Text></View>
        <View style={st.divider} />
        <View style={st.summaryItem}><Text style={st.summaryLabel}>Total {whoPlural}</Text><Text style={st.summaryValue}>{totalPeople}</Text></View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {AGEING_TABS.map((c) => {
          const on = tab === c.key;
          return (
            <TouchableOpacity key={c.key} onPress={() => { setTab(c.key); setQ(''); setPage(1); }} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={[st.tab, on && { borderBottomColor: c.color, borderBottomWidth: 3 }]}>
              <Text style={[st.tabLabel, on && { color: C.ink, fontWeight: '700' }]}>{c.label}</Text>
              <Text style={[st.tabCount, on && { color: C.ink }]}>{groups[c.key].count}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={st.searchRow}>
        <TextInput style={st.search} placeholder="🔍 Search by name or mobile…" value={q} onChangeText={(v) => { setQ(v); setPage(1); }} placeholderTextColor="#c7c9ce" />
        {q ? <TouchableOpacity onPress={() => { setQ(''); setPage(1); }}><Text style={st.clear}>Clear</Text></TouchableOpacity> : null}
      </View>

      <View style={[st.catBanner, { borderLeftColor: cat.color }]}>
        <Text style={st.catLabel}>{cat.label}</Text>
        <Text style={st.catValue}>{money(groups[tab].total)}</Text>
      </View>

      <View>
        {records.length ? records.map((p, i) => (
          <View key={p.key} style={st.record}>
            <View style={st.num}><Text style={st.numText}>{start + i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{p.name}</Text>
              {p.phone ? <Text style={st.phone}>📞 {p.phone}</Text> : null}
              <View style={{ flexDirection: 'row', marginTop: 6 }}>
                <View style={{ marginRight: 24 }}><Text style={st.dLabel}>Outstanding</Text><Text style={st.dValue}>{money(p.outstanding)}</Text></View>
                <View><Text style={st.dLabel}>{itemLabel}</Text><Text style={st.dValue}>{p.items}</Text></View>
              </View>
            </View>
          </View>
        )) : (
          <View style={{ paddingVertical: 28 }}>
            <Text style={{ color: C.soft, textAlign: 'center' }}>{q ? `No ${whoPlural.toLowerCase()} match your search.` : (totalPeople ? `No ${whoPlural.toLowerCase()} in this category.` : empty)}</Text>
          </View>
        )}
      </View>

      {pages > 1 ? (
        <View style={st.pager}>
          <Text style={{ color: C.soft, fontSize: 12 }}>Page {cur} of {pages}</Text>
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity disabled={cur === 1} onPress={() => setPage(cur - 1)} style={[st.pbtn, cur === 1 && { opacity: 0.4 }]}><Text style={st.pbtnText}>← Prev</Text></TouchableOpacity>
            <TouchableOpacity disabled={cur === pages} onPress={() => setPage(cur + 1)} style={[st.pbtn, cur === pages && { opacity: 0.4 }]}><Text style={st.pbtnText}>Next →</Text></TouchableOpacity>
          </View>
        </View>
      ) : null}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  back: { color: C.orangeDark, fontWeight: '700', fontSize: 14, marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 20 },
  critical: { backgroundColor: '#ffebee', borderLeftWidth: 4, borderLeftColor: '#e0453f', borderRadius: 12, padding: 14, marginBottom: 16 },
  critTitle: { fontSize: 13, fontWeight: '700', color: '#c62828', marginBottom: 6 }, critText: { fontSize: 12, color: '#d32f2f', marginBottom: 4 }, critAmt: { fontSize: 12, fontWeight: '700', color: '#e0453f' },
  summary: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#e7e4db' },
  summaryItem: { flex: 1, alignItems: 'center' }, summaryLabel: { fontSize: 11, color: '#5b606c', marginBottom: 4 }, summaryValue: { fontSize: 17, fontWeight: '700', color: '#1a1c20' },
  divider: { width: 1, backgroundColor: '#e7e4db', marginHorizontal: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, marginRight: 6, borderBottomWidth: 3, borderBottomColor: 'transparent', alignItems: 'center' },
  tabLabel: { fontSize: 12.5, color: '#5b606c' }, tabCount: { fontSize: 12, color: '#8b8f99', marginTop: 2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  search: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e4db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  clear: { color: C.orangeDark, fontWeight: '700', marginLeft: 10 },
  catBanner: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderLeftWidth: 4, borderRadius: 10, padding: 12, marginBottom: 12 },
  catLabel: { fontSize: 13, fontWeight: '700', color: '#1a1c20' }, catValue: { fontSize: 14, fontWeight: '700', color: '#1a1c20' },
  record: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e7e4db' },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#efede6', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, numText: { fontSize: 12, fontWeight: '700', color: '#1a1c20' },
  name: { fontSize: 15, fontWeight: '700', color: '#1a1c20' }, phone: { fontSize: 12.5, color: '#5b606c', marginTop: 2 },
  dLabel: { fontSize: 11, color: '#8b8f99' }, dValue: { fontSize: 14, fontWeight: '700', color: '#1a1c20' },
  pager: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  pbtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e4db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginLeft: 8 }, pbtnText: { fontWeight: '700', color: '#1a1c20', fontSize: 13 },
});

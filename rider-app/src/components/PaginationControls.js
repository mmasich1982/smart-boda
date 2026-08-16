// rider-app/src/components/PaginationControls.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// BR-SB06-008: any list exceeding the configured page size paginates rather than rendering unbounded.
// Reproduces cleaned.html's paginationHtml() exactly: numbered page buttons (with a "…" ellipsis once
// there are more than 7 pages), ‹/› nav buttons, and a "Showing X–Y of Z" meta line above the pager —
// not a plain "Page X of Y" Prev/Next pair.
function buildPageList(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = [1];
  if (page > 3) pages.push('…');
  for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
  if (page < totalPages - 2) pages.push('…');
  pages.push(totalPages);
  return pages;
}

export default function PaginationControls({ page, totalPages, totalItems, pageSize = 10, onPageChange }) {
  if (totalPages <= 1) return null;
  const showFrom = (page - 1) * pageSize + 1;
  const showTo = Math.min(page * pageSize, totalItems);
  const pages = buildPageList(page, totalPages);

  return (
    <View style={styles.wrap}>
      <Text style={styles.meta}>Showing {showFrom}–{showTo} of {totalItems}</Text>
      <View style={styles.pagination}>
        <TouchableOpacity disabled={page === 1} onPress={() => onPageChange(page - 1)} style={styles.btn}>
          <Text style={[styles.btnText, styles.navText, page === 1 && styles.disabledText]}>‹</Text>
        </TouchableOpacity>
        {pages.map((p, i) =>
          p === '…' ? (
            <Text key={`e${i}`} style={styles.ellipsis}>⋯</Text>
          ) : (
            <TouchableOpacity key={p} onPress={() => onPageChange(p)} style={[styles.btn, p === page && styles.btnActive]}>
              <Text style={[styles.btnText, p === page && styles.btnTextActive]}>{p}</Text>
            </TouchableOpacity>
          )
        )}
        <TouchableOpacity disabled={page === totalPages} onPress={() => onPageChange(page + 1)} style={styles.btn}>
          <Text style={[styles.btnText, styles.navText, page === totalPages && styles.disabledText]}>›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 2 },
  meta: { fontSize: 11, color: '#5b606c', textAlign: 'center', marginBottom: 8, fontWeight: '600' },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 5, backgroundColor: '#f4f4f5', borderRadius: 14, padding: 6, marginVertical: 4 },
  btn: { minWidth: 32, height: 32, paddingHorizontal: 8, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  btnActive: { backgroundColor: '#ff7a1a' },
  btnText: { fontSize: 12.5, fontWeight: '700', color: '#5b606c' },
  btnTextActive: { color: '#fff' },
  navText: { color: '#ff7a1a', fontSize: 15 },
  disabledText: { opacity: 0.35 },
  ellipsis: { color: '#5b606c', fontSize: 12, paddingHorizontal: 2 },
});

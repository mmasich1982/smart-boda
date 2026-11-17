// rider-app/src/utils/businessGroupRows.js
// SMART CABZ: which group rows a business user sees on the Smart Bizna Home (the same rules the rider Home follows for its group tiles).
//   member of a group, or a Treasurer      -> My Savings
//   member of a Table Banking group, or a Table Banking Treasurer -> My Loans
//   Treasurer                              -> Manage Chama
//   Table Banking Treasurer                -> Group Finance History & Statements
//   named as a Treasurer, code not yet entered -> the "Enter your Chama Code" card
// `m` is what useChamaMembership() returns.
export function groupRows(m) {
  const mem = m || {};
  const tbTreasurer = (mem.treasurerGroups || []).find((x) => x && x.group_type === 'tb') || null;
  const rows = [];
  if (mem.hasGroup || mem.isTreasurer) rows.push({ route: 'MySavings', label: '🐖 My Savings' });
  if ((mem.hasGroup && mem.hasTb) || tbTreasurer) rows.push({ route: 'MyLoans', label: '💳 My Loans' });
  if (mem.isTreasurer) rows.push({ route: 'ManageChama', label: '👥 Manage Chama' });
  if (tbTreasurer) rows.push({ route: 'GroupFinanceHistory', label: '📜 Group Finance History and Statements', params: { groupId: tbTreasurer.group_id } });
  const invite = mem.treasurerInvite ? { group: mem.treasurerInviteGroup || null } : null;
  return { invite, rows };
}

// rider-app/src/screens/chamaHome/chamaHomeRules.js
// SMART CHAMA: which tiles the small Home shows (pure, tested).
//   every member / Treasurer : My Savings, My Financial History and Statements
//   My Loans                 : only when the person is in a Table Banking group (as member or Treasurer)
//   Treasurer                : Manage Chama
//   Table Banking Treasurer  : Group Financial History and Statements (Merry-Go-Round Treasurers do not get it: unchanged rule)
// `m` is what useChamaMembership() returns.
export function chamaHomeTiles(m) {
  const mem = m || {};
  const tb = (mem.treasurerGroups || []).find((x) => x && x.group_type === 'tb') || null;
  const inGroup = !!(mem.hasGroup || mem.isTreasurer);
  return {
    savings: inGroup,
    loans: !!((mem.hasGroup && mem.hasTb) || tb),
    history: inGroup,
    manage: !!mem.isTreasurer,
    groupHistory: tb ? { groupId: tb.group_id } : null,
    invite: mem.treasurerInvite ? { group: mem.treasurerInviteGroup || null } : null,
  };
}

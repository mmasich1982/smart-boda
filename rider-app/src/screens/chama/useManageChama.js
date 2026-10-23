// rider-app/src/screens/chama/useManageChama.js
// What the Treasurer is looking at in Manage Chama, shared by every Manage Chama screen:
//   group TYPE (Merry-Go-Round | Table Banking)  ->  which GROUP of that type  ->  which CIRCLE of that group.
// The choice is remembered across screens (pick "Weekly" on the menu and Contributions, Pay out and Set up open on "Weekly").
// The lists come from the server (/groups/managed and /chama/mgr/circles); nothing here changes money rules.
import { useCallback, useState } from 'react';
import { create } from 'zustand';
import { useFocusEffect } from '@react-navigation/native';
import { managedGroups, mgrCircles, apiError } from '../../api/groupsClient';

export const useManageSel = create((set) => ({
  type: null, groupId: null, circleId: null,
  setType: (type) => set({ type, groupId: null, circleId: null }),
  setGroup: (groupId) => set({ groupId, circleId: null }),
  setCircle: (circleId) => set({ circleId }),
}));

const ORDER = ['mgr', 'tb'];

export default function useManageChama() {
  const sel = useManageSel();
  const [groups, setGroups] = useState(null);
  const [circles, setCircles] = useState(null);       // circles of the selected Merry-Go-Round group (null while loading)
  const [members, setMembers] = useState([]);         // the group's members (to add to a circle)
  const [err, setErr] = useState(null);

  const types = ORDER.filter((t) => (groups || []).some((g) => g.group_type === t));
  const type = types.includes(sel.type) ? sel.type : types[0] || null;
  const groupsOfType = (groups || []).filter((g) => g.group_type === type);
  const group = groupsOfType.find((g) => g.group_id === sel.groupId) || groupsOfType[0] || null;
  const gid = group?.group_id || null;
  const isMgr = group?.group_type === 'mgr';
  const circle = (circles || []).find((c) => c.id === sel.circleId) || (circles || [])[0] || null;

  const loadGroups = useCallback(() => managedGroups()
    .then((rows) => { setGroups((rows || []).map((x) => ({ group_id: x.id || x.group_id, group_name: x.group_name, group_type: x.group_type, status: x.status }))); setErr(null); })
    .catch((e) => { setGroups([]); setErr(apiError(e, 'Could not load your groups. Check your connection.')); }), []);

  const loadCircles = useCallback(() => {
    if (!gid || !isMgr) { setCircles(null); return Promise.resolve(); }
    return mgrCircles(gid).then((r) => { setCircles(r.circles || []); setMembers(r.members || []); })
      .catch(() => setCircles([]));
  }, [gid, isMgr]);

  useFocusEffect(useCallback(() => { loadGroups(); }, [loadGroups]));
  useFocusEffect(useCallback(() => { loadCircles(); }, [loadCircles]));

  return {
    groups, err, types, type, groupsOfType, group, gid, isMgr, circles, circle, members,
    setType: sel.setType, setGroup: sel.setGroup, setCircle: sel.setCircle,
    reload: () => Promise.all([loadGroups(), loadCircles()]),
  };
}
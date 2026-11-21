// rider-app/src/hooks/useShortcuts.js
// The shortcut icons for one Smart Bizna screen, worked out from the saved profile (so it is right offline and follows a permission change at the next sync).
import { useBusinessProfile } from './useBusiness';
import { businessHomeTiles } from '../utils/userTypeRouting';
import { shortcutsFor } from '../utils/businessShortcuts';

export default function useShortcuts(current) {
  const { profile } = useBusinessProfile();
  return profile ? shortcutsFor(current, businessHomeTiles(profile)) : [];
}

// rider-app/src/screens/chama/groupText.js
// Translated text for the Boda Groups screens.
//
//   const gt = useGroupText();
//   <Text>{gt('group.title_my_savings', 'My Savings')}</Text>
//   <Text>{gt('group.title_lend_to', 'Lend to {name}', { name: r.borrower })}</Text>
//
// The app's t() returns the KEY itself when a string is missing (and logs a warning). That would put
// "group.title_my_savings" on screen, so when t() gives the key back we show the English text instead.
import { useTranslation } from '../../i18n/LocalizationProvider';

const fill = (text, vars) => Object.entries(vars || {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);

export function useGroupText() {
  const { t } = useTranslation();
  return (key, english, vars) => {
    const v = t(key, vars);
    return !v || v === key ? fill(english, vars) : v;
  };
}

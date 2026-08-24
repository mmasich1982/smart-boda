# i18n Retrofit Examples (reference only -- not drop-in files)

These two snippets from Module A's developer guide illustrate the *pattern* for retrofitting
a screen to use the `useTranslation()` hook once Module A's localization provider is wired in
via `App.js`. Both use placeholder comments (e.g. "...same state as before...") and are **not**
complete files -- do not paste them directly over the real screens. Use them as a guide to
manually add translation calls to each onboarding screen.

## LanguageSelectionScreen.js -- i18n-aware pattern

```javascript
// rider-app/src/screens/onboarding/LanguageSelectionScreen.js — i18n-aware version
import { useTranslation } from '../../i18n/LocalizationProvider';

export default function LanguageSelectionScreen({ navigation }) {
  const { t, setLanguage } = useTranslation();
  // ...same state as before...

  async function handleContinue() {
    if (!selected) return;
    await setLanguage(selected); // <-- THE moment every subsequent screen switches language
    navigation.replace('ValuePreview');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('lang.title')}</Text>
      <Text style={styles.sub}>{t('lang.subtitle')}</Text>
      {/* LanguageTileGrid unchanged — see Step 2 above */}
      <PrimaryButton label={t('lang.continue')} onPress={handleContinue} disabled={!selected} />
    </View>
  );
}
```

## MobileNumberScreen.js -- i18n-aware pattern

```javascript
// rider-app/src/screens/onboarding/MobileNumberScreen.js — relevant i18n changes only
import { useTranslation } from '../../i18n/LocalizationProvider';

const { t } = useTranslation();

// replace: <Text>One Last Step</Text>
<Text style={styles.title}>{t('number.title')}</Text>
<Text style={styles.sub}>{t('number.subtitle')}</Text>
// replace: setError('Enter a valid Kenyan mobile number.')
setError(t('number.invalid'));
```

**Action for you:** apply this same `t('key')` pattern to every remaining screen listed in
`rider-app/src/constants/onboardingSteps.js` and beyond, once `seed_ui_strings.py` (Module A,
extended by B/C/D/E) has been seeded into the `UiStringMaster` table.

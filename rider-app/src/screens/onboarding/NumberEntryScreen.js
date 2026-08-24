// rider-app/src/screens/onboarding/NumberEntryScreen.js
// WRAPPER -- SettingsNavigator.js (Module E) imports "NumberEntryScreen" with a comment
// "reused from Module A, editMode prop", but Module A's actual file is named
// MobileNumberScreen.js and no guide shows the editMode variant explicitly. Re-exporting
// as a same-named alias so the import resolves; verify MobileNumberScreen.js actually
// reads an `editMode` prop/param before relying on this in production.
export { default } from './MobileNumberScreen';

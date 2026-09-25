/**
 * Replaces every native module the app touches with an in-memory fake, before
 * any app module loads. Everything above this boundary — the vault, the PIN
 * store, the lock, the screens — is the real code.
 */

jest.mock('expo-secure-store', () => require('./fakes/secure-store'));
jest.mock('expo-crypto', () => require('./fakes/crypto'));
jest.mock('expo-file-system', () => require('./fakes/file-system'));
jest.mock('expo-local-authentication', () => require('./fakes/local-authentication'));
jest.mock('expo-camera', () => require('./fakes/camera'));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: require('./fakes/devices').launchImageLibraryAsync,
}));
jest.mock('../modules/label-ocr', () => ({ LabelOcr: require('./fakes/devices').LabelOcr }));
jest.mock('expo-notifications', () => require('./fakes/notifications'));
jest.mock('../modules/dose-alarms', () => ({ DoseAlarms: require('./fakes/notifications').doseAlarms }));

// Icons are decorative and hidden from assistive technology; nothing to test.
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('expo-screen-capture', () => ({
  enableAppSwitcherProtectionAsync: jest.fn(async () => undefined),
  preventScreenCaptureAsync: jest.fn(async () => undefined),
}));

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);

// No test reaches the network. One that needs RxNav installs its own answers.
global.fetch = jest.fn(async () => {
  throw new Error('Network access in a test (stub fetch for this case).');
}) as unknown as typeof fetch;

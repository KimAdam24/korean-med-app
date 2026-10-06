/**
 * The phone's Bold text setting, and the bundled font, through the real
 * screens. React Native does not apply Bold text itself; the app does, by
 * drawing every word in Pretendard at its style's weight plus what the setting
 * adds (`typeface`).
 */
import { act, screen } from 'expo-router/testing-library';
import { AccessibilityInfo, Platform, StyleSheet, Text as NativeText } from 'react-native';

import { APP_LOAD_BUDGET_MS, forgetAppStateListeners, launchApp, loadApp, sendAppTo } from './app-harness';
import { textWeight } from './fakes/text-weight';

import { rereadBoldText } from '@/features/accessibility/bold-text';
import { addMedication } from '@/features/medications/medication-store';
import { Strings } from '@/i18n/strings';

beforeAll(loadApp, APP_LOAD_BUDGET_MS);
beforeEach(forgetAppStateListeners);
afterEach(() => {
  textWeight.reset();
  rereadBoldText();
  jest.restoreAllMocks();
});

/** The face a piece of text is drawn in: on iOS its name, on Android the family and weight. */
const face = (text: string) => {
  const style = StyleSheet.flatten(screen.getByText(text, { includeHiddenElements: true }).props.style);
  return Platform.OS === 'android' ? `${style.fontFamily} ${style.fontWeight}` : style.fontFamily;
};

/** Every face on screen, and any text drawn in none. */
function faces(): { used: Set<string>; system: string[] } {
  const used = new Set<string>();
  const system: string[] = [];
  for (const node of screen.UNSAFE_getAllByType(NativeText)) {
    const family = StyleSheet.flatten(node.props.style)?.fontFamily;
    // Android: the one family; iOS: a face's own name.
    if (typeof family === 'string' && (family === 'Pretendard' || family.startsWith('Pretendard-'))) used.add(family);
    else system.push(String(node.props.children).slice(0, 40));
  }
  return { used, system };
}

function onAndroid() {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
  return () => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
}

describe('the font', () => {
  it('draws every word on home, a medicine page and settings in Pretendard, none in the phone font', async () => {
    launchApp('/');
    await screen.findByText(Strings.home.capture.ko);
    const home = faces();
    expect(home.system).toEqual([]);

    const record = await addMedication({ name: 'LISINOPRIL', dosage: '10 MG', source: 'manual', needsReview: false });
    launchApp(`/medication/${record.id}`);
    await screen.findByText('LISINOPRIL');
    expect(faces().system).toEqual([]);

    launchApp('/settings');
    await screen.findByText(Strings.settings.eraseTitle.ko);
    expect(faces().system).toEqual([]);
  });

  it('draws each weight in its own face, without Bold text', async () => {
    launchApp('/');
    await screen.findByText(Strings.home.capture.ko);
    // A button's label (700), body text (500).
    expect(face(Strings.home.capture.ko)).toBe('Pretendard-Bold');
    expect(face(Strings.home.captureHint.ko)).toBe('Pretendard-Medium');
  });
});

describe('Bold text', () => {
  it('on Android, raises every weight by what Android adds, and is read again when the app comes back', async () => {
    const restore = onAndroid();
    try {
      textWeight.adjustment = 300;
      rereadBoldText();
      launchApp('/');
      await screen.findByText(Strings.home.capture.ko);
      // 700 + 300, as far as the heaviest face; 500 + 300. On Android, the one
      // family, by weight.
      expect(face(Strings.home.capture.ko)).toBe('Pretendard 900');
      expect(face(Strings.home.captureHint.ko)).toBe('Pretendard 800');
      expect(faces().system).toEqual([]);

      // Turned off in the phone's settings; the user comes back to the app.
      textWeight.adjustment = 0;
      await sendAppTo('background');
      await sendAppTo('active');
      expect(face(Strings.home.capture.ko)).toBe('Pretendard 700');
      expect(face(Strings.home.captureHint.ko)).toBe('Pretendard 500');
    } finally {
      restore();
    }
  });

  it('on an iPhone, raises every weight by the same step while Bold Text is on, and follows it as it changes', async () => {
    jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(true);
    let changed: ((on: boolean) => void) | undefined;
    // The preset's own is already a mock: spying on it returns it, so the
    // subscription is answered here rather than passed on.
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, handler: (on: boolean) => void) => {
      if (event === 'boldTextChanged') changed = handler;
      return { remove: () => undefined };
    }) as typeof AccessibilityInfo.addEventListener);

    launchApp('/');
    await screen.findByText(Strings.home.capture.ko);
    await act(async () => undefined);
    expect(face(Strings.home.capture.ko)).toBe('Pretendard-Black');
    expect(face(Strings.home.captureHint.ko)).toBe('Pretendard-ExtraBold');

    expect(changed).toBeDefined();
    act(() => changed!(false));
    expect(face(Strings.home.capture.ko)).toBe('Pretendard-Bold');
    expect(face(Strings.home.captureHint.ko)).toBe('Pretendard-Medium');
  });

  it('on a phone that cannot say, draws the weights as they are', async () => {
    const restore = onAndroid();
    try {
      // An Android build from before the module: nothing to read.
      jest.spyOn(textWeight, 'fontWeightAdjustment').mockImplementation(() => {
        throw new Error('not in this build');
      });
      rereadBoldText();
      launchApp('/');
      await screen.findByText(Strings.home.capture.ko);
      expect(face(Strings.home.capture.ko)).toBe('Pretendard 700');
    } finally {
      restore();
    }
  });
});

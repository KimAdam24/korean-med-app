/**
 * What a screen reader user hears and where their focus goes, and what large
 * system text does to the layout — the parts of accessibility the contrast and
 * touch-target checks cannot see.
 *
 * Layout itself is not computed under Jest, so the large-text tests check the
 * properties that decide it (scrolling, growth limits) rather than pixels;
 * the rendered result was checked in a browser at simulated text sizes.
 */
import { render } from '@testing-library/react-native';
import { act, screen, within } from 'expo-router/testing-library';
import { AccessibilityInfo, ScrollView } from 'react-native';

import {
  alreadySetUp,
  APP_LOAD_BUDGET_MS,
  forgetAppStateListeners,
  launchApp,
  loadApp,
  press,
  pressDigits,
} from './app-harness';
import { biometrics } from './fakes/local-authentication';

import { BilingualText } from '@/components/bilingual-text';
import { PinPad } from '@/components/pin-pad';
import { TypeMaxScale } from '@/constants/theme';
import * as store from '@/features/medications/medication-store';
import { setPin } from '@/features/security/pin';
import { Strings, untranslated } from '@/i18n/strings';

beforeAll(loadApp, APP_LOAD_BUDGET_MS);
beforeEach(forgetAppStateListeners);
afterEach(() => jest.restoreAllMocks());

const spoken = () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  return () => announce.mock.calls.map(([text]) => text);
};

describe('large system text', () => {
  it('keeps a short confirmation reachable: every screen scrolls', async () => {
    launchApp('/settings');
    await screen.findByText(Strings.settings.storageNotice.ko);
    press(Strings.settings.eraseTitle.ko);
    await screen.findByText(Strings.settings.eraseBody.ko);

    // The button that used to be pushed below the screen's edge is inside a
    // scroll view, so at any text size it can be scrolled to.
    const scrollers = screen.UNSAFE_getAllByType(ScrollView);
    expect(
      scrollers.some((scroller) =>
        within(scroller).queryByRole('button', { name: Strings.settings.eraseConfirm.ko })
      )
    ).toBe(true);
  });

  it('stops each size where the system would stop its own body text', () => {
    render(
      <>
        <BilingualText text={{ ko: '제목', en: 'Title' }} variant="heading" />
        <BilingualText text={{ ko: '본문', en: 'Body' }} />
      </>
    );
    expect(screen.getByText('제목').props.maxFontSizeMultiplier).toBe(TypeMaxScale.heading);
    expect(screen.getByText('본문').props.maxFontSizeMultiplier).toBe(TypeMaxScale.body);
    // The gloss is hidden from screen readers (the group reads as Korean), so
    // it is found only when hidden elements are included.
    expect(screen.getByText('Body', { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(
      TypeMaxScale.gloss
    );
  });

  it('keeps keypad digits inside their fixed keys', () => {
    render(<PinPad value="" length={4} onChange={() => undefined} />);
    expect(screen.getByText('5').props.maxFontSizeMultiplier).toBe(1.5);
  });
});

describe('the screen reader', () => {
  it('reads Korean in a Korean voice, and English in an English one', () => {
    render(
      <>
        <BilingualText text={{ ko: '내 약 목록', en: 'My medicines' }} />
        <BilingualText text={untranslated('Not now')} />
        <BilingualText text={{ ko: 'LISINOPRIL', en: '' }} language="en" />
      </>
    );
    expect(screen.getByLabelText('내 약 목록').props.accessibilityLanguage).toBe('ko-KR');
    expect(screen.getByLabelText('Not now').props.accessibilityLanguage).toBe('en-US');
    expect(screen.getByLabelText('LISINOPRIL').props.accessibilityLanguage).toBe('en-US');
  });

  it('hears a wrong PIN, and the keypad progress in words, never the digits', async () => {
    biometrics.unsecuredPhone();
    alreadySetUp();
    await setPin('4821');
    const heard = spoken();

    launchApp();
    await screen.findByText(Strings.pin.enterTitle.ko);
    pressDigits('13');
    expect(heard()).toContain('2 of 4 digits entered');
    pressDigits('57');
    await screen.findByText(Strings.pin.incorrect.ko);

    expect(heard()).toContain(Strings.pin.incorrect.ko);
    expect(heard().some((text) => /1357|4821/.test(text))).toBe(false);
  });

  it('hears a failure it did not see happen', async () => {
    const record = await store.addMedication({ name: 'LISINOPRIL', source: 'manual', needsReview: false });
    const heard = spoken();
    launchApp(`/medication/${record.id}`);
    await screen.findByText('LISINOPRIL');
    press(Strings.medications.remove.ko);
    await screen.findByText(Strings.medications.removeConfirmTitle.ko);

    jest.spyOn(store, 'removeMedication').mockRejectedValueOnce(new Error('disk full'));
    press(Strings.medications.removeConfirmYes.ko);
    await screen.findByText(Strings.failure.removeFailed.ko);
    expect(heard()).toContain(Strings.failure.removeFailed.ko);
  });

  it('moves to the heading of a step that replaced the one before it', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    launchApp('/settings');
    await screen.findByText(Strings.settings.storageNotice.ko);
    press(Strings.settings.eraseTitle.ko);
    await screen.findByText(Strings.settings.eraseBody.ko);
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    const focused = focus.mock.calls
      .filter(([, event]) => event === 'focus')
      .map(([target]) => (target as unknown as { props?: { accessibilityLabel?: string } }).props?.accessibilityLabel);
    expect(focused).toContain(Strings.settings.eraseTitle.ko);
  });
});

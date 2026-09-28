import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BilingualText } from '@/components/bilingual-text';
import { Radius, Spacing, Type, TypeMaxScale } from '@/constants/theme';
import { useLargeText } from '@/hooks/use-large-text';
import { useTheme } from '@/hooks/use-theme';
import { Strings, fillTemplate, type Bilingual } from '@/i18n/strings';

import type { ReminderTime } from '../medications/types';
import { clockHour, formatReminderTime, stepTime, withPeriod, type TimeWords } from './plan';

/** The reviewed words every reminder time is written with. See `TimeWords`. */
export const timeWords = (): TimeWords => ({
  template: Strings.reminders.timeFormat.ko,
  am: Strings.reminders.am.ko,
  pm: Strings.reminders.pm.ko,
});

/** Times most people take medicine at, one tap each. */
const PRESETS: readonly ReminderTime[] = [
  { hour: 8, minute: 0 },
  { hour: 12, minute: 0 },
  { hour: 18, minute: 0 },
  { hour: 21, minute: 0 },
];

/**
 * Choosing a time of day, drawn rather than the platform's wheel or clock
 * face: both are small, fiddly and different on every phone. Large minus and
 * plus buttons for the hour and the minute, morning and afternoon as two plain
 * choices, and the common times one tap away — the same controls an older
 * user meets on a microwave or a pill-box alarm.
 *
 * For a screen reader the hour and the minute are each one adjustable control
 * (swipe up or down), announced with the whole time, rather than two buttons
 * and a number read separately.
 */
export function TimePicker({ value, onChange }: { value: ReminderTime; onChange: (next: ReminderTime) => void }) {
  const theme = useTheme();
  const words = timeWords();
  const shown = formatReminderTime(value, words);
  const pm = value.hour >= 12;

  return (
    <View style={styles.root}>
      <Text
        style={[styles.display, { color: theme.text }]}
        maxFontSizeMultiplier={TypeMaxScale.heading}
        accessibilityLiveRegion="polite"
        accessibilityLanguage="ko-KR">
        {shown}
      </Text>

      <View style={styles.periods}>
        <Choice label={Strings.reminders.am} selected={!pm} onPress={() => onChange(withPeriod(value, 'am'))} />
        <Choice label={Strings.reminders.pm} selected={pm} onPress={() => onChange(withPeriod(value, 'pm'))} />
      </View>

      <Stepper
        label={Strings.reminders.hour}
        shown={shown}
        value={String(clockHour(value))}
        onStep={(direction) => onChange(stepTime(value, 'hour', direction))}
      />
      <Stepper
        label={Strings.reminders.minute}
        shown={shown}
        value={String(value.minute).padStart(2, '0')}
        onStep={(direction) => onChange(stepTime(value, 'minute', direction))}
      />

      <BilingualText text={Strings.reminders.presets} variant="label" />
      <View style={styles.presets}>
        {PRESETS.map((preset) => (
          <Choice
            key={`${preset.hour}:${preset.minute}`}
            label={{ ko: formatReminderTime(preset, words), en: '' }}
            selected={preset.hour === value.hour && preset.minute === value.minute}
            onPress={() => onChange(preset)}
          />
        ))}
      </View>
    </View>
  );
}

function Stepper({
  label,
  shown,
  value,
  onStep,
}: {
  label: Bilingual;
  /** The whole time, which is what a screen reader should hear as it changes. */
  shown: string;
  value: string;
  onStep: (direction: 1 | -1) => void;
}) {
  const theme = useTheme();
  // At large text sizes the label takes its own line: beside the controls it
  // was squeezed to "Minu" by the buttons.
  const large = useLargeText();
  return (
    <View
      style={large ? styles.stepperStacked : styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label.ko}
      accessibilityValue={{ text: shown }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => onStep(event.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <BilingualText text={label} variant="label" style={large ? undefined : styles.stepperLabel} />
      <View style={styles.stepperControls}>
        <StepButton
          symbol="−"
          label={fillTemplate(Strings.reminders.earlier, { field: label.ko }).ko}
          onPress={() => onStep(-1)}
        />
        <Text
          style={[styles.stepperValue, { color: theme.text }]}
          maxFontSizeMultiplier={TypeMaxScale.heading}>
          {value}
        </Text>
        <StepButton
          symbol="+"
          label={fillTemplate(Strings.reminders.later, { field: label.ko }).ko}
          onPress={() => onStep(1)}
        />
      </View>
    </View>
  );
}

function StepButton({ symbol, label, onPress }: { symbol: string; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.stepButton,
        { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.surface },
      ]}>
      <Text style={[styles.stepSymbol, { color: theme.text }]} maxFontSizeMultiplier={1.5}>
        {symbol}
      </Text>
    </Pressable>
  );
}

function Choice({ label, selected, onPress }: { label: Bilingual; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label.ko}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.choice,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.primary : pressed ? theme.backgroundSelected : theme.surface,
        },
      ]}>
      <BilingualText text={label} variant="label" align="center" color={selected ? theme.onPrimary : undefined} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.three,
  },
  display: {
    ...Type.heading,
    textAlign: 'center',
  },
  periods: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepperStacked: {
    gap: Spacing.two,
  },
  stepperLabel: {
    flex: 1,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  stepperValue: {
    ...Type.heading,
    minWidth: 56,
    textAlign: 'center',
  },
  stepButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSymbol: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  choice: {
    flexGrow: 1,
    minHeight: 56,
    minWidth: 120,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.inner,
    borderCurve: 'continuous',
    borderWidth: 2,
  },
});

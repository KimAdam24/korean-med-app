/**
 * Android's Bold text setting, as `modules/text-weight` reads it: what it adds
 * to every font weight, 300 when on. Off on every test's phone.
 */
export const textWeight = {
  adjustment: 0,
  fontWeightAdjustment(): number {
    return textWeight.adjustment;
  },
  reset(): void {
    textWeight.adjustment = 0;
  },
};

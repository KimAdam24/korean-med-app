import { disk } from './file-system';

/**
 * The two smaller devices: the photo picker and the label reader.
 *
 * The picker behaves as expo-image-picker does on a device: it never returns
 * the user's file, only a copy it wrote into the app's cache. The label reader
 * returns whatever lines the test hands it, as the native module would.
 */
type RecognizedLine = { text: string; confidence: number | null };

const pickerState = {
  next: null as null | { uri: string; width: number; height: number },
  /** Set while the picker is held open; calling it closes the picker. */
  close: null as null | ((result: unknown) => void),
  holding: false,
};
const ocrState = { lines: [] as RecognizedLine[], fail: false, calls: [] as string[] };

export async function launchImageLibraryAsync(): Promise<unknown> {
  if (pickerState.holding) {
    pickerState.holding = false;
    return new Promise((resolve) => {
      pickerState.close = resolve;
    });
  }
  const next = pickerState.next;
  pickerState.next = null;
  if (!next) return { canceled: true, assets: null };
  return { canceled: false, assets: [next] };
}

export const picker = {
  /** The user chooses a photo: the picker copies it into the cache first. */
  choosePhoto(name = 'label.jpg'): string {
    const uri = `file:///cache/ImagePicker/${name}`;
    disk.write(uri, 'picked-jpeg-bytes');
    pickerState.next = { uri, width: 3000, height: 4000 };
    return uri;
  },
  /** The next picker stays open — the user browsing — until `closeWithoutChoosing`. */
  holdOpen(): void {
    pickerState.holding = true;
  },
  get isOpen(): boolean {
    return pickerState.close !== null;
  },
  closeWithoutChoosing(): void {
    pickerState.close?.({ canceled: true, assets: null });
    pickerState.close = null;
  },
  reset(): void {
    pickerState.next = null;
    pickerState.close = null;
    pickerState.holding = false;
  },
};

export const LabelOcr = {
  async recognizeTextAsync(uri: string): Promise<RecognizedLine[]> {
    ocrState.calls.push(uri);
    if (ocrState.fail) throw new Error('Recognition failed (injected).');
    return ocrState.lines;
  },
};

export const ocr = {
  state: ocrState,
  willRead(lines: readonly (string | RecognizedLine)[]): void {
    ocrState.lines = lines.map((line) => (typeof line === 'string' ? { text: line, confidence: 0.9 } : line));
  },
  reset(): void {
    ocrState.lines = [];
    ocrState.fail = false;
    ocrState.calls = [];
  },
};

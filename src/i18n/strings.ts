/**
 * Korean-first bilingual copy.
 *
 * Spec §5 leaves "Korean-only vs. bilingual" open, so every string carries both
 * and `BilingualText` renders Korean as the primary line with English beneath.
 * Dropping to Korean-only later means changing that one component, not the copy.
 *
 * Korean uses 해요체 (polite, non-archaic) throughout: it reads as respectful to
 * an older user without the stiffness of 하십시오체.
 */

export type Bilingual = {
  readonly ko: string;
  readonly en: string;
};

export const Strings = {
  home: {
    title: { ko: '약 도우미', en: 'Medicine Helper' },
    capture: { ko: '약 사진 찍기', en: 'Take a photo of your medicine' },
    captureHint: {
      ko: '약병이나 약봉지의 글씨를 찍으면 약 정보를 읽어 드려요.',
      en: 'Photograph the label on your bottle or packet and we will read it for you.',
    },
    privacy: {
      ko: '사진은 저장하지 않아요. 글씨를 읽은 뒤 바로 지워요.',
      en: 'Photos are never saved. They are deleted right after the text is read.',
    },
  },

  permission: {
    askTitle: { ko: '카메라를 사용해도 될까요?', en: 'May we use the camera?' },
    askBody: {
      ko: '약병의 글씨를 읽기 위해 카메라가 필요해요. 사진은 저장하지 않고, 글씨를 읽은 즉시 지워요.',
      en: 'We need the camera to read the writing on your medicine. The photo is never saved — it is deleted as soon as the text is read.',
    },
    allow: { ko: '예, 사용할게요', en: 'Yes, allow the camera' },
    deniedTitle: { ko: '카메라를 쓸 수 없어요', en: 'The camera is unavailable' },
    deniedBody: {
      ko: '휴대폰 설정에서 이 앱의 카메라 사용을 허용해 주세요.',
      en: 'Please allow camera access for this app in your phone settings.',
    },
    openSettings: { ko: '설정 열기', en: 'Open settings' },
    checking: { ko: '잠시만 기다려 주세요', en: 'One moment, please' },
  },

  camera: {
    frameHint: {
      ko: '약 이름이 보이도록 사각형 안에 맞춰 주세요.',
      en: 'Line the label up inside the box so the medicine name is visible.',
    },
    privacyBanner: { ko: '사진은 저장되지 않아요', en: 'Photos are not saved' },
    shutter: { ko: '사진 찍기', en: 'Take photo' },
    torchOn: { ko: '불 켜기', en: 'Turn on light' },
    torchOff: { ko: '불 끄기', en: 'Turn off light' },
    close: { ko: '닫기', en: 'Close' },
    capturing: { ko: '사진을 찍고 있어요', en: 'Taking the photo' },
    reading: { ko: '약 정보를 읽고 있어요', en: 'Reading the label' },
    discarded: { ko: '사진은 지웠어요', en: 'The photo has been deleted' },
    retake: { ko: '다시 찍기', en: 'Take another photo' },
    done: { ko: '확인', en: 'Done' },
  },

  /**
   * Barcode identification (spec §3.1, primary path).
   *
   * The drug name itself is never translated — §3.2 settles on showing the
   * printed English name so it can be matched against the box, with Korean
   * guidance around it. So these strings are the frame, and the name sits
   * inside them untouched.
   */
  scan: {
    hint: {
      ko: '약 상자에 있는 바코드를 네모 안에 비춰 주세요.',
      en: 'Hold the barcode on the box inside the square.',
    },
    orPhoto: {
      ko: '바코드가 없으면 아래 단추로 사진을 찍어 주세요.',
      en: 'If there is no barcode, use the button below to take a photo.',
    },
    looking: { ko: '약을 찾고 있어요', en: 'Looking up the medicine' },
    foundTitle: { ko: '이 약이 맞나요?', en: 'Is this the right medicine?' },
    foundBody: {
      ko: '약 상자에 적힌 이름과 같은지 확인해 주세요.',
      en: 'Please check this matches the name printed on the box.',
    },
    codeLabel: { ko: '약 번호 (NDC)', en: 'Medicine code (NDC)' },
    discontinued: {
      ko: '지금은 판매하지 않는 포장이에요. 드시던 약이라면 그대로 등록해도 괜찮아요.',
      en: 'This package is no longer sold. If it is the medicine you take, it is fine to add it.',
    },
    save: { ko: '내 약으로 등록하기', en: 'Add to my medicines' },
    saved: { ko: '약 목록에 저장했어요', en: 'Saved to your medicine list' },
    scanAgain: { ko: '다시 찍기', en: 'Scan again' },

    ambiguousTitle: { ko: '비슷한 약이 여러 개 있어요', en: 'More than one medicine matches' },
    ambiguousBody: {
      ko: '바코드만으로는 구분할 수 없어요. 약 상자에 적힌 번호와 같은 것을 골라 주세요.',
      en: 'The barcode alone cannot tell them apart. Please choose the one whose code matches your box.',
    },

    unrecognisedTitle: { ko: '등록된 약이 아니에요', en: 'This medicine is not in our reference' },
    unrecognisedBody: {
      ko: '바코드는 읽었지만 약 정보를 찾지 못했어요. 약 상자를 사진으로 찍어 볼까요?',
      en: 'We read the barcode but could not find the medicine. Shall we try photographing the box?',
    },

    offlineTitle: { ko: '약 정보를 가져오지 못했어요', en: 'We could not fetch the medicine details' },
    offlineBody: {
      ko: '인터넷 연결을 확인하고 다시 시도해 주세요.',
      en: 'Please check your internet connection and try again.',
    },
    retry: { ko: '다시 시도하기', en: 'Try again' },

    saveFailedTitle: { ko: '저장하지 못했어요', en: 'We could not save it' },
  },

  result: {
    title: { ko: '읽은 내용', en: 'What we read' },
    name: { ko: '약 이름', en: 'Medicine name' },
    dosage: { ko: '용량', en: 'Dose' },
    instructions: { ko: '복용 방법', en: 'How to take it' },
    missing: { ko: '읽지 못했어요', en: 'Could not be read' },
    needsCheck: { ko: '확인이 필요해요', en: 'Please check this' },
  },

  /**
   * The lock (spec §3.3).
   *
   * "잠금" (lock) is used rather than the English loanword, and the copy never
   * names a technology the user has not already met on their own phone: the
   * system prompt itself says Face ID or 지문, so these strings say "휴대폰
   * 잠금 해제 방법" — the way you already unlock your phone.
   */
  lock: {
    title: { ko: '약 정보를 보호하고 있어요', en: 'Your medicine information is protected' },
    body: {
      ko: '본인만 볼 수 있도록 잠겨 있어요. 잠금을 풀어 주세요.',
      en: 'It is locked so that only you can see it. Please unlock it.',
    },
    unlock: { ko: '잠금 풀기', en: 'Unlock' },
    /** Shown inside the OS dialog, so it must stand alone without our UI around it. */
    prompt: { ko: '약 정보를 보려면 본인 확인이 필요해요', en: 'Please confirm it is you to see your medicine information' },
    cancel: { ko: '취소', en: 'Cancel' },
    usePin: { ko: '비밀번호로 열기', en: 'Use PIN instead' },
    useDevice: { ko: '휴대폰 잠금으로 열기', en: 'Use phone unlock instead' },
    checking: { ko: '확인하고 있어요', en: 'Checking' },
    rejected: {
      ko: '본인 확인이 되지 않았어요. 다시 해 보시거나 비밀번호를 쓰세요.',
      en: 'We could not confirm it is you. Try again, or use your PIN.',
    },
    biometricUnavailable: {
      ko: '지금은 지문이나 얼굴로 열 수 없어요. 비밀번호를 입력해 주세요.',
      en: 'Fingerprint or face unlock is unavailable right now. Please enter your PIN.',
    },
  },

  pin: {
    enterTitle: { ko: '비밀번호를 입력해 주세요', en: 'Please enter your PIN' },
    enterBody: { ko: '숫자 네 자리예요.', en: 'It is four digits.' },
    createTitle: { ko: '비밀번호를 정해 주세요', en: 'Please choose a PIN' },
    createBody: {
      ko: '이 휴대폰에는 잠금이 설정되어 있지 않아요. 약 정보를 보호하려면 숫자 네 자리를 정해 주세요.',
      en: 'This phone has no screen lock. To protect your medicine information, please choose four digits.',
    },
    confirmTitle: { ko: '한 번 더 입력해 주세요', en: 'Please enter it once more' },
    mismatch: {
      ko: '두 번 입력한 번호가 달라요. 처음부터 다시 정해 주세요.',
      en: 'The two entries did not match. Please choose again.',
    },
    incorrect: { ko: '비밀번호가 맞지 않아요.', en: 'That PIN is not correct.' },
    /** `{분}` is replaced with a whole number of minutes by `formatLockout`. */
    lockedOut: {
      ko: '여러 번 틀렸어요. {분}분 뒤에 다시 시도해 주세요.',
      en: 'Too many wrong attempts. Please try again in {분} minutes.',
    },
    lockedOutSoon: {
      ko: '여러 번 틀렸어요. 잠시 뒤에 다시 시도해 주세요.',
      en: 'Too many wrong attempts. Please try again shortly.',
    },
    delete: { ko: '지우기', en: 'Delete' },
    saved: { ko: '비밀번호를 저장했어요', en: 'Your PIN has been saved' },
  },

  vault: {
    /**
     * Shown when medication data exists but cannot be decrypted — almost always
     * a restore onto a new phone. Deliberately explicit that the list is gone
     * and must be re-scanned: an empty list shown without explanation could
     * lead someone to believe they take no medicines.
     */
    unrecoverableTitle: { ko: '저장된 약 정보를 열 수 없어요', en: 'Your saved medicine information cannot be opened' },
    unrecoverableBody: {
      ko: '새 휴대폰에서는 예전에 저장한 약 정보를 열 수 없어요. 안전을 위해 이 휴대폰에서만 열리도록 되어 있어요. 약을 다시 찍어서 등록해 주세요.',
      en: 'Medicine information saved on another phone cannot be opened here. For safety it can only be opened on the phone that saved it. Please scan your medicines again.',
    },
    startOver: { ko: '다시 등록하기', en: 'Start over' },
    unsupported: {
      ko: '이 휴대폰에서는 약 정보를 안전하게 저장할 수 없어요. 저장 기능은 휴대폰 앱에서 사용해 주세요.',
      en: 'Medicine information cannot be stored securely here. Please use the phone app to save it.',
    },
  },

  problem: {
    captureFailed: {
      ko: '사진을 찍지 못했어요. 다시 해 볼까요?',
      en: 'The photo could not be taken. Shall we try again?',
    },
    unreadable: {
      ko: '글씨를 읽지 못했어요. 밝은 곳에서 다시 찍어 주세요.',
      en: 'We could not read the writing. Please try again somewhere brighter.',
    },
    notConfigured: {
      ko: '아직 글씨를 읽는 기능이 준비되지 않았어요.',
      en: 'Label reading is not connected yet.',
    },
    notDiscarded: {
      ko: '사진을 안전하게 지우지 못해서 읽기를 중단했어요. 다시 시도해 주세요.',
      en: 'We stopped because the photo could not be securely deleted. Please try again.',
    },
    noCameraOnWeb: {
      ko: '이 기능은 휴대폰에서 사용해 주세요.',
      en: 'Please use this feature on a phone.',
    },
  },
} as const;

/**
 * Fills the `{분}` placeholder in a lockout message.
 *
 * Rounds up and floors at one: "0분 뒤에 다시 시도해 주세요" reads as broken,
 * and a user told to wait zero minutes will simply retry and be refused again.
 */
export function formatLockout(template: Bilingual, remainingMs: number): Bilingual {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return {
    ko: template.ko.replace('{분}', String(minutes)),
    en: template.en.replace('{분}', String(minutes)),
  };
}

/**
 * Korean-first bilingual copy.
 *
 * Spec §5 leaves "Korean-only vs. bilingual" open, so every string carries both
 * and `BilingualText` renders Korean as the primary line with English beneath.
 * Dropping to Korean-only later means changing that one component, not the copy.
 *
 * Korean uses 해요체 (polite, non-archaic) throughout: it reads as respectful to
 * an older user without the stiffness of 하십시오체.
 *
 * One word per thing, everywhere: 버튼 (not 단추, which reads as a coat button),
 * 네모 for the camera frame, 네 for yes, 약병 for a dispensed label and 약 상자
 * for a boxed product with a barcode. 등록 means adding to the user's own list,
 * so it is never used to say whether a medicine is known or approved.
 */

export type Bilingual = {
  readonly ko: string;
  readonly en: string;
  /** An English placeholder with no Korean yet. See `untranslated`. */
  readonly pendingKo?: true;
  /** For the translator: where the text appears and anything that constrains it. */
  readonly note?: string;
};

/**
 * Copy written in English and waiting for its Korean.
 *
 * New copy is not written in Korean by the implementation: it goes to a native
 * reader first. Until then the English stands in both slots, so every screen
 * still has something to show and read aloud, and `BilingualText` shows it once
 * rather than twice. `npm run copy:pending` lists every placeholder, with its
 * note, as the batch to translate; `strings.test.ts` fails if English reaches
 * the Korean slot any other way.
 */
export function untranslated(en: string, note?: string): Bilingual {
  return note ? { ko: en, en, pendingKo: true, note } : { ko: en, en, pendingKo: true };
}

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

  /**
   * The first launch, before the lock: what the app does, where the data lives,
   * and the camera permission asked for with its reason rather than cold.
   *
   * All English placeholders for now; see `untranslated`.
   */
  onboarding: {
    step: untranslated('Step {n} of {total}', 'Small progress label above each screen. {n} and {total} are numbers.'),
    welcomeTitle: untranslated('Medicine Helper reads your medicine labels', 'Title of the first screen. "Medicine Helper" is the app name, 약 도우미.'),
    welcomeBody: untranslated(
      'Take a photo of a medicine label, or scan the barcode on the box. The app reads the name, the strength and the directions, and keeps a list of your medicines.'
    ),
    welcomeCheck: untranslated(
      'It can misread a label. Always compare what it shows with the bottle, and ask your pharmacist if you are unsure.',
      'A caution, but a calm one: it should not frighten.'
    ),
    storageTitle: untranslated('Your list stays on this phone'),
    storageLocked: untranslated('Your medicines are saved only on this phone, locked so that only you can open them.'),
    storageNoBackup: untranslated(
      'They are not backed up anywhere. If you change or reset your phone, you will need to add your medicines again.',
      'Must be unmistakable: this is the expectation users otherwise discover the hard way.'
    ),
    storagePhotos: untranslated('Photos are used only to read the label, and are deleted straight after.'),
    storageLookup: untranslated(
      'To look up a barcode, the app sends only the barcode number, never your list or your photos.',
      'The lookup goes to the US National Library of Medicine; the sentence need not name it.'
    ),
    cameraTitle: untranslated('The camera reads your labels'),
    cameraBody: untranslated(
      'Next, your phone will ask whether this app may use the camera. Choose Allow, so that you can photograph your medicines.',
      "'Allow' should match the word on the phone's own permission button in Korean."
    ),
    cameraReady: untranslated('The camera is ready.'),
    cameraOff: untranslated('The camera is off for now. You can turn it on later in your phone settings.'),
    next: untranslated('Next', 'Button.'),
    back: untranslated('Back', 'Button.'),
    askCamera: untranslated('Continue', "Button that opens the phone's camera permission question."),
    notNow: untranslated('Not now', 'Button: skip the camera question for now.'),
    start: untranslated('Start', 'Button that ends the introduction.'),
  },

  permission: {
    askTitle: { ko: '카메라를 사용해도 될까요?', en: 'May we use the camera?' },
    askBody: {
      ko: '약병의 글씨를 읽기 위해 카메라가 필요해요. 사진은 저장하지 않고, 글씨를 읽은 즉시 지워요.',
      en: 'We need the camera to read the writing on your medicine. The photo is never saved — it is deleted as soon as the text is read.',
    },
    allow: { ko: '네, 허용할게요', en: 'Yes, allow the camera' },
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
      ko: '약 이름이 보이도록 네모 안에 맞춰 주세요.',
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
      ko: '바코드가 없으면 아래 버튼을 눌러 사진을 찍어 주세요.',
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
    saved: { ko: '내 약 목록에 저장했어요', en: 'Saved to your medicine list' },
    scanAgain: { ko: '다시 찍기', en: 'Scan again' },

    ambiguousTitle: { ko: '이 바코드에 맞는 약이 여러 개 있어요', en: 'More than one medicine matches' },
    ambiguousBody: {
      ko: '바코드만으로는 구분할 수 없어요. 약 상자에 적힌 번호와 같은 것을 골라 주세요.',
      en: 'The barcode alone cannot tell them apart. Please choose the one whose code matches your box.',
    },

    unrecognisedTitle: { ko: '이 약의 정보를 찾지 못했어요', en: 'We could not find details for this medicine' },
    unrecognisedBody: {
      ko: '바코드는 읽었지만 약 정보가 나오지 않았어요. 약 상자를 사진으로 찍어 볼까요?',
      en: 'We read the barcode but no details came up. Shall we try photographing the box?',
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

    /**
     * Shown instead of asking the user to confirm, when the read looks too poor
     * to confirm against.
     *
     * The distinction is the point. "확인이 필요해요" asks the user to compare
     * what we read with the box, which only works if what we read is close. A
     * drug name missing its first letter still looks like a drug name, so the
     * user would compare it, see something plausible, and agree. When that is
     * possible the honest request is a new photograph, not a check.
     */
    /**
     * Said once, at the top of a reading, instead of under every field.
     *
     * Confirmation is still required — a machine read a photograph — but a
     * warning attached to every field says nothing about any of them, and
     * teaches the reader to skip the one that matters. Field-level warnings are
     * now reserved for fields where damage was actually found.
     */
    compareWithBottle: {
      ko: '사진으로 읽은 내용이에요. 저장하기 전에 약병과 한 번 비교해 주세요.',
      en: 'This was read from a photo. Please compare it with the bottle once before saving.',
    },

    /**
     * Shown *in place of* a field's value when its text is damaged. The value
     * is never shown as an answer in that case — only as evidence, behind a
     * tap, marked as inaccurate.
     */
    damaged: {
      name: {
        title: { ko: '약 이름을 정확히 읽지 못했어요', en: 'We could not read the medicine name clearly' },
        // Action only: the title has already said the name could not be read.
        body: {
          ko: '약병에 적힌 이름과 꼭 비교해 주세요.',
          en: 'Please check it against the name on the bottle.',
        },
      },
      dosage: {
        title: { ko: '용량을 정확히 읽지 못했어요', en: 'We could not read the dose clearly' },
        body: {
          ko: '약병에 적힌 용량을 직접 확인해 주세요.',
          en: 'Please read the dose on the bottle itself.',
        },
      },
      instructions: {
        title: { ko: '복용 방법을 정확히 읽지 못했어요', en: 'We could not read the directions clearly' },
        // Keeps its reason: without it, directions that are simply absent
        // could be mistaken for a label that had none.
        body: {
          ko: '글자가 깨져서 보여 드리지 않았어요. 약병을 직접 확인해 주세요.',
          en: 'The letters are broken, so they are not shown. Please read the bottle itself.',
        },
      },
    },
    showRaw: { ko: '사진에서 읽은 글자 보기', en: 'Show the letters read from the photo' },
    hideRaw: { ko: '글자 숨기기', en: 'Hide the letters' },
    rawCaption: {
      ko: '정확하지 않은 글자예요. 표시된 부분이 특히 깨져 있어요.',
      en: 'These letters are not accurate. The marked words are the most damaged.',
    },
    /** Said before the save button when damaged fields will be left out. */
    notSavedInstructions: {
      ko: '복용 방법은 저장하지 않아요. 등록한 뒤 약병을 보고 직접 입력해 주세요.',
      en: 'The directions will not be saved. After adding, please type them in from the bottle.',
    },
    notSavedDosage: {
      ko: '용량은 저장하지 않아요. 등록한 뒤 약병을 보고 직접 입력해 주세요.',
      en: 'The dose will not be saved. After adding, please type it in from the bottle.',
    },

    degradedTitle: { ko: '글씨를 제대로 읽지 못했어요', en: 'We did not read this clearly' },
    /**
     * Help, not a verdict. An earlier version said the reading could be
     * dangerous to use, which is true but belongs at the moment of acting on a
     * field — where each damaged field still says so — rather than in the
     * headline, where it made a poor photo feel like a telling-off. What the
     * reader needs here is how to get a better one, and that advice is ML Kit's
     * own: text should fill as much of the frame as possible.
     */
    degradedBody: {
      ko: '밝은 곳에서 약 글씨가 화면에 가득 차게 다시 찍어 보세요.',
      en: 'Try again somewhere bright, with the label filling the screen.',
    },
    /**
     * Reveals the fields of a degraded reading. "그래도" (anyway) is the whole
     * caution: it says the reading is there if wanted, without repeating why it
     * should not be trusted.
     */
    showReading: { ko: '그래도 읽은 내용 보기', en: 'Show what was read anyway' },
    /**
     * A label that curves round the bottle, so the ends of its longest lines
     * are out of the camera's sight. Replaces the "try somewhere brighter"
     * advice, which is wrong here: more light does not bring the words round.
     * English placeholders; see `untranslated`.
     */
    curved: {
      title: untranslated('The label curves round the bottle'),
      right: untranslated(
        'The ends of some lines are out of sight on the right, round the curve. More light will not help. Turn the bottle slowly so that side faces you, and take another photo.',
        'Shown when lines are cut at the right edge. "Turn the bottle" means rotate it in the hand.'
      ),
      left: untranslated(
        'The starts of some lines are out of sight on the left, round the curve. More light will not help. Turn the bottle slowly so that side faces you, and take another photo.'
      ),
      restWhole: untranslated('The medicine name and strength were read in full.'),
      fieldNote: untranslated(
        'The end of this line is out of sight round the curve of the bottle. Please read it on the bottle itself.',
        'Replaces "the letters are broken" for a line cut at the curve.'
      ),
      /** One line cut at the edge: withheld, but the curve is not called. */
      edgeNote: untranslated(
        'The end of this line may be missing. Please read it on the bottle itself.',
        'For one line that stops at the edge of the photo. Must not mention a curve.'
      ),
    },
    hideReading: { ko: '읽은 내용 숨기기', en: 'Hide what was read' },
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
      ko: '본인 확인이 되지 않았어요. 다시 해 보시거나 비밀번호를 입력해 주세요.',
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
      ko: '새 휴대폰에서는 예전에 저장한 약 정보를 열 수 없어요. 안전을 위해 저장했던 휴대폰에서만 열리도록 되어 있어요. 약을 다시 찍어서 등록해 주세요.',
      en: 'Medicine information saved on another phone cannot be opened here. For safety it can only be opened on the phone that saved it. Please scan your medicines again.',
    },
    startOver: { ko: '다시 등록하기', en: 'Start over' },
    unsupported: {
      ko: '여기에서는 약 정보를 안전하게 저장할 수 없어요. 저장 기능은 휴대폰 앱에서 사용해 주세요.',
      en: 'Medicine information cannot be stored securely here. Please use the phone app to save it.',
    },
  },

  /**
   * Source labels shown beside anything this app says about a medicine.
   *
   * Kept short deliberately. The job is to say whose claim it is; a sentence of
   * provenance on every warning becomes wallpaper and stops being read. They
   * are also the phrasing a user repeats to a pharmacist, which is the point —
   * "FDA 허가사항에 나온 내용이래요" starts a conversation that "앱에서 봤어요"
   * does not.
   */
  /** The medication profile: the list, one medicine, and editing it. */
  medications: {
    title: { ko: '내 약 목록', en: 'My medicines' },
    open: { ko: '내 약 보기', en: 'See my medicines' },
    /** Shown on the home screen with the count filled in. */
    countLabel: { ko: '등록된 약 {n}개', en: '{n} medicines saved' },

    emptyTitle: { ko: '아직 등록된 약이 없어요', en: 'No medicines saved yet' },
    emptyBody: {
      ko: '약 상자의 바코드나 약병의 글씨를 찍어서 등록해 보세요.',
      en: 'Scan the barcode on a box, or photograph the label, to add one.',
    },

    loading: { ko: '약 목록을 불러오고 있어요', en: 'Loading your medicines' },

    addedOn: { ko: '등록한 날', en: 'Added' },
    source: { ko: '등록 방법', en: 'How it was added' },
    sourceScan: { ko: '바코드로 찾음', en: 'Found by barcode' },
    sourceManual: { ko: '직접 입력함', en: 'Entered by hand' },

    /**
     * Shown on a record whose text came from OCR and has not been confirmed.
     * Deliberately an invitation to check rather than a warning: the reading
     * may well be right, and alarming someone about their own medicine list
     * every time they open it would teach them to ignore it.
     */
    unconfirmed: { ko: '확인이 필요해요', en: 'Needs checking' },
    confirm: { ko: '맞아요, 확인했어요', en: 'Yes, I checked it' },
    confirmed: { ko: '확인했어요', en: 'Checked' },

    edit: { ko: '고치기', en: 'Edit' },
    save: { ko: '저장하기', en: 'Save' },
    cancel: { ko: '취소', en: 'Cancel' },

    fieldName: { ko: '약 이름', en: 'Medicine name' },
    fieldDosage: { ko: '용량', en: 'Dose' },
    fieldInstructions: { ko: '복용 방법', en: 'How to take it' },
    fieldNamePlaceholder: { ko: '약 상자에 적힌 이름', en: 'The name printed on the box' },

    nameRequired: {
      ko: '약 이름은 비워 둘 수 없어요.',
      en: 'A medicine needs a name.',
    },

    remove: { ko: '목록에서 지우기', en: 'Remove from my list' },
    removeConfirmTitle: { ko: '이 약을 지울까요?', en: 'Remove this medicine?' },
    removeConfirmBody: {
      ko: '목록에서 사라져요. 다시 등록하려면 처음부터 다시 찍어야 해요.',
      en: 'It will be gone from your list. Adding it again means scanning it again.',
    },
    removeConfirmYes: { ko: '네, 지울게요', en: 'Yes, remove it' },

    saveFromLabel: { ko: '내 약으로 등록하기', en: 'Add to my medicines' },
    /**
     * Shown when saving a reading the app is not confident about. The record is
     * still saved — refusing to save would strand a user whose label simply
     * reads poorly — but it is marked, and it says so before the tap rather
     * than after.
     */
    saveUncheckedNotice: {
      ko: '읽은 내용이 정확하지 않을 수 있어요. 등록한 뒤에 꼭 확인해 주세요.',
      en: 'What we read may not be exact. Please check it after adding.',
    },
  },

  /** Managing the lock and the stored data. */
  settings: {
    title: { ko: '설정', en: 'Settings' },
    open: { ko: '설정', en: 'Settings' },

    changePin: { ko: '비밀번호 바꾸기', en: 'Change your PIN' },
    changePinCurrent: { ko: '지금 쓰는 비밀번호를 입력해 주세요', en: 'Enter your current PIN' },
    changePinNew: { ko: '새 비밀번호를 정해 주세요', en: 'Choose a new PIN' },
    changePinDone: { ko: '비밀번호를 바꿨어요', en: 'Your PIN has been changed' },

    forgotPin: { ko: '비밀번호를 잊으셨나요?', en: 'Forgotten your PIN?' },
    /**
     * When the phone has its own lock, that is the way back in — the app PIN
     * is only a second gate, so proving identity to the phone is enough.
     */
    forgotPinWithDevice: {
      ko: '휴대폰 잠금을 풀면 비밀번호를 새로 정할 수 있어요.',
      en: 'Unlock with your phone, and you can set a new PIN.',
    },
    forgotPinUseDevice: { ko: '휴대폰 잠금으로 열기', en: 'Unlock with your phone' },
    /**
     * When it does not, there is nothing else that proves who the user is, and
     * pretending otherwise would be a lie about the lock. Erasing is the only
     * honest option, and the copy says exactly what it costs.
     */
    forgotPinNoDevice: {
      ko: '이 휴대폰에는 잠금이 없어서 본인인지 확인할 다른 방법이 없어요. 약 목록을 모두 지우고 처음부터 다시 시작하는 방법밖에 없어요.',
      en: 'This phone has no lock of its own, so there is no other way to check it is you. The only way forward is to erase your medicines and start again.',
    },

    eraseTitle: { ko: '내 정보 모두 지우기', en: 'Erase everything' },
    eraseBody: {
      ko: '등록한 약과 비밀번호를 모두 지워요. 되돌릴 수 없어요.',
      en: 'Removes every saved medicine and your PIN. This cannot be undone.',
    },
    eraseConfirm: { ko: '네, 모두 지울게요', en: 'Yes, erase everything' },
    eraseDone: { ko: '모두 지웠어요', en: 'Everything has been erased' },

    /** Why the medicines live only on this phone, said plainly rather than buried. */
    storageNotice: {
      ko: '약 정보는 이 휴대폰 안에만 저장돼요. 다른 곳으로 보내지 않아요. 휴대폰을 바꾸면 다시 등록해야 해요.',
      en: 'Your medicines are kept on this phone only, and never sent anywhere. Changing phones means adding them again.',
    },
  },

  guidance: {
    perFdaLabel: { ko: '미국 FDA 허가사항 기준', en: 'per the FDA-approved label' },
    perRxNorm: { ko: '미국 의약품 표준 정보(RxNorm) 기준', en: 'per RxNorm' },
    perOncList: { ko: '미국 ONC 주요 상호작용 목록 기준', en: 'per the ONC high-priority list' },
    perCredibleMeds: { ko: 'CredibleMeds 기준', en: 'per CredibleMeds' },
    /**
     * Attached wherever guidance is shown. The app quotes sources; it does not
     * advise, and the copy should not let that blur.
     */
    askPharmacist: {
      ko: '약사에게 꼭 확인해 주세요.',
      en: 'Please check with your pharmacist.',
    },
  },

  /**
   * What the user is told when something they asked for did not happen.
   *
   * Every one of these replaced a silent return to the previous step — a
   * failed erase, save or removal that looked, on screen, exactly like one
   * that had not been attempted, or like one that had worked. English
   * placeholders for now; see `untranslated`.
   */
  failure: {
    eraseIncompleteTitle: untranslated('Erasing did not finish'),
    eraseIncompleteBody: untranslated(
      'Some of your information may already be erased. Please try again to finish.',
      'After a failed erase. Must not suggest the list is safe: part of it may already be gone.'
    ),
    pinNotChanged: untranslated('Your PIN was not changed. Your old PIN still works. Please try again.'),
    pinNotSaved: untranslated('Your PIN could not be saved. Please choose it again.'),
    pinCheckFailed: untranslated('Your PIN could not be checked just now. Please try again.'),
    editNotSaved: untranslated('Your changes were not saved. Please try again.'),
    confirmNotSaved: untranslated('It was not marked as checked. Please try again.'),
    removeFailed: untranslated('This medicine could not be removed. It is still on your list. Please try again.'),
    addNotSaved: untranslated('It was not added to your list. Please try again.'),
    listUnavailableTitle: untranslated('Your medicine list could not be opened just now'),
    listUnavailableBody: untranslated(
      'This is usually temporary. Please try again.',
      'Distinct from the permanent "cannot be opened" message: nothing is lost.'
    ),
    listDamagedBody: untranslated(
      'Your saved medicine list is damaged and cannot be opened. You will need to add your medicines again.',
      'Saved data on this same phone that cannot be read — not the new-phone case.'
    ),
    medicineGone: untranslated('This medicine is no longer on your list.'),
    lockCheckFailedTitle: untranslated("Your phone's lock could not be checked"),
    lockCheckFailedBody: untranslated('Please try again. If this keeps happening, restart your phone.'),
    deviceUnlockFailed: untranslated('Phone unlock did not work. Please try again.'),
    deviceUnlockOff: untranslated(
      "Phone unlock is not available right now. Check that your phone still has a screen lock, then try again."
    ),
    lookupUnavailable: untranslated(
      'The medicine information service is not answering right now. Please try again later.',
      'Shown when the internet works but the US lookup service does not; must not tell the user to check their connection.'
    ),
    nameUnreadable: untranslated(
      'The medicine name could not be read, so it cannot be added. Please take another photo.'
    ),
  },

  /**
   * Dose reminders. The notification itself never names the medicine: it is
   * shown on the lock screen, and stored in the phone's scheduler outside the
   * encrypted vault. English placeholders for now; see `untranslated`.
   */
  reminders: {
    title: untranslated('Reminders', "Heading of the reminder section on a medicine's page."),
    none: untranslated('No reminder is set for this medicine.'),
    add: untranslated('Add a reminder time', 'Button.'),
    saveTime: untranslated('Save this time', 'Button.'),
    remove: untranslated('Remove', 'Button beside one reminder time.'),
    removeLabel: untranslated(
      'Remove the reminder at {time}',
      'Spoken by the screen reader for the Remove button. {time} is a time such as 8:00 AM.'
    ),
    timeFormat: untranslated(
      '{h}:{mm} {period}',
      'How every reminder time is written. {h} is 1-12, {mm} two digits, {period} is am/pm below. Korean usually puts the period first: {period} {h}:{mm}.'
    ),
    am: untranslated('AM', 'Morning, as in 8:00 AM (오전).'),
    pm: untranslated('PM', 'Afternoon and evening, as in 8:00 PM (오후).'),
    hour: untranslated('Hour'),
    minute: untranslated('Minute'),
    earlier: untranslated('{field} earlier', 'Screen reader label for the minus button; {field} is Hour or Minute.'),
    later: untranslated('{field} later', 'Screen reader label for the plus button; {field} is Hour or Minute.'),
    presets: untranslated('Common times'),
    duplicate: untranslated('That time is already set for this medicine.'),
    tooMany: untranslated('You can set up to {max} reminder times in all.'),
    saveFailed: untranslated('The reminder was not saved. Please try again.'),
    askTitle: untranslated('Allow notifications for your reminders'),
    askBody: untranslated(
      'Next, your phone will ask whether this app may send notifications. Choose Allow, or reminders cannot sound. They never show the name of your medicine.'
    ),
    askContinue: untranslated('Continue', "Button that opens the phone's notification permission question."),
    statusOn: untranslated('Reminders are on. The next one is at {time}.'),
    statusOnNoNext: untranslated('Reminders are on.'),
    statusChecking: untranslated('Checking your reminders'),
    statusLate: untranslated(
      'Reminders may arrive late. To make them come on time, allow "Alarms & reminders" for this app.',
      '"Alarms & reminders" is the name of the Android setting; match the Korean name on the phone.'
    ),
    statusBlocked: untranslated('Reminders cannot sound: notifications are turned off for this app.'),
    statusUnverified: untranslated('Your phone did not confirm your reminders. Please try again.'),
    allow: untranslated('Allow notifications', 'Button.'),
    openAlarmSettings: untranslated('Open "Alarms & reminders"', 'Button that opens the Android setting.'),
    homeWarning: untranslated('Your medicine reminders cannot sound right now.'),
    notificationTitle: untranslated(
      'Time for your medicine',
      'The notification itself, shown on the lock screen. Must not name a medicine.'
    ),
    notificationBody: untranslated('Open Medicine Helper to see which one.', 'Notification body. "Medicine Helper" is 약 도우미.'),
    channelName: untranslated('Medicine reminders', "Shown in the phone's notification settings for this app."),
    channelDescription: untranslated('Reminders to take your medicines.'),
  },

  /** Heard, not seen: labels for screen readers only. */
  a11y: {
    pinProgress: untranslated(
      '{n} of {total} digits entered',
      'Spoken by the screen reader after each PIN digit. Never shown. {n} and {total} are numbers.'
    ),
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
 * Fills `{name}` placeholders in both languages from `values`, keeping the
 * string's placeholder marking. Unknown names are left as written, so a typo
 * shows on screen instead of silently vanishing.
 */
export function fillTemplate(template: Bilingual, values: Record<string, string | number>): Bilingual {
  const fill = (text: string) =>
    text.replace(/\{([^}]+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
  return { ...template, ko: fill(template.ko), en: fill(template.en) };
}

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

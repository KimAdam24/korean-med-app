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
  /** Korean completed by AI, shown before her review. See `aiKorean`. */
  readonly koBy?: 'ai';
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

/**
 * Korean completed by AI, and on screen before the native reader has seen it,
 * at the owner's direction.
 *
 * Shown like reviewed Korean, but still hers to review: `npm run copy:pending
 * -- --export` puts it in her next batch, this Korean as the draft she
 * corrects. Once she has, her wording replaces the call. Never a safety
 * string: those are hers to write (`copy-export.test.ts`).
 */
export function aiKorean(ko: string, en: string, note?: string): Bilingual {
  return note ? { ko, en, koBy: 'ai', note } : { ko, en, koBy: 'ai' };
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
   */
  onboarding: {
    step: { ko: '{total}단계 중 {n}단계', en: 'Step {n} of {total}' },
    welcomeTitle: { ko: '약 도우미가 약에 적힌 글씨를 읽어 드려요', en: 'Medicine Helper reads your medicine labels' },
    welcomeBody: { ko: '약병의 글씨를 사진으로 찍거나, 약 상자의 바코드를 비춰 주세요. 약 이름과 용량, 복용 방법을 읽어 드리고, 내 약 목록으로 모아 둘게요.', en: 'Take a photo of a medicine label, or scan the barcode on the box. The app reads the name, the strength and the directions, and keeps a list of your medicines.' },
    welcomeCheck: { ko: '약 도우미가 글씨를 잘못 읽을 수도 있어요. 화면에 나온 내용을 항상 약병과 비교해 보시고, 잘 모르시겠으면 약사에게 물어보세요.', en: 'It can misread a label. Always compare what it shows with the bottle, and ask your pharmacist if you are unsure.' },
    storageTitle: { ko: '약 목록은 이 휴대폰에만 있어요', en: 'Your list stays on this phone' },
    storageLocked: { ko: '약 정보는 이 휴대폰에만 저장되고, 본인만 열 수 있게 잠겨 있어요.', en: 'Your medicines are saved only on this phone, locked so that only you can open them.' },
    storageNoBackup: { ko: '약 정보는 다른 곳에 따로 저장(백업)되지 않아요. 휴대폰을 바꾸거나 초기화하면 약을 다시 등록해야 해요.', en: 'They are not backed up anywhere. If you change or reset your phone, you will need to add your medicines again.' },
    storagePhotos: { ko: '사진은 글씨를 읽는 데만 쓰고, 읽은 뒤 바로 지워요.', en: 'Photos are used only to read the label, and are deleted straight after.' },
    storageLookup: { ko: '바코드로 약을 찾을 때는 바코드 번호만 보내요. 약 목록이나 사진은 보내지 않아요.', en: 'To look up a barcode, the app sends only the barcode number, never your list or your photos.' },
    cameraTitle: { ko: '카메라로 약 글씨를 읽어요', en: 'The camera reads your labels' },
    cameraBody: { ko: "다음 화면에서 휴대폰이 이 앱의 카메라 사용을 허용할지 물어봐요. 약을 찍으려면 '앱 사용 중에만 허용'을 눌러 주세요.", en: 'Next, your phone will ask whether this app may use the camera. Choose Allow, so that you can photograph your medicines.' },
    cameraReady: { ko: '카메라를 쓸 준비가 됐어요.', en: 'The camera is ready.' },
    cameraOff: { ko: '지금은 카메라가 꺼져 있어요. 나중에 휴대폰 설정에서 켤 수 있어요.', en: 'The camera is off for now. You can turn it on later in your phone settings.' },
    next: { ko: '다음', en: 'Next' },
    back: { ko: '이전', en: 'Back' },
    askCamera: { ko: '계속하기', en: 'Continue' },
    notNow: { ko: '나중에 할게요', en: 'Not now' },
    start: { ko: '시작하기', en: 'Start' },
  },

  /**
   * The privacy promise, rewritten so it is true of a photo from the user's
   * own gallery as well as of the camera's, and the gallery picker's label.
   * In the app since 2026-09-28, since the gallery ships in release, and
   * reviewed 2026-10-04: `privacy.home` in place of `home.privacy`,
   * `pickedPhoto` in place of "the photo has been deleted" under a reading of
   * a chosen photo, `onboardingPhotos` and `lookup` in the introduction.
   * `cameraPermission` is copied into app.json's expo-camera
   * `cameraPermission` (a test keeps the two alike), since the iPhone shows
   * it in its own dialog.
   */
  privacy: {
    home: { ko: '앱은 사진을 저장하지도, 다른 곳으로 보내지도 않아요. 사진 속 글씨만 읽어요.', en: 'Photos are never saved, and never sent anywhere. Only the writing on them is used; the photo is not kept.' },
    pickedPhoto: { ko: '고르신 사진은 지우지 않고 휴대폰에 그대로 뒀어요. 사진 속 글씨만 읽었어요.', en: 'The photo you chose is left as it is. Only the writing is read, and your photo is not deleted.' },
    cameraPermission: { ko: '약병의 글씨를 읽기 위해 카메라를 사용합니다. 사진은 저장하거나 다른 곳으로 보내지 않습니다.', en: 'The camera is used to read the writing on your medicine bottle. Photos are not saved or sent.' },
    choosePhoto: { ko: '휴대폰에 있는 사진 고르기', en: 'Choose a photo from your phone' },
    onboardingPhotos: { ko: '사진은 글씨를 읽는 데만 써요. 앱에서 찍은 사진은 읽은 뒤 바로 지우고, 휴대폰에서 고르신 사진은 지우지 않고 그대로 둬요.', en: 'Photos are used only to read the label. A photo taken in the app is deleted straight after; a photo you choose from your phone is left as it is.' },
    lookup: { ko: '어떤 약인지 확인하고 FDA 허가사항을 찾을 때는, 바코드 번호나 약 이름(약병에서 읽었거나 직접 입력하신 이름)을 미국 국립의학도서관에 보내요. 약 목록이나 사진은 보내지 않아요.', en: "To identify a medicine and find its FDA label, the app sends the U.S. National Library of Medicine the medicine's barcode number, or its name as read from the label or typed in. It never sends your list or your photos." },
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
     */
    curved: {
      title: { ko: '약병이 둥글어서 글씨 일부가 가려졌어요', en: 'The label curves round the bottle' },
      right: { ko: '몇몇 줄의 끝부분이 약병의 곡면을 따라 오른쪽으로 넘어가서 보이지 않아요. 불을 더 밝게 해도 나아지지 않아요. 오른쪽이 보이도록 약병을 천천히 돌린 뒤 다시 찍어 주세요.', en: 'The ends of some lines are out of sight on the right, round the curve. More light will not help. Turn the bottle slowly so that side faces you, and take another photo.' },
      left: { ko: '몇몇 줄의 앞부분이 약병의 곡면을 따라 왼쪽으로 넘어가서 보이지 않아요. 불을 더 밝게 해도 나아지지 않아요. 왼쪽이 보이도록 약병을 천천히 돌린 뒤 다시 찍어 주세요.', en: 'The starts of some lines are out of sight on the left, round the curve. More light will not help. Turn the bottle slowly so that side faces you, and take another photo.' },
      restWhole: { ko: '약 이름과 용량은 모두 읽었어요.', en: 'The medicine name and strength were read in full.' },
      fieldNote: { ko: '이 줄의 끝부분이 약병의 곡면에 가려 보이지 않아요. 이 부분은 약병에서 직접 읽어 주세요.', en: 'The end of this line is out of sight round the curve of the bottle. Please read it on the bottle itself.' },
      /** One line cut at the edge: withheld, but the curve is not called. */
      edgeNote: { ko: '이 줄의 끝부분이 빠졌을 수 있어요. 이 부분은 약병에서 직접 읽어 주세요.', en: 'The end of this line may be missing. Please read it on the bottle itself.' },
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
    sourcePhoto: { ko: '사진으로 읽음', en: 'Read from a photo of the label' },
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
    showEnglish: aiKorean(
      '영어도 같이 보기',
      'Show English too',
      "A switch on the Settings screen; and what a screen reader says for the small English button at the top of the result screen and of a medicine's page, which turns the same switch. On, every Korean line has its English under it, for a family member or a pharmacist; off, Korean only."
    ),
    storageNotice: untranslated(
      'Your medicines are kept on this phone only. To look a medicine up, only its name or barcode number is sent, to the U.S. National Library of Medicine; your list never is. Changing phones means adding them again.',
      "Settings screen, under the storage heading. Replaces 약 정보는 이 휴대폰 안에만 저장돼요. 다른 곳으로 보내지 않아요. 휴대폰을 바꾸면 다시 등록해야 해요., whose middle sentence is no longer true: a medicine's name is sent to look it up."
    ),
  },

  /**
   * What a medicine's FDA label says it is approved to treat, shown verbatim in
   * the label's English (`features/drugs/approved-uses`). `title` and
   * `disclaimer` are safety copy: never drafted, written by the reviewer
   * herself (2026-10-04). A change to either goes back to her undrafted.
   */
  uses: {
    title: { ko: '미국 FDA가 허가한 효능 (허가사항 영어 원문)', en: 'What it is approved to treat, from its U.S. FDA label (in English)' },
    disclaimer: { ko: '이 약은 아래에 적힌 것과 다른 이유로도 처방될 수 있어요. 아래 내용은 FDA가 허가한 효능일 뿐, 의사 선생님이 이 약을 처방하신 이유를 알려 주는 것이 아니에요.', en: "A medicine may be prescribed for reasons other than those listed here. This is the indication the FDA approved, not your doctor's reason for prescribing it to you." },
    identifiedAs: { ko: '약병 글씨로 찾은 약: {name}', en: 'Identified from its label as: {name}' },
    fromLabel: { ko: '미국 국립의학도서관 DailyMed에 있는 다음 허가사항에서 가져왔어요: {title}', en: 'From this label on DailyMed (U.S. National Library of Medicine): {title}' },
    looking: { ko: 'FDA 허가사항을 찾고 있어요…', en: 'Looking up its FDA label…' },
    unidentified: { ko: '약병에서 읽은 글씨로는 어떤 약인지 알 수 없어서, 허가받은 효능을 보여 드리지 못해요.', en: 'This medicine could not be identified from what was read on its label, so what it is approved to treat is not shown.' },
    none: { ko: '이 약의 FDA 허가사항을 찾지 못해서, 허가받은 효능을 보여 드리지 못해요.', en: 'No FDA-approved label was found for this medicine, so what it is approved to treat is not shown.' },
    formUnknown: { ko: '허가받은 효능은 알약이나 캡슐일 때만 보여 드려요. 약병에서 읽은 내용에는 알약이나 캡슐이라는 말이 없어요. 안약, 흡입기 등 다른 형태의 약은 허가사항이 따로 있고, 효능도 달라요.', en: 'What it is approved to treat is shown only for tablets and capsules, and this label does not say that it is one. Eye drops, inhalers and other forms have labels of their own, with other uses.' },
    kindUnknown: { ko: '이 약은 처방약 허가사항과 일반의약품 허가사항이 따로 있고, 효능이 서로 달라요. 약병에서 읽은 내용으로는 어느 쪽인지 알 수 없어요.', en: 'This medicine has a prescription label and an over-the-counter label, which list different uses, and what was read of the bottle does not show which it is.' },
    productUnknown: untranslated(
      'This medicine is sold as different products approved for different things, which only the brand name tells apart, and no brand name was read on the bottle.',
      "In place of the label's text, when a medicine's products of one strength are approved for different things and only the brand tells them apart: tadalafil 20 mg is CIALIS (erectile dysfunction, enlarged prostate) or ADCIRCA and ALYQ (pulmonary hypertension); bupropion SR 150 mg is WELLBUTRIN SR (depression) or ZYBAN (stopping smoking)."
    ),
    strengthUnknown: untranslated(
      'The strength on the bottle was not read. A medicine can be approved for different things at different strengths, so nothing is shown without it.',
      "In place of the label's text, when the strength was not read from the bottle (or not saved with the medicine) and the medicine is made at more than one: finasteride 1 mg is for hair loss, 5 mg for an enlarged prostate."
    ),
    releaseQuestion: untranslated(
      "Does the bottle show one of these beside the medicine's name?",
      'In place of the label\'s text, above a row of buttons each with two English letters on it (ER, XL, SR, CD, XR, CR, LA; or DR, EC), and the button uses.releaseNone. Asked when the medicine is made at the strength on the bottle both released at once and released over time, approved for different things, and nothing read from the bottle said which.'
    ),
    releaseWhy: untranslated(
      'This medicine is made in versions that work over different lengths of time, approved for different things. These letters say which one it is.',
      'Under uses.releaseQuestion. Clonidine is the example: released at once, it is for blood pressure; as clonidine ER, for ADHD.'
    ),
    releaseNone: untranslated('None of these', 'A button under the letters of uses.releaseQuestion: the bottle shows none of them.'),
    releaseAnswered: untranslated(
      'You said the bottle shows: {marker}',
      "Above the label's text, after the user tapped one of the letters ({marker} is them, in English: ER, XL...). It is the user's word, not the camera's, as uses.identifiedTypedAs says for a typed name."
    ),
    releaseAnsweredNone: untranslated(
      'You said the bottle shows none of these letters.',
      "Above the label's text, after the user tapped uses.releaseNone."
    ),
    releaseChange: untranslated('Change my answer', 'A button under uses.releaseAnswered or uses.releaseAnsweredNone: asks the question again.'),
    sourceDetails: aiKorean(
      '출처 자세히 보기',
      'Where this comes from',
      "A button beside guidance.perFdaLabel, under the label's text: shows which DailyMed label it is (uses.fromLabel), and that the medicine's name was matched per RxNorm."
    ),
    sourceDetailsHide: aiKorean('출처 접기', 'Hide where this comes from', 'The same button once uses.sourceDetails has been tapped.'),
    explanationShow: aiKorean(
      '설명 더 보기',
      "Show the label's explanation",
      "A button in the middle of the label's English text, in place of its paragraphs of background about blood pressure (the FDA's standard text for blood pressure medicines). Never in place of what the medicine is approved for, or of what it is not for: those are always shown."
    ),
    explanationHide: aiKorean('설명 접기', "Hide the label's explanation", 'The same button once uses.explanationShow has been tapped, under the paragraphs it showed.'),
    unavailable: { ko: '지금은 FDA 허가사항을 불러오지 못했어요. 인터넷 연결을 확인해 주시거나, 잠시 뒤에 다시 시도해 주세요.', en: 'Its FDA label could not be reached just now. Check the connection, or try again in a while.' },
    retry: { ko: 'FDA 허가사항 다시 찾기', en: 'Look up the FDA label again' },
    nameNotWhole: { ko: '약 이름을 다 읽지 못해서 아직 찾아볼 수 없어요. 약병에 적힌 대로 약 이름을 입력해 주시거나, 사진을 다시 찍어 주세요.', en: 'The medicine\'s name was not read whole, so it cannot be looked up yet. Type it as the bottle shows it, or take another photo.' },
    identifiedTypedAs: { ko: '입력하신 이름으로 찾은 약: {name}', en: 'Identified from the name you typed as: {name}' },
    typedUnidentified: { ko: '입력하신 이름과 똑같은 약이 없어요. 한 단어씩 약병에 적힌 것과 비교해 보세요.', en: 'No medicine has exactly the name typed. Check each word against the bottle.' },
    nameHangul: aiKorean(
      '약병에 적힌 대로 약 이름을 영어로 입력해 주세요. 약은 영어 이름으로만 찾을 수 있어요. 한글이 섞여 있으면 이름의 일부만으로 찾게 되어, 다른 약이 나올 수 있어요.',
      "Type the medicine's name in English letters, as the bottle shows it. Medicines are looked up by their English names only: with Korean in it, only part of the name could be looked up, and part of a name can find a different medicine.",
      "In place of the label's text, when the name typed (or read) has Korean letters in it: nothing is looked up. Users will often type a medicine's name in Korean; the bottle prints it in English, and only the English name can be looked up."
    ),
  },

  /**
   * Typing the medicine's name from the bottle, on the result screen, where the
   * reading could not give it whole. The name is looked up word for word, so a
   * misspelling matches nothing (`uses.typedUnidentified`).
   */
  nameEntry: {
    prompt: { ko: '약을 찾아보려면 약병에 적힌 대로 약 이름을 입력해 주세요.', en: "Type the medicine's name as the bottle shows it, to look it up." },
    inputLabel: { ko: '약병에 적힌 약 이름', en: "Medicine name, as the bottle shows it" },
    submit: { ko: '찾아보기', en: 'Look it up' },
    typedNote: { ko: '약병을 보고 직접 입력하신 이름이에요', en: 'Typed by you from the bottle' },
  },

  guidance: {
    perFdaLabel: { ko: '미국 FDA 허가사항 기준', en: 'per the FDA-approved label' },
    perRxNorm: { ko: '미국 의약품 표준 정보(RxNorm) 기준', en: 'per RxNorm' },
    perOncList: { ko: '미국 ONC 주요 상호작용 목록 기준', en: 'per the ONC high-priority list' },
    perCredibleMeds: { ko: 'CredibleMeds 기준', en: 'per CredibleMeds' },
    perMfds: untranslated(
      "Korean name per 식약처 (Korea's Ministry of Food and Drug Safety)",
      "Under a medicine's English name, beside its Korean ingredient name, which comes from 식약처's own data."
    ),
    perReviewedPhrases: { ko: '검토를 거친 문구로 옮긴 한국어예요. 위의 영어가 약국에서 인쇄한 원문이에요.', en: 'Korean from reviewed phrases. The English above is what the pharmacy printed.' },
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
    eraseIncompleteTitle: { ko: '다 지우지 못했어요', en: 'Erasing did not finish' },
    eraseIncompleteBody: { ko: '일부 정보는 이미 지워졌을 수 있어요. 끝까지 지우려면 다시 시도해 주세요.', en: 'Some of your information may already be erased. Please try again to finish.' },
    pinNotChanged: { ko: '비밀번호가 바뀌지 않았어요. 예전 비밀번호를 그대로 쓰시면 돼요. 다시 시도해 주세요.', en: 'Your PIN was not changed. Your old PIN still works. Please try again.' },
    pinNotSaved: { ko: '비밀번호를 저장하지 못했어요. 다시 정해 주세요.', en: 'Your PIN could not be saved. Please choose it again.' },
    pinCheckFailed: { ko: '지금은 비밀번호를 확인할 수 없어요. 다시 시도해 주세요.', en: 'Your PIN could not be checked just now. Please try again.' },
    editNotSaved: { ko: '고친 내용이 저장되지 않았어요. 다시 시도해 주세요.', en: 'Your changes were not saved. Please try again.' },
    confirmNotSaved: { ko: '확인 표시가 저장되지 않았어요. 다시 시도해 주세요.', en: 'It was not marked as checked. Please try again.' },
    removeFailed: { ko: '이 약을 지우지 못했어요. 아직 목록에 있어요. 다시 시도해 주세요.', en: 'This medicine could not be removed. It is still on your list. Please try again.' },
    addNotSaved: { ko: '내 약 목록에 추가되지 않았어요. 다시 시도해 주세요.', en: 'It was not added to your list. Please try again.' },
    listUnavailableTitle: { ko: '지금은 약 목록을 열 수 없어요', en: 'Your medicine list could not be opened just now' },
    listUnavailableBody: { ko: '대개 잠시 뒤면 괜찮아져요. 다시 시도해 주세요.', en: 'This is usually temporary. Please try again.' },
    listDamagedBody: { ko: '저장된 약 목록이 손상되어 열 수 없어요. 약을 다시 등록해야 해요.', en: 'Your saved medicine list is damaged and cannot be opened. You will need to add your medicines again.' },
    medicineGone: { ko: '이 약은 이제 목록에 없어요.', en: 'This medicine is no longer on your list.' },
    lockCheckFailedTitle: { ko: '휴대폰 잠금을 확인하지 못했어요', en: "Your phone's lock could not be checked" },
    lockCheckFailedBody: { ko: '다시 시도해 주세요. 계속 이러면 휴대폰을 껐다가 다시 켜 주세요.', en: 'Please try again. If this keeps happening, restart your phone.' },
    deviceUnlockFailed: { ko: '휴대폰 잠금으로 열지 못했어요. 다시 시도해 주세요.', en: 'Phone unlock did not work. Please try again.' },
    deviceUnlockOff: { ko: '지금은 휴대폰 잠금을 쓸 수 없어요. 휴대폰에 화면 잠금이 설정되어 있는지 확인한 뒤 다시 시도해 주세요.', en: 'Phone unlock is not available right now. Check that your phone still has a screen lock, then try again.' },
    lookupUnavailable: { ko: '약 정보 서비스가 지금 응답하지 않아요. 잠시 뒤에 다시 시도해 주세요.', en: 'The medicine information service is not answering right now. Please try again later.' },
    nameUnreadable: { ko: '약 이름을 읽지 못해서 등록할 수 없어요. 다시 찍어 주세요.', en: 'The medicine name could not be read, so it cannot be added. Please take another photo.' },
  },

  /**
   * Reading a label while the bottle turns, and filling in by hand what no
   * reading could recover.
   */
  sweep: {
    start: { ko: '약병을 돌리면서 읽기', en: 'Read it while turning the bottle' },
    privacy: { ko: '약병을 돌리는 동안 카메라가 글씨를 읽어요. 글씨만 남기고 사진은 남기지 않아요.', en: 'The camera reads the label as you turn it. It keeps only the words, never a picture.' },
    instructions: { ko: '약병을 카메라 앞에 들고 천천히 한 바퀴 돌려 주세요.', en: 'Hold the bottle in front of the camera and turn it slowly, all the way round.' },
    waiting: { ko: '카메라를 약병 글씨 쪽으로 비춰 주세요.', en: 'Point the camera at the label.' },
    progress: { ko: '천천히 계속 돌려 주세요. 아직 {n}줄이 잘려 있어요.', en: 'Keep turning slowly. {n} line(s) still cut off.' },
    allRead: { ko: '다 읽었어요.', en: 'All read.' },
    stalled: { ko: '한동안 새로 읽은 글씨가 없어서 카메라가 멈췄어요. 지금까지 읽은 내용이에요.', en: 'The camera stopped, because nothing new was read for a while. This is what it read.' },
    unclear: { ko: '글씨는 모두 보이지만 일부를 또렷하게 읽지 못했어요. 잠시 그대로 들고 계시거나, 멈추고 지금까지 읽은 내용을 확인해 주세요.', en: 'All of it is in view, but part could not be read clearly. Hold it still for a moment, or stop and use what was read.' },
    stop: { ko: '멈추고 읽은 내용 보기', en: 'Stop and use what was read' },
    failed: { ko: '카메라를 켜지 못했어요. 이 화면을 닫고 다시 시도해 주세요.', en: 'The camera could not start. Please close this and try again.' },
    compareWithBottle: { ko: '약병을 돌리면서 카메라로 읽은 내용이에요. 저장하기 전에 약병과 한 번 비교해 주세요.', en: 'This was read by the camera as you turned the bottle. Please compare it with the bottle once before saving.' },
    nothingTaken: { ko: '사진은 찍지 않았어요. 글씨만 남겼어요.', en: 'No picture was taken. Only the words were kept.' },
  },
  fillIn: {
    start: { ko: '빠진 부분 채우기', en: 'Fill in the missing part' },
    title: { ko: '약병에 적힌 대로 채워 주세요', en: 'Fill in what the bottle says' },
    body: { ko: '칸마다 손에 든 약병과 비교해 보시고, 빠졌거나 틀린 부분만 입력해 주세요.', en: 'Check each box against the bottle in your hand, and type only what is missing or wrong.' },
    wordLabel: { ko: '{line}번째 줄, 카메라가 읽은 글자: "{read}"', en: 'Line {line}: what the camera read as "{read}"' },
    insertLabel: { ko: '{line}번째 줄, 빠진 숫자', en: 'Line {line}: the missing number' },
    check: { ko: '맞는지 확인하기', en: 'Check' },
    confirmTitle: { ko: '약병에 적힌 내용과 같은가요?', en: 'Is this what the bottle says?' },
    confirmYes: { ko: '네, 맞아요', en: 'Yes, that is right' },
    confirmNo: { ko: '다시 고치기', en: 'Change it' },
    stillIncomplete: { ko: '아직 빠진 부분이 있어요. 칸마다 약병과 다시 비교해 주세요.', en: 'That still does not read in full. Please check each box against the bottle.' },
    filledNote: { ko: '일부는 약병을 보고 직접 입력하신 내용이에요.', en: 'You filled in part of this from the bottle.' },
    keepStart: { ko: '카메라가 이 단어의 앞부분을 읽었어요: "{read}". 이 글자는 그대로 두고, 나머지를 약병을 보고 입력해 주세요.', en: 'The camera saw how this word starts: "{read}". Keep those letters, and type the rest from the bottle.' },
    preview: { ko: '미리 보기:', en: 'It will read:' },
    repeatedAfter: { ko: '칸 바로 뒤에 이미 적혀 있는 글자예요: "{words}". 빠진 부분만 입력해 주세요.', en: '"{words}" is already there, right after the box. Type only what is missing.' },
    repeatedBefore: { ko: '칸 바로 앞에 이미 적혀 있는 글자예요: "{words}". 빠진 부분만 입력해 주세요.', en: '"{words}" is already there, just before the box. Type only what is missing.' },
    keepEnd: { ko: '카메라가 이 단어의 뒷부분을 읽었어요: "{read}". 이 글자는 그대로 두고, 앞부분을 약병을 보고 입력해 주세요.', en: 'The camera saw how this word ends: "{read}". Keep those letters, and type the start from the bottle.' },
  },

  /**
   * Dose reminders. The notification itself never names the medicine: it is
   * shown on the lock screen, and stored in the phone's scheduler outside the
   * encrypted vault. The warnings that they will not sound (`statusSilent`,
   * `statusDnd`, `statusDndNow`, `statusFocus`) are safety copy, written by
   * the reviewer herself; a change to one goes back to her undrafted.
   */
  reminders: {
    title: { ko: '복용 알림', en: 'Reminders' },
    none: { ko: '이 약은 알림이 설정되어 있지 않아요.', en: 'No reminder is set for this medicine.' },
    add: { ko: '알림 시간 추가하기', en: 'Add a reminder time' },
    saveTime: { ko: '이 시간으로 저장하기', en: 'Save this time' },
    remove: { ko: '지우기', en: 'Remove' },
    removeLabel: { ko: '{time} 알림 지우기', en: 'Remove the reminder at {time}' },
    timeFormat: { ko: '{period} {h}:{mm}', en: '{h}:{mm} {period}' },
    am: { ko: '오전', en: 'AM' },
    pm: { ko: '오후', en: 'PM' },
    hour: { ko: '시', en: 'Hour' },
    minute: { ko: '분', en: 'Minute' },
    earlier: { ko: '{field} 줄이기', en: '{field} earlier' },
    later: { ko: '{field} 늘리기', en: '{field} later' },
    presets: { ko: '자주 쓰는 시간', en: 'Common times' },
    duplicate: { ko: '이 약에는 이 시간이 이미 설정되어 있어요.', en: 'That time is already set for this medicine.' },
    tooMany: { ko: '알림 시간은 모든 약을 합쳐 {max}개까지 정할 수 있어요.', en: 'You can set up to {max} reminder times in all.' },
    saveFailed: { ko: '알림을 저장하지 못했어요. 다시 시도해 주세요.', en: 'The reminder was not saved. Please try again.' },
    askTitle: { ko: '알림을 허용해 주세요', en: 'Allow notifications for your reminders' },
    askBody: { ko: "다음 화면에서 휴대폰이 이 앱의 알림을 허용할지 물어봐요. '허용'을 눌러야 알림이 울려요. 알림에는 약 이름이 나오지 않아요.", en: 'Next, your phone will ask whether this app may send notifications. Choose Allow, or reminders cannot sound. They never show the name of your medicine.' },
    askContinue: { ko: '계속하기', en: 'Continue' },
    statusOn: { ko: '알림이 켜져 있어요. 다음 알림 시간: {time}', en: 'Reminders are on. The next one is at {time}.' },
    statusOnNoNext: { ko: '알림이 켜져 있어요.', en: 'Reminders are on.' },
    statusChecking: { ko: '알림을 확인하고 있어요', en: 'Checking your reminders' },
    statusLate: { ko: "복용 알림이 늦게 울릴 수 있어요. 제시간에 울리게 하려면 이 앱의 '알람 및 리마인더'를 허용해 주세요.", en: 'Reminders may arrive late. To make them come on time, allow "Alarms & reminders" for this app.' },
    statusBlocked: { ko: '복용 알림이 울릴 수 없어요. 이 앱의 알림이 꺼져 있어요.', en: 'Reminders cannot sound: notifications are turned off for this app.' },
    statusCategoryOff: untranslated(
      "Reminders cannot sound: medicine reminders are turned off in this app's notification settings.",
      "SAFETY STRING: not drafted. A medicine's page, and the home screen, when the phone's settings have this app's 복용 알림 (Medicine reminders) category turned off, while its notifications as a whole are on. Under it, 설정 열기 (Open settings), which opens that category's page."
    ),
    statusUnverified: { ko: '휴대폰에서 복용 알림이 설정됐는지 확인되지 않았어요. 다시 시도해 주세요.', en: 'Your phone did not confirm your reminders. Please try again.' },
    statusSilent: { ko: '복용 알림이 소리 없이 와요. 이 앱의 알림 설정에서 알림 소리가 꺼져 있어요.', en: "Reminders will come without a sound: their sound is turned off in this app's notification settings." },
    statusSet: { ko: '알림이 설정돼 있어요. 다음 알림 시간: {time}', en: 'Reminders are set. The next one is at {time}.' },
    statusSetNoNext: { ko: '알림이 설정돼 있어요.', en: 'Reminders are set.' },
    statusDnd: { ko: '방해 금지 모드가 켜져 있는 동안에는 복용 알림이 울리지 않아요. 방해 금지 모드가 언제 켜지는지 휴대폰이 이 앱에 알려 주지 않아요.', en: 'Reminders will not sound while Do Not Disturb is on, and the phone does not tell this app when it will be on.' },
    statusDndNow: { ko: '지금 방해 금지 모드가 켜져 있어서, 끌 때까지 복용 알림이 울리지 않아요.', en: 'Do Not Disturb is on now, so reminders will not sound until it is turned off.' },
    statusFocus: { ko: '방해 금지 모드나 수면 같은 집중 모드가 켜져 있을 때, 그 집중 모드에서 이 앱을 허용하지 않았다면 복용 알림이 울리지 않아요. 집중 모드가 켜져 있는지 휴대폰이 이 앱에 알려 주지 않아요.', en: 'Reminders will not sound while a Focus, such as Do Not Disturb or Sleep, is on, unless this app is allowed in it. The phone does not tell this app.' },
    letThroughDnd: { ko: '방해 금지 모드에서도 복용 알림이 울리게 하기', en: 'Let reminders sound during Do Not Disturb' },
    letThroughExplain: { ko: "다음 화면에서 '방해 금지 모드 무시' 스위치를 켜 주세요. 휴대폰에 따라 이름이 조금 다를 수 있어요. 그러면 방해 금지 모드가 켜져 있어도 복용 알림은 울려요. 전화나 다른 앱의 알림은 계속 울리지 않아요.", en: 'On the next screen, turn on the switch called "Override Do Not Disturb" (on some phones, "Ignore Do Not Disturb"). Medicine reminders will then sound even when Do Not Disturb is on. Calls and other apps stay silenced.' },
    allow: { ko: '알림 허용하기', en: 'Allow notifications' },
    openAlarmSettings: { ko: "'알람 및 리마인더' 열기", en: 'Open "Alarms & reminders"' },
    homeWarning: { ko: '지금은 복용 알림이 울릴 수 없어요.', en: 'Your medicine reminders cannot sound right now.' },
    notificationTitle: { ko: '약 드실 시간이에요', en: 'Time for your medicine' },
    notificationBody: { ko: '약 도우미를 열어서 어떤 약인지 확인해 주세요.', en: 'Open Medicine Helper to see which one.' },
    channelName: { ko: '복용 알림', en: 'Medicine reminders' },
    channelDescription: { ko: '약 드실 시간을 알려 드려요.', en: 'Reminders to take your medicines.' },
  },

  /** Heard, not seen: labels for screen readers only. */
  a11y: {
    pinProgress: { ko: '{total}자리 중 {n}자리 입력했어요', en: '{n} of {total} digits entered' },
  },

  problem: {
    captureFailed: {
      ko: '사진을 찍지 못했어요. 다시 해 볼까요?',
      en: 'The photo could not be taken. Shall we try again?',
    },
    cameraUnavailable: { ko: '카메라를 켜지 못했어요.', en: 'The camera could not start.' },
    cameraStillUnavailable: { ko: '이번에도 카메라를 켜지 못했어요. 이 화면을 닫고, 나중에 다시 시도해 주시거나 휴대폰을 껐다가 다시 켜 주세요.', en: 'The camera still could not start. Please close this, and try again later or restart your phone.' },
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
 * shows on screen instead of silently vanishing. A value written differently
 * in each language (a time: "오후 1:00", "1:00 PM") is given as both, each
 * filled into its own; it was once Korean in the English line too.
 */
export function fillTemplate(
  template: Bilingual,
  values: Record<string, string | number | { readonly ko: string; readonly en: string }>
): Bilingual {
  const fill = (text: string, language: 'ko' | 'en') =>
    text.replace(/\{([^}]+)\}/g, (match, name: string) => {
      if (!(name in values)) return match;
      const value = values[name];
      return typeof value === 'object' ? value[language] : String(value);
    });
  return { ...template, ko: fill(template.ko, 'ko'), en: fill(template.en, 'en') };
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

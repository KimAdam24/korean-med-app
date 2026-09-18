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

  result: {
    title: { ko: '읽은 내용', en: 'What we read' },
    name: { ko: '약 이름', en: 'Medicine name' },
    dosage: { ko: '용량', en: 'Dose' },
    instructions: { ko: '복용 방법', en: 'How to take it' },
    missing: { ko: '읽지 못했어요', en: 'Could not be read' },
    needsCheck: { ko: '확인이 필요해요', en: 'Please check this' },
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

/**
 * Where each string awaiting Korean appears, and when — for a translator who
 * will not have the app in front of her. `npm run copy:pending -- --export`
 * joins this to the batch.
 *
 * The order here is the export's order: sections as listed in `SECTIONS`,
 * the strings she can see in the app today first, and within a section in
 * the order a user meets them. Every pending string needs an entry; the test
 * beside this file says which are missing.
 *
 * Korean quoted in a note is an existing, reviewed string the new one sits
 * beside, given so the two can match. It is not a suggested translation.
 *
 * A string that belongs to a hidden feature (`src/features/scope.ts`) says so
 * (`hiddenWith`), and is left out of the export until the feature returns:
 * she should not spend a pass on words no one will see.
 */
import type { Scope } from '../src/features/scope.ts';

export const SECTIONS = [
  'The privacy promise, and the gallery picker',
  'What a medicine is approved to treat',
  'Reading a label: the result screen',
  'Filling in the missing part',
  'Reading the label while turning the bottle',
  'The first time the app is opened',
  "A medicine's page, and its reminders",
  "On the lock screen, and in the phone's settings",
  'Only when something goes wrong',
  'Heard only with the screen reader',
  'Not on screen yet: Korean names and directions',
] as const;

export type Section = (typeof SECTIONS)[number];

export type CopyContext = {
  readonly section: Section;
  /** The screen, and where on it. */
  readonly where: string;
  /** What makes it appear. */
  readonly when: string;
  /** Anything else she needs, beyond the note already on the string. */
  readonly notes?: string;
  /** The hidden feature it belongs to: not exported while that is hidden. */
  readonly hiddenWith?: keyof typeof Scope;
};

const PRIVACY: Section = 'The privacy promise, and the gallery picker';
const USES: Section = 'What a medicine is approved to treat';
const RESULT: Section = 'Reading a label: the result screen';
const FILL: Section = 'Filling in the missing part';
const SWEEP: Section = 'Reading the label while turning the bottle';
const FIRST: Section = 'The first time the app is opened';
const REMIND: Section = "A medicine's page, and its reminders";
const OUTSIDE: Section = "On the lock screen, and in the phone's settings";
const WRONG: Section = 'Only when something goes wrong';
const SPOKEN: Section = 'Heard only with the screen reader';
const KOREAN: Section = 'Not on screen yet: Korean names and directions';

export const COPY_CONTEXT: Readonly<Record<string, CopyContext>> = {
  // --- The privacy promise, and the gallery picker ------------------------
  'privacy.home': {
    section: PRIVACY,
    where: 'The home screen: the small line with a lock beside it, at the bottom.',
    when: 'Always. Shown now, in English until reviewed.',
    notes:
      'The current line promises photos are deleted after reading: true of the camera, untrue of a photo she already has, which the app must never delete. The promise underneath is the same for both: the photo is never kept and never sent; only the words are used. "Nor sent" is new and deliberate. Two sentences, or one?',
  },
  'privacy.pickedPhoto': {
    section: PRIVACY,
    where: "The result screen, under a reading of a photo chosen from her gallery: a small line below the medicine's details, above the 내 약으로 등록하기 (Add to my medicines) button.",
    when: 'After reading a photo she chose, in place of 사진은 지웠어요 (The photo has been deleted).',
    notes:
      'The "not deleted" is the point: someone told the app deletes photos may fear it will delete hers. Does the wording clearly mean "left untouched", and not "left lying around"?',
  },
  'privacy.cameraPermission': {
    section: PRIVACY,
    where: "On an iPhone: the phone's own question asking to let the app use the camera. Not on Android.",
    when: 'The first time the app asks for the camera, on an iPhone.',
    notes:
      "Written in 합니다체, not the app's 해요체, because it sits among the phone's own formal wording. Is that right, or should it match the app? The current wording is 약병의 글씨를 읽기 위해 카메라를 사용합니다. 사진은 저장하지 않습니다.; only the second sentence changes.",
  },
  'privacy.choosePhoto': {
    section: PRIVACY,
    where: 'The home screen: a row in the list under the 약 사진 찍기 (Take a photo of your medicine) button, between 내 약 보기 (See my medicines) and 설정 (Settings).',
    when: 'Always: the gallery picker is in the app, in English until reviewed.',
    notes: 'Opens her photos, to read a label from a photo she already took. Her photos are never changed or deleted.',
  },
  'privacy.onboardingPhotos': {
    section: PRIVACY,
    where: 'Introduction, screen 2 (약 목록은 이 휴대폰에만 있어요): the third statement, beside a camera icon.',
    when: 'The first time the app is opened. It replaces 사진은 글씨를 읽는 데만 쓰고, 읽은 뒤 바로 지워요.',
    notes:
      'The current line says every photo is deleted after reading, which is untrue of a photo the user picks from their own phone: that one is left alone. Should agree with the gallery line (고르신 사진은 그대로 둬요) and with 사진은 지웠어요 after a camera photo.',
  },
  'privacy.lookup': {
    section: PRIVACY,
    where: 'Introduction, screen 2: the fourth statement, beside a barcode icon.',
    when: 'The first time the app is opened. It replaces 바코드로 약을 찾을 때는 바코드 번호만 보내요. 약 목록이나 사진은 보내지 않아요.',
    notes:
      'What leaves the phone. It used to be only a barcode number; now a medicine read from a photo is looked up by its name, and its FDA label fetched, from the U.S. National Library of Medicine. Still never her list or her photos.',
  },

  // --- What a medicine is approved to treat ---------------------------------
  'uses.title': {
    section: USES,
    where: "The result screen after a photo or barcode, and a medicine's page: the heading of a box below the directions. Under it, in English, the words of the medicine's U.S. FDA label.",
    when: "Whenever a medicine is shown, in every state of its box: above the label's text once it is found, and above the message shown while it is looked up or when it cannot be (uses.looking, uses.unidentified, uses.none, uses.unavailable).",
    notes:
      'A safety string, so no draft: yours from the start. It must say what the English under it is (what the FDA approved the medicine to treat, from its label) and that it is in English, because that text is not translated.',
  },
  'uses.disclaimer': {
    section: USES,
    where: 'The same box: an amber note directly under the heading, before the English text of the label, so it is read first.',
    when: "Always, with the label's text, and above it.",
    notes:
      'A safety string, so no draft. It must not reassure. Two things, both plainly: a medicine may be prescribed for reasons other than those listed; and the text is what the FDA approved, not the reason their doctor prescribed it. Vitamin D2 is the example: its label lists rickets and hypoparathyroidism.',
  },
  'uses.identifiedAs': {
    section: USES,
    where: 'The same box, above the English text, for a medicine read from a photo (not a barcode).',
    when: "When the medicine's name on the label was matched to a medicine.",
    notes: 'Under it, a small 미국 의약품 표준 정보(RxNorm) 기준 (per RxNorm), already reviewed.',
  },
  'uses.fromLabel': {
    section: USES,
    where: 'The same box, under the English text: which label it came from.',
    when: "With the label's text.",
    notes: "Above it, a small 미국 FDA 허가사항 기준 (per the FDA-approved label), already reviewed. {title} is the label's name in English.",
  },
  'uses.looking': {
    section: USES,
    where: 'The same box, beside a spinning circle, in place of the text.',
    when: 'For a moment, while the label is fetched.',
  },
  'uses.unidentified': {
    section: USES,
    where: 'The same box, in place of the text.',
    when: 'When the whole name was read, but matched no medicine: a name not read whole shows uses.nameNotWhole instead.',
  },
  'uses.none': {
    section: USES,
    where: 'The same box, in place of the text.',
    when: 'When the medicine is known but has no current FDA-approved label.',
  },
  'uses.formUnknown': {
    section: USES,
    where: 'The same box, in place of the text.',
    when: "When the medicine is known by its name, but what was read of its bottle does not say it is a tablet or a capsule: it may be eye drops, an inhaler, a patch or an injection, or the word saying which was cut off.",
    notes: "Why it matters: one medicine's forms have different labels. Timolol tablets are for blood pressure; timolol eye drops, for glaucoma.",
  },
  'uses.kindUnknown': {
    section: USES,
    where: 'The same box, in place of the text.',
    when: "When the medicine is sold both on prescription and over the counter, and nothing read from the bottle says which: not a pharmacy's label (Rx number, refills, quantity, prescriber), nor an over-the-counter box's Drug Facts.",
    notes: 'Why it matters: prescription esomeprazole is approved for more than the over-the-counter one, which is for frequent heartburn only. 처방약 for prescription, 일반의약품 for over the counter, as Korean pharmacies say.',
  },
  'uses.unavailable': {
    section: USES,
    where: 'The same box, in place of the text, above the button uses.retry.',
    when: 'When the phone has no connection, or the service does not answer, whether identifying the medicine or fetching its label.',
  },
  'uses.nameNotWhole': {
    section: USES,
    where: 'The same box, in place of the text.',
    when: "When the medicine's name runs off the edge of the label, was not read clearly, or was not found: there is nothing to look up yet.",
    notes: "On the result screen, the typing box (nameEntry.prompt) is just above; on a medicine's page, the 고치기 (Edit) button.",
  },
  'uses.identifiedTypedAs': {
    section: USES,
    where: 'The same box, above the English text, for a name the user typed.',
    when: 'When a typed name was matched to a medicine.',
    notes: 'The same shape as uses.identifiedAs, which is for a name read from the label.',
  },
  'uses.typedUnidentified': {
    section: USES,
    where: 'The same box, in place of the text.',
    when: 'When a typed name matches no medicine word for word, as a misspelling does.',
  },
  'uses.retry': {
    section: USES,
    where: 'The same box: a button under uses.unavailable.',
    when: 'With uses.unavailable.',
    notes: 'Not the same words as 다시 시도하기 (Try again), which the reminders already use on the same page.',
  },

  // --- Reading a label: the result screen ---------------------------------
  'nameEntry.prompt': {
    section: RESULT,
    where: 'The result screen, just under the medicine name and strength: above a typing box, prefilled with what was read.',
    when: 'When the name was cut off at the edge, not read clearly, or not found.',
  },
  'nameEntry.submit': {
    section: RESULT,
    where: 'The same: the button under the typing box.',
    when: 'With nameEntry.prompt.',
  },
  'nameEntry.typedNote': {
    section: RESULT,
    where: 'Under the medicine name, once the user has typed it.',
    when: 'After a name is typed: it says the name came from them, not the photo.',
  },
  'result.curved.title': {
    section: RESULT,
    where: 'Result screen, after a photo of a label: the heading of an amber notice near the top.',
    when: 'The photo shows lines of text running out of sight round a curved bottle.',
    notes: 'Explains why part of the label could not be read. Calm and factual; it is not the user\'s fault.',
  },
  'result.curved.right': {
    section: RESULT,
    where: 'Result screen: the text of the same amber notice, under its heading.',
    when: 'The lines are cut off on the right-hand side.',
    notes: '"Take another photo" should match the button below it, 다시 찍기 (Take another photo).',
  },
  'result.curved.left': {
    section: RESULT,
    where: 'Result screen: the text of the same amber notice, under its heading.',
    when: 'The lines are cut off on the left-hand side (their beginnings are missing).',
    notes: 'The mirror of the right-hand version; the two should read alike.',
  },
  'result.curved.restWhole': {
    section: RESULT,
    where: 'Result screen: one more line inside the same amber notice.',
    when: 'Only the directions were cut off; the name and strength were read in full.',
    notes: 'Reassurance. The fields on this screen are labelled 약 이름 (Medicine name) and 용량 (Dose).',
  },
  'result.curved.fieldNote': {
    section: RESULT,
    where: 'Result screen: shown in place of one field, usually the directions, which are labelled 복용 방법 (How to take it).',
    when: 'That field runs round the curve of the bottle, so its end could not be seen.',
    notes: 'Tells the user to read that part on the bottle instead.',
  },
  'result.curved.edgeNote': {
    section: RESULT,
    where: 'Result screen: shown in place of one field.',
    when: 'A line stops at the edge of the photo, but the label was not judged to be curved.',
  },
  'sweep.start': {
    section: RESULT,
    where: 'Result screen: a large button just under the curved-label notice.',
    when: 'The curved-label notice is shown, on Android phones.',
    notes: 'Opens the camera again to read the label while the user slowly turns the bottle in her hand. A short action, like the other buttons.',
  },
  'fillIn.start': {
    section: RESULT,
    where: "Result screen: a button under the medicine's details.",
    when: 'A field was found but could not be read in full: a word is broken or cut off.',
    notes: 'Opens a screen where the user types just the missing words from the bottle (next section).',
  },
  'failure.nameUnreadable': {
    section: RESULT,
    where: 'Result screen: shown where the "Add to my medicines" button (내 약으로 등록하기) would be.',
    when: 'The medicine name could not be read, so the reading cannot be saved.',
    notes: '"Take another photo" should match the button 다시 찍기.',
  },

  // --- Filling in the missing part ----------------------------------------
  'fillIn.title': {
    section: FILL,
    where: 'The fill-in screen: its heading.',
    when: 'After pressing "Fill in the missing part" on the result screen.',
  },
  'fillIn.body': {
    section: FILL,
    where: 'The fill-in screen: the instruction under the heading.',
    when: 'Always, on that screen.',
    notes: "Below it the line is shown as the camera read it, with a box wherever a word is missing or broken. The boxes start with what the camera read, so the user corrects them.",
  },
  'fillIn.check': {
    section: FILL,
    where: 'The fill-in screen: the button under the boxes.',
    when: 'Always, on that screen.',
    notes: 'Checks whether the typed words make the directions complete.',
  },
  'fillIn.stillIncomplete': {
    section: FILL,
    where: 'The fill-in screen: an amber warning above the Check button.',
    when: 'After pressing Check, if the result still does not read as complete.',
  },
  'fillIn.confirmTitle': {
    section: FILL,
    where: 'The next step of the fill-in screen: its heading, above the completed text.',
    when: 'After pressing Check, when the result reads as complete.',
    notes: 'Asks the user to compare the completed text with the bottle before it is used.',
  },
  'fillIn.confirmYes': {
    section: FILL,
    where: 'Under the completed text: the main button.',
    when: 'On that confirmation step.',
    notes: 'Accepts the text. Compare the reviewed 맞아요, 확인했어요 (Yes, I checked it) used on a medicine\'s page.',
  },
  'fillIn.confirmNo': {
    section: FILL,
    where: 'Under the completed text: the second button.',
    when: 'On that confirmation step.',
    notes: 'Goes back to the boxes to change what was typed.',
  },
  'fillIn.keepStart': {
    section: FILL,
    hiddenWith: 'fillIn',
    where: 'The fill-in screen: an amber warning above the Check button.',
    when: 'After pressing Check, if an answer leaves out the start of a word that the camera did see, e.g. "7" typed where the box held "eve" (of "every 7").',
    notes: 'It tells the reader to keep the letters already in the box and add the rest. {read} is shown exactly as the camera read it.',
  },
  'fillIn.preview': {
    section: FILL,
    hiddenWith: 'fillIn',
    where: 'The fill-in screen: a small heading in a grey box under the boxes, above the directions as they will read.',
    when: 'Always, on that screen; the text under it changes as the reader types.',
  },
  'fillIn.repeatedAfter': {
    section: FILL,
    hiddenWith: 'fillIn',
    where: 'The fill-in screen: an amber warning above the Check button.',
    when: 'After pressing Check, if an answer repeats words that already follow its box, e.g. "(50,000 units)" typed where "units)" comes next.',
  },
  'fillIn.repeatedBefore': {
    section: FILL,
    hiddenWith: 'fillIn',
    where: 'The fill-in screen: an amber warning above the Check button.',
    when: 'After pressing Check, if an answer repeats words that already come just before its box.',
  },
  'fillIn.keepEnd': {
    section: FILL,
    hiddenWith: 'fillIn',
    where: 'The fill-in screen: an amber warning above the Check button.',
    when: 'The same, for a word cut off at the start of a line, e.g. an answer that drops the "ke" of "Take".',
  },
  'fillIn.filledNote': {
    section: FILL,
    where: 'Result screen: a small blue notice near the top.',
    when: "After the user's typed words were accepted.",
    notes: 'A reminder that part of what is shown came from her typing, not from the camera.',
  },

  // --- Reading the label while turning the bottle -------------------------
  'sweep.privacy': {
    section: SWEEP,
    where: 'The camera screen for reading while turning: a banner at the top, over the camera view.',
    when: 'The whole time the camera is reading.',
    notes: 'The ordinary camera screen\'s banner says 사진은 저장되지 않아요 (Photos are not saved); this one should sit comfortably beside it.',
  },
  'sweep.instructions': {
    section: SWEEP,
    where: 'The same camera screen: large text near the bottom.',
    when: 'The whole time the camera is reading.',
  },
  'sweep.waiting': {
    section: SWEEP,
    where: 'The same camera screen: a status line under the instructions.',
    when: 'Before the camera has seen the label.',
  },
  'sweep.progress': {
    section: SWEEP,
    where: 'The same camera screen: the status line.',
    when: 'While reading, when some lines are still cut off. It changes as the count goes down.',
    notes: '"line(s)": Korean needs no plural here.',
  },
  'sweep.unclear': {
    section: SWEEP,
    where: 'The same camera screen: the status line.',
    when: 'Every line is in view, but part of the text still cannot be read clearly.',
  },
  'sweep.allRead': {
    section: SWEEP,
    where: 'The same camera screen: the status line.',
    when: 'For a moment when everything has been read, just before the result is shown.',
  },
  'sweep.stop': {
    section: SWEEP,
    where: 'The same camera screen: a large button at the bottom.',
    when: 'Once some of the label has been read.',
    notes: 'Ends the reading and shows what was read so far. Beside it is 취소 (Cancel).',
  },
  'sweep.failed': {
    section: SWEEP,
    where: 'The same camera screen: the status line.',
    when: 'The camera could not start.',
    notes: '"Close this" means the 취소 (Cancel) button beside it.',
  },
  'sweep.stalled': {
    section: SWEEP,
    where: 'Result screen: a small blue notice near the top.',
    when: 'The reading stopped by itself after 20 seconds in which nothing new was read.',
    notes: 'The screen changed without the user pressing anything; this says why.',
  },
  'sweep.compareWithBottle': {
    section: SWEEP,
    where: "Result screen: the blue notice above the medicine's details.",
    when: 'After a reading made by turning the bottle.',
    notes: 'The same request as 사진으로 읽은 내용이에요. 저장하기 전에 약병과 한 번 비교해 주세요. (This was read from a photo...), which a photo reading shows; this one cannot say "photo".',
  },
  'sweep.nothingTaken': {
    section: SWEEP,
    where: 'Result screen: a small line near the bottom.',
    when: 'After a reading made by turning the bottle.',
    notes: 'Takes the place of 사진은 지웠어요 (The photo has been deleted), because no photo was taken at all.',
  },

  // --- The first time the app is opened -----------------------------------
  'onboarding.step': {
    section: FIRST,
    where: 'The three introduction screens: a small label at the top of each.',
    when: 'The first time the app is opened. It reads "Step 1 of 3", "Step 2 of 3", "Step 3 of 3".',
  },
  'onboarding.welcomeTitle': {
    section: FIRST,
    where: 'Introduction, screen 1: the heading.',
    when: 'The first time the app is opened.',
  },
  'onboarding.welcomeBody': {
    section: FIRST,
    where: 'Introduction, screen 1: the main text under the heading.',
    when: 'The first time the app is opened.',
    notes: '"The strength" is the field labelled 용량 (Dose); "the directions" is 복용 방법 (How to take it).',
  },
  'onboarding.welcomeCheck': {
    section: FIRST,
    where: 'Introduction, screen 1: smaller text under the main text.',
    when: 'The first time the app is opened.',
  },
  'onboarding.next': {
    section: FIRST,
    where: 'Introduction, screens 1 and 2: the main button.',
    when: 'The first time the app is opened.',
  },
  'onboarding.storageTitle': {
    section: FIRST,
    where: 'Introduction, screen 2: the heading.',
    when: 'The first time the app is opened.',
  },
  'onboarding.storageLocked': {
    section: FIRST,
    where: 'Introduction, screen 2: the first of four statements in a box, beside a lock icon.',
    when: 'The first time the app is opened.',
  },
  'onboarding.storageNoBackup': {
    section: FIRST,
    where: 'Introduction, screen 2: the second statement, beside a phone icon.',
    when: 'The first time the app is opened.',
  },
  'onboarding.storagePhotos': {
    section: FIRST,
    where: 'Introduction, screen 2: the third statement, beside a camera icon.',
    when: 'The first time the app is opened.',
    notes: 'After a photo is read, the app says 사진은 지웠어요 (The photo has been deleted); the two should agree.',
  },
  'onboarding.storageLookup': {
    section: FIRST,
    where: 'Introduction, screen 2: the fourth statement, beside a barcode icon.',
    when: 'The first time the app is opened.',
  },
  'onboarding.back': {
    section: FIRST,
    where: 'Introduction, screens 2 and 3: the second button, under the main one.',
    when: 'The first time the app is opened.',
  },
  'onboarding.cameraTitle': {
    section: FIRST,
    where: 'Introduction, screen 3: the heading.',
    when: 'The first time the app is opened.',
  },
  'onboarding.cameraBody': {
    section: FIRST,
    where: 'Introduction, screen 3: the text under the heading.',
    when: 'The phone has not yet been asked whether the app may use the camera.',
    notes: 'The camera screen\'s own button for this is 네, 허용할게요 (Yes, allow the camera).',
  },
  'onboarding.askCamera': {
    section: FIRST,
    where: 'Introduction, screen 3: the main button.',
    when: 'The phone has not yet been asked about the camera.',
    notes: "Pressing it opens the phone's own question about the camera.",
  },
  'onboarding.notNow': {
    section: FIRST,
    where: 'Introduction, screen 3: the second button. Also on a medicine\'s page, beside "Continue" when asking about notifications.',
    when: 'The phone has not yet been asked (about the camera, or notifications).',
    notes: 'Skips the question for now; it can be answered later.',
  },
  'onboarding.cameraReady': {
    section: FIRST,
    where: 'Introduction, screen 3: the text under the heading.',
    when: 'The camera was already allowed (for example, when the app is installed again).',
  },
  'onboarding.cameraOff': {
    section: FIRST,
    where: 'Introduction, screen 3: the text under the heading.',
    when: 'The camera was refused before, so the app cannot ask again.',
  },
  'onboarding.start': {
    section: FIRST,
    where: 'Introduction, screen 3: the main button.',
    when: 'The camera is already allowed or already refused. It ends the introduction and opens the app.',
  },

  // --- A medicine's page, and its reminders --------------------------------
  'reminders.statusSilent': {
    section: REMIND,
    where: "A medicine's page, under its reminder times: an amber warning, with 설정 열기 (Open settings) under it. On the home screen, the body of 지금은 복용 알림이 울릴 수 없어요 (Your medicine reminders cannot sound right now).",
    when: "When the phone's own settings have the reminders' sound turned off: they would still appear, silently.",
    notes: 'A safety string, so no draft: a reminder that does not sound is a missed dose. Beside it are her 복용 알림이 울릴 수 없어요. 이 앱의 알림이 꺼져 있어요. (notifications off) and 복용 알림이 늦게 울릴 수 있어요... (may be late).',
  },
  'reminders.statusSet': {
    section: REMIND,
    where: "A medicine's page, under its reminder times.",
    when: "When the reminders are scheduled, but the app cannot tell whether Do Not Disturb will let them sound: in place of her 알림이 켜져 있어요. 다음 알림 시간: {time} (Reminders are on), which says more than the app knows.",
    notes: '{time} is written as elsewhere, e.g. 오전 8:00. "Set", not "on": they are scheduled, and may still be silenced.',
  },
  'reminders.statusSetNoNext': {
    section: REMIND,
    where: "A medicine's page, under its reminder times.",
    when: 'As reminders.statusSet, when the phone gave no next time.',
  },
  'reminders.statusDnd': {
    section: REMIND,
    where: "A medicine's page, under reminders.statusSet: an amber warning, with reminders.letThroughDnd under it.",
    when: "Android, when the reminders are not let through Do Not Disturb (방해 금지 모드), as on a phone where nobody has changed it.",
    notes: 'A safety string, so no draft: a reminder silenced overnight by a Do Not Disturb schedule is a missed dose, and nothing on the phone shows it happened.',
  },
  'reminders.statusDndNow': {
    section: REMIND,
    where: "A medicine's page, and the home screen as the body of 지금은 복용 알림이 울릴 수 없어요 (Your medicine reminders cannot sound right now).",
    when: 'Android, while Do Not Disturb is on and would silence the reminders.',
    notes: 'A safety string, so no draft.',
  },
  'reminders.statusFocus': {
    section: REMIND,
    where: "A medicine's page, under reminders.statusSet.",
    when: 'iPhone, always: a Focus (집중 모드), such as Do Not Disturb or Sleep, silences reminders unless the app is allowed in it, and the app cannot tell.',
    notes: 'A safety string, so no draft. There is no button under it.',
  },
  'reminders.letThroughDnd': {
    section: REMIND,
    where: 'A button under reminders.statusDnd.',
    when: 'Android, when the reminders are not let through Do Not Disturb.',
    notes: 'Explains first (reminders.letThroughExplain); nothing opens until 계속하기 (Continue).',
  },
  'reminders.letThroughExplain': {
    section: REMIND,
    where: "Under reminders.letThroughDnd, once it is pressed, above 계속하기 (Continue) and 나중에 할게요 (Not now).",
    when: "Before the phone's settings open, at the page for the reminders alone.",
    notes: "The switch's name depends on the phone: on Google's phones \"Override Do Not Disturb\", on Samsung's \"Ignore Do Not Disturb\". Worth checking the Korean name on a real phone.",
  },
  'medications.sourcePhoto': {
    section: REMIND,
    where: "A medicine's page, near the bottom: the line under 등록 방법 (How it was added).",
    when: 'For a medicine that was read from a photo of its label.',
  },
  'reminders.title': {
    section: REMIND,
    where: "Each medicine's page: the heading of the reminders box.",
    when: "Always, on a medicine's page.",
  },
  'reminders.none': {
    section: REMIND,
    where: 'The reminders box: under the heading.',
    when: 'No reminder time has been set for this medicine.',
  },
  'reminders.add': {
    section: REMIND,
    where: 'The reminders box: a button at the bottom.',
    when: 'Always, unless a time is being chosen.',
    notes: 'Opens the time picker.',
  },
  'reminders.hour': {
    section: REMIND,
    where: 'The time picker: the label of the hour row, which has a minus and a plus button.',
    when: 'While choosing a reminder time.',
  },
  'reminders.minute': {
    section: REMIND,
    where: 'The time picker: the label of the minute row.',
    when: 'While choosing a reminder time.',
  },
  'reminders.am': {
    section: REMIND,
    where: 'The time picker: one of two choice buttons. Also part of every time written in the app.',
    when: 'While choosing a reminder time, and wherever a time is shown.',
  },
  'reminders.pm': {
    section: REMIND,
    where: 'The time picker: the other choice button. Also part of every time written in the app.',
    when: 'While choosing a reminder time, and wherever a time is shown.',
  },
  'reminders.timeFormat': {
    section: REMIND,
    where: 'Every reminder time in the app: the large time in the picker, the list of set times, the "next one is at" line, and the ready-made time buttons.',
    when: 'Wherever a reminder time is shown.',
    notes: 'This is a pattern, not a sentence: keep {h}, {mm} and {period} exactly as they are, and only put them in the order Korean uses.',
  },
  'reminders.presets': {
    section: REMIND,
    where: 'The time picker: a small label above four ready-made times (8:00 AM, 12:00 PM, 6:00 PM, 9:00 PM).',
    when: 'While choosing a reminder time.',
  },
  'reminders.saveTime': {
    section: REMIND,
    where: 'The time picker: the main button under it.',
    when: 'While choosing a reminder time.',
    notes: 'Beside it is 취소 (Cancel). The app\'s general save button is 저장하기 (Save).',
  },
  'reminders.remove': {
    section: REMIND,
    where: 'The reminders box: a small button beside each set time.',
    when: 'At least one time is set.',
    notes: 'Removes that one time only. Removing a medicine from the list is 목록에서 지우기 (Remove from my list).',
  },
  'reminders.askTitle': {
    section: REMIND,
    where: 'The reminders box: a heading that appears in it.',
    when: 'The first time a reminder time is saved, before the phone asks about notifications.',
  },
  'reminders.askBody': {
    section: REMIND,
    where: 'The reminders box: under that heading.',
    when: 'The first time a reminder time is saved.',
    notes: '"Allow" should match the word on the phone\'s own notification question.',
  },
  'reminders.askContinue': {
    section: REMIND,
    where: 'The reminders box: the main button under that text.',
    when: 'The first time a reminder time is saved.',
    notes: "Opens the phone's own question. Beside it is \"Not now\" (onboarding.notNow, in this batch).",
  },
  'reminders.statusChecking': {
    section: REMIND,
    where: 'The reminders box: under the list of times, with a small spinning wheel.',
    when: 'For a moment, while the app checks the reminders with the phone.',
  },
  'reminders.statusOn': {
    section: REMIND,
    where: 'The reminders box: a small line under the list of times.',
    when: 'Reminders are set and working.',
    notes: '{time} is written using the time pattern above, for example 8:00 AM.',
  },
  'reminders.statusOnNoNext': {
    section: REMIND,
    where: 'The reminders box: the same line.',
    when: 'Reminders are working, but the time of the next one is not known.',
  },
  'reminders.duplicate': {
    section: REMIND,
    where: 'The reminders box: an amber warning.',
    when: 'After pressing "Save this time", if that time is already set.',
  },
  'reminders.tooMany': {
    section: REMIND,
    where: 'The reminders box: an amber warning.',
    when: 'After pressing "Save this time", if the limit has been reached.',
    notes: '{max} is a number (48), counted across all medicines.',
  },
  'reminders.saveFailed': {
    section: REMIND,
    where: 'The reminders box: an amber warning.',
    when: 'Saving a reminder time failed.',
  },
  'reminders.statusLate': {
    section: REMIND,
    where: 'The reminders box: an amber warning under the times. Also on the home screen, under the home warning below.',
    when: 'The phone may deliver reminders late, because an Android setting is off.',
  },
  'reminders.openAlarmSettings': {
    section: REMIND,
    where: 'Inside that warning: a button.',
    when: 'With the warning above.',
    notes: "Opens that Android setting. Use the Korean name the phone gives the setting.",
  },
  'reminders.statusBlocked': {
    section: REMIND,
    where: 'The reminders box: an amber warning. Also on the home screen.',
    when: 'Notifications are turned off for this app, so reminders cannot sound.',
  },
  'reminders.allow': {
    section: REMIND,
    where: 'Inside that warning: a button.',
    when: 'Notifications are off and the phone can still ask. Otherwise the button is 설정 열기 (Open settings).',
  },
  'reminders.statusUnverified': {
    section: REMIND,
    where: 'The reminders box: an amber warning. Also on the home screen.',
    when: 'The phone did not confirm that the reminders are set.',
    notes: 'The button with it is 다시 시도하기 (Try again).',
  },
  'reminders.homeWarning': {
    section: REMIND,
    where: 'The home screen: the heading of an amber warning.',
    when: 'Only when reminders cannot sound. The reason (one of the three warnings above) appears under it.',
  },

  // --- On the lock screen, and in the phone's settings ---------------------
  'reminders.notificationTitle': {
    section: OUTSIDE,
    where: "The reminder notification, on the phone's lock screen and notification list: its first line.",
    when: 'At each reminder time.',
  },
  'reminders.notificationBody': {
    section: OUTSIDE,
    where: 'The reminder notification: its second line.',
    when: 'At each reminder time.',
    notes: 'Deliberately does not name the medicine, since anyone can see a lock screen.',
  },
  'reminders.channelName': {
    section: OUTSIDE,
    where: "The phone's Settings, under this app's notifications: the name of this kind of notification.",
    when: 'Only if the user goes into the phone\'s settings.',
  },
  'reminders.channelDescription': {
    section: OUTSIDE,
    where: "The phone's Settings: the description under that name.",
    when: "Only if the user goes into the phone's settings.",
  },

  // --- Only when something goes wrong -------------------------------------
  'problem.cameraUnavailable': {
    section: WRONG,
    where: 'The camera screen: the message, with a 다시 시도하기 (Try again) button.',
    when: 'The camera itself would not open. No photo was taken.',
  },
  'problem.cameraStillUnavailable': {
    section: WRONG,
    where: 'The camera screen: the message, with only a 닫기 (Close) button.',
    when: 'The camera failed to open a second time in a row.',
  },
  'failure.lookupUnavailable': {
    section: WRONG,
    where: 'After scanning a barcode: the message on screen, with a 다시 시도하기 (Try again) button.',
    when: 'The US medicine information service does not answer.',
  },
  'failure.addNotSaved': {
    section: WRONG,
    where: 'After pressing 내 약으로 등록하기 (Add to my medicines): the message under the heading 저장하지 못했어요 (We could not save it).',
    when: 'Saving the medicine failed.',
  },
  'failure.listUnavailableTitle': {
    section: WRONG,
    where: 'The medicine list or a medicine\'s page: a full-screen heading.',
    when: 'The list cannot be opened just now, for a reason expected to pass.',
  },
  'failure.listUnavailableBody': {
    section: WRONG,
    where: 'Under that heading, with a 다시 시도하기 (Try again) button.',
    when: 'As above.',
  },
  'failure.listDamagedBody': {
    section: WRONG,
    where: 'A full screen, under the heading 저장된 약 정보를 열 수 없어요 (Your saved medicine information cannot be opened).',
    when: 'The list saved on this phone is damaged and cannot be read.',
  },
  'failure.editNotSaved': {
    section: WRONG,
    where: "A medicine's page, while editing: a message above the 저장하기 (Save) button.",
    when: 'Saving the changes failed.',
  },
  'failure.confirmNotSaved': {
    section: WRONG,
    where: "A medicine's page: a message.",
    when: 'After pressing 맞아요, 확인했어요 (Yes, I checked it), if that could not be saved.',
    notes: '"Marked as checked" refers to that button.',
  },
  'failure.removeFailed': {
    section: WRONG,
    where: "A medicine's page: a message.",
    when: 'After confirming 목록에서 지우기 (Remove from my list), if removing failed.',
  },
  'failure.medicineGone': {
    section: WRONG,
    where: 'A full-screen heading, with a 닫기 (Close) button.',
    when: 'Opening a medicine that has already been removed.',
  },
  'failure.pinCheckFailed': {
    section: WRONG,
    where: 'The lock screen, or Settings > 비밀번호 바꾸기 (Change your PIN): a message above the number pad.',
    when: 'The saved PIN could not be checked. This is not a wrong PIN.',
    notes: 'This app calls the PIN 비밀번호.',
  },
  'failure.pinNotSaved': {
    section: WRONG,
    where: 'Choosing a PIN when the app is first set up: a message above the number pad.',
    when: 'The new PIN could not be saved; the screen goes back to 비밀번호를 정해 주세요 (Please choose a PIN).',
  },
  'failure.pinNotChanged': {
    section: WRONG,
    where: 'Settings > 비밀번호 바꾸기 (Change your PIN): a message above the number pad.',
    when: 'The new PIN could not be saved.',
  },
  'failure.deviceUnlockFailed': {
    section: WRONG,
    where: 'The lock screen, or Settings > 비밀번호를 잊으셨나요? (Forgotten your PIN?): a message.',
    when: "Opening the app with the phone's own lock (fingerprint, face or the phone's own code) failed.",
  },
  'failure.deviceUnlockOff': {
    section: WRONG,
    where: 'The same places: a message.',
    when: "The phone's own lock cannot be used right now, for example because it was turned off.",
  },
  'failure.lockCheckFailedTitle': {
    section: WRONG,
    where: 'A full-screen heading when the app opens, with a 다시 시도하기 (Try again) button.',
    when: "The app could not check the phone's lock, even after trying again.",
  },
  'failure.lockCheckFailedBody': {
    section: WRONG,
    where: 'Under that heading.',
    when: 'As above.',
  },
  'failure.eraseIncompleteTitle': {
    section: WRONG,
    where: 'Settings > 내 정보 모두 지우기 (Erase everything): an amber warning heading.',
    when: 'Erasing stopped partway.',
  },
  'failure.eraseIncompleteBody': {
    section: WRONG,
    where: 'Under that heading.',
    when: 'As above.',
  },

  // --- Heard only with the screen reader ----------------------------------
  'a11y.pinProgress': {
    section: SPOKEN,
    where: 'Spoken while typing a PIN on the number pad. Never shown.',
    when: 'After each digit, for someone using the screen reader (TalkBack).',
  },
  'fillIn.wordLabel': {
    section: SPOKEN,
    where: 'Spoken for one box on the fill-in screen. Never shown.',
    when: 'When the screen reader reaches that box.',
    notes: '{line} is a line number; {read} is what the camera read there, often a broken word, and is read out as it is.',
  },
  'fillIn.insertLabel': {
    section: SPOKEN,
    where: 'Spoken for an empty box on the fill-in screen. Never shown.',
    when: 'When the screen reader reaches that box.',
    notes: 'The box is for a missing number, as in "every _ days".',
  },
  'reminders.removeLabel': {
    section: SPOKEN,
    where: 'Spoken for the "Remove" button beside a reminder time. Never shown.',
    when: 'When the screen reader reaches that button.',
  },
  'reminders.earlier': {
    section: SPOKEN,
    where: 'Spoken for the minus button in the time picker. Never shown.',
    when: 'When the screen reader reaches that button.',
    notes: '{field} will be the Korean for "Hour" or "Minute" from this batch.',
  },
  'guidance.perMfds': {
    section: KOREAN,
    hiddenWith: 'koreanDrugNames',
    where: "A medicine's page: a small line under the medicine's Korean name, which sits under its English name.",
    when: "Once 식약처's Korean ingredient names are imported, for a medicine identified by its barcode. Not yet.",
    notes: 'It names where the Korean name came from. The other sources in the app read, e.g., 미국 FDA 허가사항 기준 (per the FDA-approved label).',
  },
  'guidance.perReviewedPhrases': {
    section: KOREAN,
    where: 'The result screen and a medicine\'s page: a small line under the Korean directions, which sit under the English ones.',
    when: 'Once she has approved the dosing phrases, for directions made wholly of approved phrases. Not yet.',
    notes: 'It says the Korean was put together from phrases she reviewed, and that the English is the original.',
  },
  'nameEntry.inputLabel': {
    section: SPOKEN,
    where: 'The typing box for the medicine name, on the result screen.',
    when: 'Read out when the box is reached.',
  },
  'reminders.later': {
    section: SPOKEN,
    where: 'Spoken for the plus button in the time picker. Never shown.',
    when: 'When the screen reader reaches that button.',
    notes: '{field} will be the Korean for "Hour" or "Minute" from this batch.',
  },
};

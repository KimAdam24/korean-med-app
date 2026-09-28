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
 */
export const SECTIONS = [
  'Reading a label: the result screen',
  'Filling in the missing part',
  'Reading the label while turning the bottle',
  'The first time the app is opened',
  "A medicine's page: reminders",
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
};

const RESULT: Section = 'Reading a label: the result screen';
const FILL: Section = 'Filling in the missing part';
const SWEEP: Section = 'Reading the label while turning the bottle';
const FIRST: Section = 'The first time the app is opened';
const REMIND: Section = "A medicine's page: reminders";
const OUTSIDE: Section = "On the lock screen, and in the phone's settings";
const WRONG: Section = 'Only when something goes wrong';
const SPOKEN: Section = 'Heard only with the screen reader';
const KOREAN: Section = 'Not on screen yet: Korean names and directions';

export const COPY_CONTEXT: Readonly<Record<string, CopyContext>> = {
  // --- Reading a label: the result screen ---------------------------------
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
    where: 'The fill-in screen: an amber warning above the Check button.',
    when: 'After pressing Check, if an answer leaves out the start of a word that the camera did see, e.g. "7" typed where the box held "eve" (of "every 7").',
    notes: 'It tells the reader to keep the letters already in the box and add the rest. {read} is shown exactly as the camera read it.',
  },
  'fillIn.keepEnd': {
    section: FILL,
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

  // --- A medicine's page: reminders ---------------------------------------
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
  'reminders.later': {
    section: SPOKEN,
    where: 'Spoken for the plus button in the time picker. Never shown.',
    when: 'When the screen reader reaches that button.',
    notes: '{field} will be the Korean for "Hour" or "Minute" from this batch.',
  },
};

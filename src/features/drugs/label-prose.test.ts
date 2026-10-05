/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { isBackground, labelParts } from './label-prose.ts';

/** A lisinopril and hydrochlorothiazide label's Indications, as DailyMed gives it. */
const USE =
  'Lisinopril and hydrochlorothiazide tablets are indicated for the treatment of hypertension, to lower blood pressure. Lowering blood pressure lowers the risk of fatal and non-fatal cardiovascular events, primarily strokes and myocardial infarctions. These benefits have been seen in controlled trials of antihypertensive drugs from a wide variety of pharmacologic classes including lisinopril and hydrochlorothiazide.';
const BACKGROUND = [
  'Control of high blood pressure should be part of comprehensive cardiovascular risk management, including, as appropriate, lipid control, diabetes management, antithrombotic therapy, smoking cessation, exercise, and limited sodium intake. Many patients will require more than 1 drug to achieve blood pressure goals. For specific advice on goals and management, see published guidelines, such as those of the National High Blood Pressure Education Program’s Joint National Committee on Prevention, Detection, Evaluation, and Treatment of High Blood Pressure (JNC).',
  'Numerous antihypertensive drugs, from a variety of pharmacologic classes and with different mechanisms of action, have been shown in randomized controlled trials to reduce cardiovascular morbidity and mortality, and it can be concluded that it is blood pressure reduction, and not some other pharmacologic property of the drugs, that is largely responsible for those benefits. The largest and most consistent cardiovascular outcome benefit has been a reduction in the risk of stroke, but reductions in myocardial infarction and cardiovascular mortality also have been seen regularly.',
  'Elevated systolic or diastolic pressure causes increased cardiovascular risk, and the absolute risk increase per mmHg is greater at higher blood pressures, so that even modest reductions of severe hypertension can provide substantial benefit. Relative risk reduction from blood pressure reduction is similar across populations with varying absolute risk, so the absolute benefit is greater in patients who are at higher risk independent of their hypertension (for example, patients with diabetes or hyperlipidemia), and such patients would be expected to benefit from more aggressive treatment to a lower blood pressure goal.',
  'Some antihypertensive drugs have smaller blood pressure effects (as monotherapy) in black patients, and many antihypertensive drugs have additional approved indications and effects (e.g., on angina, heart failure, or diabetic kidney disease). These considerations may guide selection of therapy.',
];
const AFTER = [
  'These fixed-dose combinations are not indicated for initial therapy (see DOSAGE AND ADMINISTRATION).',
  'In using lisinopril and hydrochlorothiazide tablets, consideration should be given to the fact that an angiotensin converting enzyme inhibitor, captopril, has caused agranulocytosis, particularly in patients with renal impairment or collagen vascular disease, and that available data are insufficient to show that lisinopril does not have a similar risk. (See WARNINGS.)',
];
const LABEL = [USE, ...BACKGROUND, ...AFTER].join('\n');

test("the FDA's background on blood pressure folds away as one part, and the uses and limits around it stay", () => {
  const parts = labelParts(LABEL);
  assert.deepEqual(
    parts.map((part) => part.background),
    [false, true, false]
  );
  assert.equal(parts[1].text, BACKGROUND.join('\n') + '\n');
  // The use before it, and "not indicated for initial therapy" after it.
  assert.ok(parts[0].text.startsWith(USE));
  assert.ok(parts[2].text.startsWith(AFTER[0]));
});

test('the parts, joined, are the text: nothing reworded, reordered or dropped', () => {
  for (const text of [LABEL, `\n${LABEL}\n\n`, BACKGROUND.join('\n'), USE, '', '\n']) {
    assert.equal(
      labelParts(text)
        .map((part) => part.text)
        .join(''),
      text
    );
  }
});

test('a paragraph that names a use or a limit is shown, however it opens', () => {
  for (const paragraph of BACKGROUND) assert.ok(isBackground(paragraph), paragraph.slice(0, 40));
  assert.equal(isBackground(`${BACKGROUND[0]} It is indicated for heart failure.`), false);
  assert.equal(isBackground(`${BACKGROUND[1]} Limitations of Use: not for children.`), false);
  assert.equal(isBackground(`${BACKGROUND[2]} It is not recommended in pregnancy.`), false);
});

test('nothing else is background: uses, limitations, and the antibiotics\' and opioids\' limits in all but name', () => {
  for (const paragraph of [
    USE,
    ...AFTER,
    'Limitations of Use',
    '• Not indicated to treat an acute asthma attack (5.2).',
    'To reduce the development of drug-resistant bacteria and maintain the effectiveness of doxycycline and other antibacterial drugs, doxycycline should be used only to treat or prevent infections that are proven or strongly suspected to be caused by bacteria.',
    'Because of the risks of addiction, abuse, and misuse with opioids, even at recommended doses, reserve oxycodone for use in patients for whom alternative treatment options (e.g., non-opioid analgesics) have not been tolerated, or are not expected to be tolerated.',
    'The effectiveness of buspirone hydrochloride tablets in long-term use, that is, for more than 3 to 4 weeks, has not been demonstrated in controlled trials.',
  ]) {
    assert.equal(isBackground(paragraph), false, paragraph.slice(0, 50));
  }
  // A card with none of it is one part, shown.
  assert.deepEqual(labelParts(['Montelukast is indicated for:', '• Asthma.', 'Limitations of Use:', '• Not for an asthma attack.'].join('\n')).map((part) => part.background), [false]);
});

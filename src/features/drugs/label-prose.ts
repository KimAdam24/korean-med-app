/**
 * Which paragraphs of a label's Indications text may be folded away behind a
 * button, as background.
 *
 * ## The rule
 *
 * Never a use, and never a limitation. A card that shows some of what a
 * medicine is approved for and hides the rest tells part of the truth as the
 * whole: Jardiance's first use is heart failure, and someone with diabetes who
 * read only that would be told the wrong thing. "Limitations of Use" says what
 * the medicine is not for (montelukast: not for an asthma attack), so it is
 * never hidden either.
 *
 * So nothing is folded that is not known to be neither. A paragraph is folded
 * only when it is one of the FDA's standard paragraphs of background below,
 * recognised by how it opens, and says nothing of what the medicine is or is
 * not indicated for. Anything else, however long, is shown. Prose that cannot
 * be told from a use with certainty is not guessed at.
 *
 * ## What is known to be background
 *
 * The four paragraphs the FDA's 2011 guidance on blood pressure medicines
 * gives every one of them: why lowering blood pressure matters, in general,
 * not what this medicine treats. About 2,000 characters on the labels that
 * carry them (atenolol, prazosin, lisinopril with hydrochlorothiazide; 21 of
 * the 961 bottles in the label scan).
 *
 * Left visible, though they read like background: the antibiotics' "should be
 * used only to treat or prevent infections that are proven or strongly
 * suspected to be caused by bacteria", which is a limitation in all but name,
 * and the opioids' "reserve for use in patients for whom alternative
 * treatment options... are inadequate", which is one in name too.
 *
 * Nothing is reworded, reordered or dropped: the parts, joined, are the text.
 */
const BACKGROUND = [
  /^Control of high blood pressure should be part of comprehensive cardiovascular risk management/i,
  /^Numerous antihypertensive drugs, from a variety of pharmacologic classes/i,
  /^Elevated systolic or diastolic pressure causes increased cardiovascular risk/i,
  /^Some antihypertensive drugs have smaller blood pressure effects/i,
];

/** Words that make a paragraph a use or a limitation, whatever it opens with. */
const SAYS_WHAT_FOR = /\bindicated\b|\blimitations?\b|\bcontraindicat|\bnot recommended\b|\bshould not be used\b/i;

export type LabelPart = { readonly text: string; readonly background: boolean };

/** Whether one paragraph is known background. */
export function isBackground(paragraph: string): boolean {
  const text = paragraph.trim();
  return BACKGROUND.some((opening) => opening.test(text)) && !SAYS_WHAT_FOR.test(text);
}

/**
 * The text as runs of paragraphs, each either known background or not. The
 * line breaks between paragraphs stay with the text, so the parts joined are
 * exactly the text.
 */
export function labelParts(text: string): LabelPart[] {
  const parts: { text: string; background: boolean }[] = [];
  // Paragraphs and the line breaks after them: "a\n\nb" is ["a", "\n\n", "b"].
  const pieces = text.split(/(\n+)/);
  for (let i = 0; i < pieces.length; i += 2) {
    const paragraph = pieces[i] + (pieces[i + 1] ?? '');
    const background = pieces[i].trim() !== '' && isBackground(pieces[i]);
    const last = parts[parts.length - 1];
    // A blank piece (text that starts with a line break) joins what is around it.
    if (last && (last.background === background || pieces[i].trim() === '')) last.text += paragraph;
    else parts.push({ text: paragraph, background });
  }
  return parts;
}

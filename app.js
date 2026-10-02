// Clickjacking guard, second line of defence behind the one in js/pwa.js
// (which aborts the page before this script is even fetched). A classic
// script cannot return early, so refuse to boot inside any frame by throwing
// before a single byte of journal state is read.
if (window.top !== window.self) throw new Error("Rephrame does not run inside a frame");

// ═══════════════════════════════════════════════════════════════════
// REFERENCE DATA
// ═══════════════════════════════════════════════════════════════════

// Names and definitions follow Burns's checklist (Feeling Good, 1980; Feeling
// Good Handbook, 1989; 2016 revision) and J. Beck (2020), plus the Blame,
// Fairness, Change and Control items from McKay, Davis & Fanning (Thoughts
// and Feelings, 1981). Burns's "Jumping to conclusions" is split into Mind
// Reading and Fortune Telling, as J. Beck lists them. Catastrophizing is the
// worst-case prediction; the two-way "binocular trick" of blowing up the bad
// and shrinking the good stays one item, Magnification and Minimization.
const DISTORTIONS = [
  { name: "All-or-Nothing Thinking", desc: "Seeing things in only two boxes, like perfect or total failure, with nothing in between.", cues: '"total failure," "perfect," "completely ruined"' },
  { name: "Overgeneralization", desc: "Treating one bad event as proof of a never-ending pattern.", cues: '"always," "never," "every time," "nothing ever"' },
  { name: "Mental Filter", desc: "Fixating on one negative detail, ignoring the rest.", cues: '"but that one comment…"' },
  { name: "Disqualifying the Positive", desc: "Insisting good things don't count, so the negative view stays intact.", cues: '"that doesn\'t count," "anyone could do that"' },
  { name: "Mind Reading", desc: "Deciding you know what someone thinks of you, usually something negative, without checking.", cues: '"she probably," "they must think"' },
  { name: "Fortune Telling", desc: "Predicting things will turn out badly and treating the prediction as fact.", cues: '"this will definitely," "there\'s no way"' },
  { name: "Catastrophizing", desc: "Jumping to the worst possible outcome and treating it as likely, or as more than you could cope with.", cues: '"what if," "this is a disaster," "I couldn\'t handle it"' },
  { name: "Magnification and Minimization", desc: "Blowing up your mistakes and shrinking your strengths, like looking through the wrong end of binoculars.", cues: '"what a huge mistake," "it was nothing, really"' },
  { name: "Emotional Reasoning", desc: "Treating a feeling as proof: I feel it, so it must be true.", cues: '"I feel like a failure so I must be one"' },
  { name: "Should Statements", desc: "Rigid rules about how you, other people or the world must be. Breaking them brings guilt; others breaking them brings anger.", cues: '"I should," "I must," "they shouldn\'t"' },
  { name: "Labeling", desc: "Pinning a global label on yourself or someone else, like loser or jerk, instead of describing what happened.", cues: '"I\'m a terrible partner," "he\'s useless"' },
  { name: "Personalization", desc: "Seeing yourself as the main cause of something bad, or assuming other people's moods are about you, when other things were involved.", cues: '"it\'s all my fault," "what did I do?"' },
  { name: "Blame", desc: "Holding other people fully responsible for your problems or feelings and overlooking your own part.", cues: '"it\'s all their fault"' },
  { name: "Fallacy of Fairness", desc: "Judging everything by your own idea of fair, and staying resentful when life or people don't match it.", cues: '"it\'s not fair," "I deserve"' },
  { name: "Fallacy of Change", desc: "Believing you can only be happy once other people change, and that pushing hard enough will make them.", cues: '"if they would just…"' },
  { name: "Control Fallacy (external)", desc: "Believing outside forces control everything, so nothing you do matters.", cues: '"there\'s nothing I can do"' },
  { name: "Control Fallacy (internal)", desc: "Feeling responsible for everyone else's feelings and happiness.", cues: '"it\'s all on me to fix everything"' },
];

// Default Socratic type + reframe method per distortion. Lets step 3 (Distortion)
// seed Challenge (step 4) and Reframe (step 5) so a first-time user isn't asked
// to map jargon-to-jargon mid-flow. Each pairing is the question and the
// rewrite that answer what that distortion actually does, and should read
// true against the "when" fields on SOCRATIC_TYPES and REFRAME_METHODS:
// an absolute gets a continuum, a prediction gets a probability, a label
// gets the behavior it was stuck on, lopsided blame gets a responsibility
// pie. Keys must exactly match a DISTORTIONS[].name; values must exactly
// match a SOCRATIC_TYPES[].type and REFRAME_METHODS[].method.
//
// The responsibility pie used to be "Perspective broadening" (zoom out to
// the whole week). PR 6 swapped its question for the pie but left
// All-or-Nothing, Mental Filter and Minimization pointing at it, so "I
// ruined the whole presentation" was answered with "how big is my slice of
// the blame?". Those three now get questions built for them.
const DISTORTION_DEFAULTS = {
  "All-or-Nothing Thinking":    { socratic: "Shades of gray",          reframe: "Continuum thinking" },
  "Overgeneralization":         { socratic: "Track record",            reframe: "Continuum thinking" },
  "Mental Filter":              { socratic: "Full picture",            reframe: "Balanced thought" },
  "Disqualifying the Positive": { socratic: "Double standard",         reframe: "Balanced thought" },
  "Mind Reading":               { socratic: "Alternative explanation", reframe: "Behavioral experiment" },
  "Fortune Telling":            { socratic: "Probability testing",     reframe: "Realism" },
  "Catastrophizing":            { socratic: "Decatastrophizing",       reframe: "Realism" },
  "Magnification and Minimization": { socratic: "Double standard",     reframe: "Balanced thought" },
  "Emotional Reasoning":        { socratic: "Evidence examination",    reframe: "Balanced thought" },
  "Should Statements":          { socratic: "Cost-benefit",            reframe: "Flexible preference" },
  "Labeling":                   { socratic: "Double standard",         reframe: "Behavior, not identity" },
  "Personalization":            { socratic: "Responsibility pie",      reframe: "Compassionate reattribution" },
  "Blame":                      { socratic: "Responsibility pie",      reframe: "Compassionate reattribution" },
  "Fallacy of Fairness":        { socratic: "Cost-benefit",            reframe: "Flexible preference" },
  "Fallacy of Change":          { socratic: "Cost-benefit",            reframe: "Flexible preference" },
  "Control Fallacy (external)": { socratic: "Evidence examination",    reframe: "Behavioral experiment" },
  "Control Fallacy (internal)": { socratic: "Responsibility pie",      reframe: "Compassionate reattribution" },
};

// Illustrations, not findings: no published study reports these specific
// pairs as the most common. Each is shown with why the two tend to travel
// together, so it reads as an example rather than a statistic.
const COMMON_PAIRS = [
  "Catastrophizing + Fortune Telling: near twins. Both predict the worst; catastrophizing adds that you couldn't cope.",
  "Mind Reading + Personalization: deciding someone's cold reply is a verdict on you.",
  "All-or-Nothing Thinking + Should Statements: perfectionism, where anything short of the rule counts as failure.",
  "Emotional Reasoning + Labeling: I feel like a failure, so I am one.",
];

// Mood words, one per option (Mind Over Mood: if it takes more than one word
// to describe a mood, it's probably a thought). Each family leads with its
// plain word, the one most people reach for first. Words that name a
// judgment or someone else's action rather than a feeling ("blameworthy",
// "threatened", "excluded", "hostile") and a symptom ("hypervigilant") are
// out; so is the duplicate "contemptuous" under Anger (Plutchik files
// contempt as anger plus disgust, and one home keeps Patterns counts clean).
// Entries saved with a retired word still show it; see _variantOptions.
const EMOTION_FAMILIES = {
  Anger: ["angry", "irritated", "frustrated", "resentful", "bitter", "furious", "enraged"],
  Anxiety: ["anxious", "nervous", "worried", "apprehensive", "tense", "uneasy", "panicked", "dread"],
  Sadness: ["sad", "down", "depressed", "disappointed", "hurt", "dejected", "grief", "hopeless", "lonely", "abandoned"],
  Shame: ["ashamed", "embarrassed", "humiliated", "inadequate", "exposed", "self-conscious"],
  Guilt: ["guilty", "remorseful", "regretful", "self-reproachful"],
  Fear: ["afraid", "scared", "frightened", "terrified", "insecure", "vulnerable", "helpless"],
  // Envy and jealousy are different feelings (Parrott & Smith, 1993): envy
  // wants what someone has, jealousy fears losing what you have.
  "Jealousy & envy": ["jealous", "possessive", "envious", "inferior"],
  Disgust: ["disgusted", "repulsed", "contemptuous"],
};
// Variant <option>s for a mood row. A word saved before it was retired from
// the list stays selectable, so re-opening an old entry doesn't blank it.
function _variantOptions(m) {
  const list = m.family ? (EMOTION_FAMILIES[m.family] || []) : [];
  const all = (m.variant && !list.includes(m.variant)) ? [...list, m.variant] : list;
  return all.map(v => `<option value="${esc(v)}" ${m.variant === v ? "selected" : ""}>${esc(v)}</option>`).join("");
}

// What each band feels like from the inside. This is a self-report scale:
// the person rating is the person feeling it, so the cues describe felt
// experience, not how the feeling sounds or looks to someone listening
// (the old "raised voice", "vocal frustration" wording was an observer's
// checklist and made no sense for rating your own mood).
//
// SUDS (Wolpe) anchors only the ends: 0 is none at all, 100 the most you
// have ever felt it; Mind Over Mood anchors to the person's own range the
// same way. The named bands are this app's, so there is a real 0 (a re-rate
// to nothing used to read "Mild: noticeable"), and Severe starts at 80 to
// match the grounding note that appears there and Wolpe & Wolpe's (1981)
// 80–100 "very severe" anchor.
const INTENSITY_BANDS = [
  { max: 0,   label: "None",     signals: "Not there right now" },
  { max: 20,  label: "Mild",     signals: "Noticeable, easy to set aside" },
  { max: 40,  label: "Moderate", signals: "Tugging at you, still manageable" },
  { max: 60,  label: "Strong",   signals: "Hard to think about much else" },
  { max: 79,  label: "High",     signals: "Hard to step back from" },
  { max: 100, label: "Severe",   signals: "Overwhelming, hard to function" },
];

const BODY_REGIONS = [
  { region: "Head",       examples: "headache, pressure behind eyes, foggy thinking" },
  { region: "Throat/Jaw", examples: "lump in throat, jaw clenching, voice tightening" },
  { region: "Chest",      examples: "tightness, racing heart, heaviness, shortness of breath" },
  { region: "Stomach",    examples: "knot, nausea, butterflies, sinking feeling" },
  { region: "Muscles",    examples: "tension in shoulders/neck/back, restlessness" },
  { region: "Skin",       examples: "flushing, sweating, tingling, numbness" },
  { region: "Energy",     examples: "fatigue, heaviness, jittery, unable to sit still" },
];

// Question types and their wording follow J. Beck's "Testing Your Thoughts"
// questions (2020), Burns's techniques (Feeling Good Handbook, 1989),
// Padesky's continuum (1994) and Salkovskis's responsibility pie (1999).
// Templates avoid dropping the whole hot thought into the middle of a
// sentence ("How likely is I ruined everything...") and ask the question
// the technique actually asks.
const SOCRATIC_TYPES = [
  { type: "Evidence examination",   when: "A feeling or assumption treated as fact",            template: "Looking at both lists, what do the facts actually show? Which parts are facts, and which are my interpretation?" },
  { type: "Alternative explanation", when: "Locked into one reading of what someone did",       template: "Is there another way to explain why [person] did that?" },
  { type: "Probability testing",    when: "Predicting the bad outcome as certain",              template: "Realistically, how likely is it that this actually happens, from 0 to 100%? What makes me pick that number?" },
  // Not "Historical test": in the literature that names a life review of a
  // core belief (Young; Padesky 1994), not a count of past occurrences.
  { type: "Track record",           when: "One event treated as a pattern",                     template: "Looking back, how many times has this actually happened, and how many times hasn't it?" },
  { type: "Double standard",        when: "Harder on yourself than on a friend, or waving off your own wins", template: "If a friend were in my spot, would I say this to them? What would I say instead?" },
  { type: "Decatastrophizing",      when: "Worst-case thinking",                                template: "What's the worst that could happen, the best, and the most likely? If the worst did happen, how would I cope?" },
  { type: "Cost-benefit",           when: "Should statements / rigid rules",                    template: "What does holding this belief cost me vs give me?" },
  { type: "Shades of gray",         when: "All-or-nothing words: always, never, total, ruined", template: "Is this really all or nothing? On a scale from 0 to 100, where does it actually sit? What would a true 0 and a true 100 look like?" },
  { type: "Full picture",           when: "One detail blotting out everything else",            template: "What am I leaving out? If I zoomed out to the whole day or week, what else happened that I'm not counting?" },
  // Salkovskis: list every factor first and fill in your own slice last, so
  // your share is whatever is honestly left, not the first thing you grab.
  { type: "Responsibility pie",     when: "Taking all the blame, or loading it on one person",  template: "List everyone and everything that played a part, with me last. Give each a slice of the pie and fill in my slice only at the end. How big is it really?" },
];

const REFRAME_METHODS = [
  { method: "Coping/encouraging thought",  when: "Self-criticism about ability", does: "A kinder, more accurate line you can actually use as encouragement",
    template: "I haven't figured this out yet, and that's not the same as never being able to. One rough attempt isn't the verdict." },
  { method: "Realism",                     when: "Catastrophizing / fortune telling", does: "Replaces extreme prediction with most probable outcome",
    template: "The worst case isn't the most likely case. The realistic outcome is more like [X], and I'd handle that the way I've handled similar things." },
  { method: "Continuum thinking",          when: "All-or-nothing or always/never language", does: "Places this on a 0–100 line instead of a binary; finds where it really sits",
    template: "On a line from 0 to 100, this isn't at either end — it's around [X]. Naming where it actually sits is more honest than the absolute." },
  { method: "Compassionate reattribution", when: "Responsibility piled on one person, you or them", does: "Redistributes responsibility fairly",
    template: "This wasn't all on one person. A fair split of responsibility looks more like [X]. I can own my share without carrying all of it, or handing all of it away." },
  { method: "Behavioral experiment",       when: "Untested predictions about people or outcomes", does: "Turns the prediction into a small test you can actually run",
    template: "My prediction is [X]. To test it, I'll [do Y] by [when], and write down what actually happens." },
  { method: "Balanced thought",            when: "One detail or one feeling crowding out the rest", does: "Holds the hard part and what you were leaving out in the same sentence",
    template: "[The hard part] is real, and so is [what I was leaving out]. I don't have to pick one; both belong in the picture." },
  { method: "Flexible preference",         when: "Shoulds, musts, and it's-not-fair rules", does: "Turns a rigid rule into a preference you can miss without it being a verdict",
    template: "I'd prefer [X], and it's disappointing when that doesn't happen. It's a preference, not a rule that I or anyone else has to obey." },
  { method: "Behavior, not identity",      when: "A label pinned on you from one action", does: "Describes what happened instead of passing a verdict on who you are",
    template: "I [did X], and I'm not happy about it. That's something I did, not who I am." },
];

// Worked before→after reframe examples, keyed by distortion name (must match
// DISTORTIONS[].name). Step 5 pulls examples for the distortion(s) the user
// named in Step 3 so it models the exact move their thought needs, rather than
// generic advice. Two per distortion gives range when only one is picked.
const REFRAME_EXAMPLES = {
  "All-or-Nothing Thinking": [
    { before: "I made one mistake in the presentation, so the whole thing was a disaster.",
      after:  "Most of the talk landed; one slip doesn't erase the rest. It was a solid presentation with one rough moment." },
    { before: "If I'm not the best at this, there's no point in doing it.",
      after:  "Being somewhere in the middle is still worth something. \"Good enough to keep going\" is a real place to stand." },
  ],
  "Overgeneralization": [
    { before: "I got rejected. I'll never find anyone.",
      after:  "One person said no. That's a single data point, not a forecast of every future relationship." },
    { before: "I always mess these things up.",
      after:  "I'm remembering the misses and skipping the times it went fine. \"Sometimes\" is more honest than \"always.\"" },
  ],
  "Mental Filter": [
    { before: "My review had one critical note, so it basically went badly.",
      after:  "The review had one criticism and several genuine compliments. Fixating on the one note ignores the rest of what was said." },
    { before: "The day was ruined by that one awkward conversation.",
      after:  "One awkward moment doesn't cancel the parts of the day that were fine or good. Both were in it." },
  ],
  "Disqualifying the Positive": [
    { before: "They thanked me, but they were just being polite.",
      after:  "I'm explaining away the thanks. They may well have meant it, and I can let it count." },
    { before: "I did well, but that one was easy, so it doesn't count.",
      after:  "I keep moving the goalposts so nothing I do qualifies. Done is done — this one counts." },
  ],
  "Mind Reading": [
    { before: "She didn't text back, so she's annoyed with me.",
      after:  "I don't actually know why she hasn't replied. Busy, tired, or distracted are all possible too." },
    { before: "Everyone in that meeting thought my idea was stupid.",
      after:  "I can't read the room's mind. Nobody said that — I'm filling the silence with the worst guess." },
  ],
  "Fortune Telling": [
    { before: "There's no way this interview goes well.",
      after:  "I can't predict the outcome. I've prepared, and the realistic range includes it going fine — I'll find out by showing up." },
    { before: "If I bring it up, it'll definitely turn into a fight.",
      after:  "I'm treating one possible outcome as certain. It could also go calmly — and I won't know unless I try." },
  ],
  "Catastrophizing": [
    { before: "If I fail this exam, my whole career is over.",
      after:  "Failing one exam would be a setback, not the end. I could retake it or adjust — I've handled setbacks before." },
    { before: "This headache means something is seriously wrong with me.",
      after:  "The most likely explanation is the ordinary one. If it's sudden, severe, or unlike my usual headaches, I get it checked today; otherwise jumping to disaster doesn't help me decide." },
  ],
  "Magnification and Minimization": [
    { before: "I've stuck with it for a month, but that's tiny next to how far I have to go.",
      after:  "A month is real progress. It can be small and still count." },
    { before: "I stumbled over one line in the toast. Everyone will remember that.",
      after:  "I'm blowing up the one stumble and shrinking the rest. Most people will remember that I gave a warm toast." },
  ],
  "Emotional Reasoning": [
    { before: "I feel like a failure, so I must be one.",
      after:  "Feeling like a failure is a feeling, not evidence. The facts of what I've actually done tell a more balanced story." },
    { before: "I feel anxious about this, so it must be dangerous.",
      after:  "My alarm is loud, but loud isn't the same as accurate. I can check the actual risk instead of trusting the feeling." },
  ],
  "Should Statements": [
    { before: "I should always have it together. I shouldn't be struggling.",
      after:  "There's no rule that I must always cope perfectly. Struggling sometimes is human, not a failure of duty." },
    { before: "I have to say yes or I'm letting everyone down.",
      after:  "\"Have to\" is a rule I picked up, not a law. I can choose what I take on, and a kind no is allowed." },
  ],
  "Labeling": [
    { before: "I snapped at my partner. I'm a terrible person.",
      after:  "I did something I regret, and I can repair it. One harsh moment is a behavior, not a verdict on who I am." },
    { before: "I forgot the deadline — I'm such an idiot.",
      after:  "I made a mistake; that doesn't make me the label. A careful person can still have an off day." },
  ],
  "Personalization": [
    { before: "The team missed the deadline. It's all my fault.",
      after:  "A missed deadline has many causes — scope, resourcing, other people's parts. My share is real, but it's one piece, not the whole." },
    { before: "My friend seemed off today. I must have done something.",
      after:  "Their mood probably has its own reasons that have nothing to do with me. I can ask instead of assuming I caused it." },
  ],
  "Blame": [
    { before: "This is entirely their fault. I had nothing to do with it.",
      after:  "Their choices mattered a lot here. If I honestly had a part, naming it gives me something to act on. If I didn't, I can focus on what I need next." },
    { before: "If they hadn't done that, I wouldn't be stuck like this.",
      after:  "Their choice played a role, and so do mine from here. Where I focus is on the next move that's actually in my hands." },
  ],
  "Fallacy of Fairness": [
    { before: "It's not fair that I work this hard and get passed over.",
      after:  "It may really be unfair, and I can say so. Stewing on it keeps me stuck, so what's my next move: ask why, push back, or look elsewhere?" },
    { before: "I do more than they do, so it's unfair I'm not appreciated.",
      after:  "The scorecard hurts more than it helps. I can ask directly for what I need instead of waiting for fairness to arrive." },
  ],
  "Fallacy of Change": [
    { before: "I'd be happy if they would just change how they act.",
      after:  "I can't make someone else change. What I can do is decide how I respond and what boundaries I keep." },
    { before: "Once they finally get it, things will be fine.",
      after:  "Waiting on someone else to change leaves me powerless. I can act on my own part now rather than holding my breath." },
  ],
  "Control Fallacy (external)": [
    { before: "There's nothing I can do — it's all out of my hands.",
      after:  "Some of this is outside my control, but not all of it. There's at least one small thing here I can influence." },
    { before: "Things just happen to me; I have no say.",
      after:  "I can't control everything, but I'm not powerless either. Naming the one piece I can move is where I start." },
  ],
  "Control Fallacy (internal)": [
    { before: "It's on me to fix everyone's problems and keep everyone happy.",
      after:  "I'm not responsible for everyone's feelings and outcomes. I can care and help without owning results that aren't mine." },
    { before: "If anyone around me is upset, I've failed.",
      after:  "Other people's emotions aren't mine to manage. I can be kind without taking the whole weight on myself." },
  ],
};

/**
 * Build the tailored worked-examples block for Step 5. Pulls before→after
 * pairs for the distortion(s) the user named in Step 3; falls back to a small
 * spread of common ones if none was picked. Returns "" when there's nothing
 * useful to show.
 */
function reframeExamplesHTML(d) {
  const picked = (d.distortions || []).filter(name => REFRAME_EXAMPLES[name]);
  let examples = [];
  let label = "";
  let tagged = false;

  if (picked.length) {
    label = picked.length === 1 ? picked[0] : "the patterns you named";
    tagged = picked.length > 1;
    picked.forEach(name => {
      REFRAME_EXAMPLES[name].forEach(ex => examples.push({ ...ex, distortion: name }));
    });
    // One distortion → show both for range; multiple → one each so it stays tight.
    examples = picked.length === 1 ? examples.slice(0, 2) : picked.map(name => {
      const ex = REFRAME_EXAMPLES[name][0];
      return { ...ex, distortion: name };
    });
    examples = examples.slice(0, 3);
  } else {
    // No distortion named — a short, varied spread so the section still helps.
    tagged = true;
    ["Catastrophizing", "Mind Reading", "Labeling"].forEach(name => {
      examples.push({ ...REFRAME_EXAMPLES[name][0], distortion: name });
    });
  }

  if (!examples.length) return "";

  return `
    <div class="reframe-examples" role="note" aria-label="Worked reframe examples">
      <div class="reframe-examples-eyebrow">${svgIcon("sparkle", "ico--inline")} Worked examples${label ? ` · ${esc(label)}` : ""}</div>
      <p class="reframe-examples-sub">How a thought like this can move. Read for the shape, then write your own above — copying these won't land the way your own words will.</p>
      ${examples.map(ex => `
        <div class="reframe-example">
          ${tagged ? `<div class="reframe-example-tagline">${esc(ex.distortion)}</div>` : ""}
          <div class="reframe-example-line reframe-example-before"><span class="reframe-example-pill">Hot</span><span class="reframe-example-text">"${esc(ex.before)}"</span></div>
          <div class="reframe-example-line reframe-example-after"><span class="reframe-example-pill">Reframe</span><span class="reframe-example-text">"${esc(ex.after)}"</span></div>
        </div>
      `).join("")}
    </div>
  `;
}

// Distortion (3) comes before Challenge (4), as in Burns's triple-column
// technique and Daily Mood Log and J. Beck's thought record (2020), where
// naming the distortion (optional there, and here) comes before composing
// the response. Mind Over Mood's 7-column record has no labeling step.
const STEP_TITLES = ["Trigger", "Initial Reaction", "Distortion", "Challenge", "Reframe", "Pivot", "Review"];
const STEP_PROMPTS = [
  "What's setting this off?",
  "What came up?",
  "Which patterns showed up?",
  "Put the thought on trial.",
  "Write a thought you'd accept.",
  "One concrete action.",
  "Read it back.",
];
const STEP_HINTS = [
  "An event, a thought, or a feeling — whatever's at the start of this. Skip interpretation for now; just name what's there.",
  "The first thought, the feeling, the body.",
  "Name the thinking patterns at work — they point to how to challenge and reframe next. Multiple is normal; zero is fine too.",
  "Both sides on the table, then one well-placed question.",
  "Eye-roll test: would you say \"yeah, that's fair\"?",
  "Specific enough to do today.",
  "Make changes by tapping a section. Save when it's right.",
];

// Tap-to-insert starter chips for structured captures (mirrors quick-capture UX).
const TRIGGER_CAPTURE_CHIPS = [
  { label: "What happened", seed: "Here's what just happened: " },
  { label: "The thought",   seed: "The thought running through my head: " },
  { label: "The feeling",    seed: "What I'm feeling right now: " },
  { label: "The body",       seed: "Where this sits in my body: " },
];
const PIVOT_STARTER_CHIPS = [
  { label: "Reach out",    seed: "Text a friend one honest sentence to check in." },
  { label: "Move the body", seed: "Go for a 15-minute walk outside — no phone." },
  { label: "Tiny task",    seed: "Do one small thing I've been avoiding, for under 10 minutes." },
];
const WORRY_STARTER_CHIPS = [
  { label: "Said wrong thing?", seed: "What if I embarrassed myself or said the wrong thing?" },
  { label: "Fear of failing", seed: "What if I fail at the thing I'm worrying about?" },
  { label: "Health spiral",   seed: "What if this feeling means something serious is wrong?" },
];

/** Journal list / chip counts aligned with Patterns: exclude ⚡ quick thought records where noted. */
function excludeQuickThoughtRecord(e) {
  return !(e.kind === "thought-record" && e.isQuick);
}

// A small, relatable set of example entries so first-time users can see what
// complete entries look like AND so the Patterns view has enough to chew on
// (recurring distortions/emotions, belief & mood drops, pivot follow-through,
// activity impact, worry dissolution, a multi-day heatmap). Loaded on demand
// from the empty-state "Load example" button and from onboarding.
// isSample:true marks each as removable in one tap.
//
// Built by makeSampleEntries() rather than a frozen const so ids are fresh and
// timestamps stay relative to "now" each time the set is loaded. The entries
// span ~6 days and are tuned so Mind Reading recurs as the top distortion and
// Anxiety as the top emotion, with ~75% pivot follow-through (3 of 4 done).
const sampleAgo = (days, hours = 0) =>
  new Date(Date.now() - ((days * 24) + hours) * 60 * 60 * 1000).toISOString();

function makeSampleEntries() {
  return [
    // 1 — 6 days ago. Unanswered vulnerable text. Favorited as a coping card.
    {
      id: "sample-" + newId(),
      kind: "thought-record",
      createdAt: sampleAgo(6),
      trigger: "Sent a long, honest text to a close friend three days ago — opened up about a hard week. Still no reply. I keep re-reading it.",
      thoughts: [
        { id: "sample-1t1", text: "They're pulling away. I overshared and made it weird, and now they don't want to deal with me.", beliefBefore: 80, beliefAfter: 30, isHot: true },
        { id: "sample-1t2", text: "If I really mattered to them they'd have answered by now.", beliefBefore: 60, beliefAfter: 35, isHot: false }
      ],
      moods: [
        { id: "sample-1m1", family: "Anxiety", variant: "worried",  intensity: 70, intensityAfterReframe: 35, intensityAfterPivot: 20, estimated: false },
        { id: "sample-1m2", family: "Sadness", variant: "hurt",      intensity: 65, intensityAfterReframe: 40, intensityAfterPivot: 25, estimated: false }
      ],
      bodyCheck: "Stomach knot, checking my phone every few minutes.",
      bodyInferred: false,
      distortions: ["Mind Reading", "Fortune Telling", "Personalization"],
      distortionNote: "Read silence as rejection, predicted the friendship is over, and made their quiet entirely about me.",
      thoughtsAccurate: false,
      evidenceFor: "They usually reply within a day. It's been three.",
      evidenceAgainst: "They mentioned a brutal work deadline this week. People go quiet when they're swamped — it rarely means they're done with you. I've left texts on read for days without it meaning anything.",
      socraticType: "Alternative explanation",
      socraticQuestion: "What are three reasons a busy friend might not reply yet that have nothing to do with me?",
      reframeMethod: "Realism",
      newThought: "Three days of silence from a friend who's slammed at work is far more likely to be about their week than about me. I can check in lightly instead of bracing for rejection.",
      newThoughtBelief: 75,
      pivot: "Send one warm, low-pressure check-in text — no guilt-tripping, no essay.",
      pivotDone: true,
      pivotDoneAt: sampleAgo(5, 12),
      pivotReflection: "Texted \"thinking of you, no rush to reply.\" They wrote back within the hour — drowning in a deadline, felt bad for going quiet. The story I'd built up was completely wrong.",
      outcomeRecorded: true,
      isQuick: false,
      isSample: true,
      isFavorite: true,
    },
    // 2 — 5 days ago. Behavioral-activation walk. Beat its low prediction.
    {
      id: "sample-" + newId(),
      kind: "activity",
      createdAt: sampleAgo(5),
      body: "15-minute walk around the block instead of doom-scrolling in bed.",
      category: "movement",
      plannedFor: sampleAgo(5, 2),
      predictedP: 3,
      predictedM: 4,
      completedAt: sampleAgo(5),
      actualP: 6,
      actualM: 7,
      activityNotes: "Really didn't want to go. Felt noticeably clearer by the end — better than the 3 I'd predicted.",
      moods: [],
      thoughts: [],
      isQuick: false,
      isSample: true,
      isFavorite: false,
    },
    // 3 — 4 days ago. Work slip-up in a meeting. Pivot done.
    {
      id: "sample-" + newId(),
      kind: "thought-record",
      createdAt: sampleAgo(4),
      trigger: "Quoted the wrong figure out loud in the team meeting. My manager went quiet for a second, then moved on.",
      thoughts: [
        { id: "sample-3t1", text: "She thinks I'm careless and can't be trusted with anything important. This is the start of me getting managed out.", beliefBefore: 85, beliefAfter: 30, isHot: true },
        { id: "sample-3t2", text: "Everyone on the call noticed and now I look incompetent.", beliefBefore: 70, beliefAfter: 35, isHot: false }
      ],
      moods: [
        { id: "sample-3m1", family: "Anxiety", variant: "dread",      intensity: 80, intensityAfterReframe: 40, intensityAfterPivot: 20, estimated: false },
        { id: "sample-3m2", family: "Shame",   variant: "humiliated", intensity: 70, intensityAfterReframe: 35, intensityAfterPivot: 20, estimated: false }
      ],
      bodyCheck: "Hot face, heart pounding, replaying the moment on a loop.",
      bodyInferred: false,
      distortions: ["Catastrophizing", "Mind Reading", "Labeling"],
      distortionNote: "Jumped from one wrong number to 'getting fired,' assumed I knew what she was thinking, and labeled myself incompetent.",
      thoughtsAccurate: false,
      evidenceFor: "I did say the wrong number. There was a pause.",
      evidenceAgainst: "She moved on without comment — not how people react to something disqualifying. I've sat through plenty of colleagues' slips and forgotten them by lunch. One number in one meeting is not a performance review.",
      socraticType: "Decatastrophizing",
      socraticQuestion: "If the worst case is unlikely, what's the most realistic thing that happens after a single misquoted figure?",
      reframeMethod: "Continuum thinking",
      newThought: "A misquoted number is an ordinary, fixable slip — not evidence I'm incompetent or on my way out. The honest fix is a two-line correction, and that's the end of it.",
      newThoughtBelief: 80,
      pivot: "Send a short follow-up email with the correct figure — factual, no over-apologizing.",
      pivotDone: true,
      pivotDoneAt: sampleAgo(4),
      pivotReflection: "Sent the correction. She replied 'thanks, no problem at all.' The dread beforehand was enormous; the actual outcome was four words.",
      outcomeRecorded: true,
      isQuick: false,
      isSample: true,
      isFavorite: false,
    },
    // 4 — 3 days ago. Health worry, parked, then dissolved on its own.
    {
      id: "sample-" + newId(),
      kind: "worry",
      createdAt: sampleAgo(3),
      worryText: "What if this headache I've had for two days is something serious?",
      urgency: 7,
      parkedAt: sampleAgo(3),
      scheduledFor: sampleAgo(2, 12),
      resolution: "dissolved",
      resolvedAt: sampleAgo(2),
      moods: [],
      thoughts: [],
      isQuick: false,
      isSample: true,
      isFavorite: false,
    },
    // 5 — 2 days ago. FOMO from social media. Pivot NOT done yet (keeps
    // follow-through under 100% so that stat is demonstrable).
    {
      id: "sample-" + newId(),
      kind: "thought-record",
      createdAt: sampleAgo(2),
      trigger: "Saw photos on Instagram of friends at a get-together I wasn't invited to.",
      thoughts: [
        { id: "sample-5t1", text: "They left me out on purpose. I'm clearly not someone they actually want around.", beliefBefore: 75, beliefAfter: 35, isHot: true },
        { id: "sample-5t2", text: "Everyone has a closer group than I do.", beliefBefore: 65, beliefAfter: 45, isHot: false }
      ],
      moods: [
        { id: "sample-5m1", family: "Sadness", variant: "lonely",       intensity: 70, intensityAfterReframe: 40, intensityAfterPivot: null, estimated: false },
        { id: "sample-5m2", family: "Anxiety", variant: "apprehensive", intensity: 55, intensityAfterReframe: 35, intensityAfterPivot: null, estimated: false }
      ],
      bodyCheck: "Heavy chest, that hollow scrolling feeling.",
      bodyInferred: false,
      distortions: ["Mind Reading", "Mental Filter", "Disqualifying the Positive"],
      distortionNote: "Assumed deliberate exclusion, filtered out every time I HAVE been included, and waved away the plans we already have.",
      thoughtsAccurate: false,
      evidenceFor: "I wasn't at this one. The photos looked fun.",
      evidenceAgainst: "It was a small last-minute thing in someone's neighborhood, not the whole friend group. Two of them texted me about coffee this same week. One gathering I missed isn't proof of anything about my worth.",
      socraticType: "Evidence examination",
      socraticQuestion: "If I list the times I HAVE been included this month alongside this one, what does the fuller picture look like?",
      reframeMethod: "Coping/encouraging thought",
      newThought: "Missing one small last-minute hangout stings, and it isn't evidence I'm unwanted. The friendships are real — I can reach toward them instead of away.",
      newThoughtBelief: 70,
      pivot: "Message one of them and suggest grabbing coffee this week.",
      pivotDone: false,
      pivotReflection: "",
      outcomeRecorded: false,
      isQuick: false,
      isSample: true,
      isFavorite: false,
    },
    // 6 — 1 day ago. Connection activity that landed well.
    {
      id: "sample-" + newId(),
      kind: "activity",
      createdAt: sampleAgo(1),
      body: "Called my sister for 20 minutes instead of texting.",
      category: "connection",
      plannedFor: sampleAgo(1, 3),
      predictedP: 5,
      predictedM: 4,
      completedAt: sampleAgo(1),
      actualP: 9,
      actualM: 7,
      activityNotes: "We laughed about something dumb from years ago. Hung up feeling lighter than I have all week.",
      moods: [],
      thoughts: [],
      isQuick: false,
      isSample: true,
      isFavorite: false,
    },
    // 7 — ~18h ago. Read a partner's mood as being about me. Pivot done;
    // reflection names the recurring lesson the other entries echo.
    {
      id: "sample-" + newId(),
      kind: "thought-record",
      createdAt: sampleAgo(0, 18),
      trigger: "My partner was quiet and a little short at dinner. I immediately assumed I'd done something to upset them.",
      thoughts: [
        { id: "sample-7t1", text: "They're annoyed with me. I've done something wrong and they're not saying it.", beliefBefore: 75, beliefAfter: 25, isHot: true }
      ],
      moods: [
        { id: "sample-7m1", family: "Anxiety", variant: "nervous",     intensity: 65, intensityAfterReframe: 30, intensityAfterPivot: 15, estimated: false },
        { id: "sample-7m2", family: "Guilt",   variant: "blameworthy", intensity: 50, intensityAfterReframe: 25, intensityAfterPivot: 10, estimated: false }
      ],
      bodyCheck: "Tight shoulders, scanning their face for clues.",
      bodyInferred: false,
      distortions: ["Mind Reading", "Personalization"],
      distortionNote: "Decided I knew the cause of their mood, and assumed it had to be about me.",
      thoughtsAccurate: false,
      evidenceFor: "They were quieter than usual.",
      evidenceAgainst: "They mentioned a rough day at work earlier. Quiet doesn't equal angry-at-me — most of the time their mood has nothing to do with me. I could just ask instead of guessing.",
      socraticType: "Alternative explanation",
      socraticQuestion: "What's a kinder, equally likely reason they might be quiet that has nothing to do with me?",
      reframeMethod: "Compassionate reattribution",
      newThought: "They're probably worn out from their own day. Their quiet isn't a verdict on me — and if I'm unsure, asking beats inventing the worst version.",
      newThoughtBelief: 80,
      pivot: "Gently ask: \"You seem a bit quiet — everything okay?\" instead of stewing.",
      pivotDone: true,
      pivotDoneAt: sampleAgo(0, 16),
      pivotReflection: "Asked them. They were just exhausted from a hard day — nothing to do with me. Same lesson again: the dread I build up is almost always worse than what's actually going on.",
      outcomeRecorded: true,
      isQuick: false,
      isSample: true,
      isFavorite: false,
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════

const STORAGE_KEY = "reframe-journal-v1";
const DRAFT_KEY   = "reframe-journal-draft-v1";
const ONBOARDED_KEY = "reframe-onboarded-v1";
// Best-effort write — a quota error mid-click must not surface the global
// "Something went wrong" toast just because the onboarding flag didn't stick.
function markOnboarded() {
  try { localStorage.setItem(ONBOARDED_KEY, "1"); } catch (_) { /* best-effort */ }
}
const SETTINGS_KEY = "reframe-settings-v1";
const PIN_KEY = "reframe-pin-hash-v1";
const UNLOCK_KEY = "reframe-unlocked";   // sessionStorage; cleared when tab closes

// PIN-based soft lock. Honest about the threat model: this gates the UI so
// casual snooping on a shared device can't read the journal, but the data
// itself isn't encrypted — anyone who knows where localStorage lives could
// still extract it via devtools. We deliberately do not derive an encryption
// key from the PIN: if the user forgets it, hard-encrypted data would be
// unrecoverable, and losing months of CBT work is a worse harm than soft
// privacy is a benefit. This is documented in the Settings → Privacy help.
//
// PIN storage format. Two shapes exist:
//   v1 (legacy): plain hex string — sha256(pin). Vulnerable to instant
//        brute-force (4-digit PIN = 10k SHA-256 hashes ≈ <1s on a phone).
//        Migrated to v2 on next successful unlock.
//   v2: JSON {v: 2, salt, hash, iterations} where hash = PBKDF2-SHA-256.
//        100k iterations + 16-byte random salt per-device. Brute-force
//        cost climbs from microseconds to tens of seconds.
const PBKDF2_ITERATIONS = 100000;
const PIN_LOCKOUT_KEY = "reframe-pin-lockout";  // localStorage (survives reload)
const _toHex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
const _fromHex = (hex) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
};

async function _legacyHashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(pin)));
  return _toHex(buf);
}

async function _pbkdf2Pin(pin, saltBytes, iterations) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(pin)), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes,
      iterations: (typeof iterations === "number" && iterations > 0) ? iterations : PBKDF2_ITERATIONS,
      hash: "SHA-256" },
    key, 256
  );
  return _toHex(bits);
}

function _readStoredPin() {
  const raw = localStorage.getItem(PIN_KEY);
  if (!raw) return null;
  // Legacy v1: bare 64-char hex string (sha256 hex digest).
  if (/^[0-9a-f]{64}$/i.test(raw)) return { v: 1, hash: raw };
  try {
    const o = JSON.parse(raw);
    if (o && o.v === 2 && o.salt && o.hash) return o;
  } catch (_) {}
  return null;
}

// A PIN "exists" only if the stored record actually parses — a corrupted
// record (not 64-hex, not valid v2 JSON) can never verify, so treating raw
// key presence as "has PIN" would lock the journal permanently. The PIN is a
// glance-privacy screen, not encryption; failing open beats bricking.
function hasPin() { return !!_readStoredPin(); }

async function verifyPin(pin) {
  // Enforce the brute-force lockout here — not only in the lock-screen form —
  // so a script calling verifyPin() in a loop is throttled too. While locked
  // out we refuse without consuming an attempt, so hammering can't keep
  // extending the cool-down.
  if (pinLockoutMsLeft() > 0) return false;
  const stored = _readStoredPin();
  if (!stored) return false;
  let ok;
  if (stored.v === 1) {
    ok = (await _legacyHashPin(pin)) === stored.hash;
    // Opportunistic migration on first successful unlock: upgrade the
    // record to the salted/iterated v2 format so the next session
    // doesn't fall back to the weak hash.
    if (ok) try { await setStoredPin(pin); } catch (_) {}
  } else {
    // Derive with the iteration count the record was WRITTEN with, not the
    // current constant — otherwise bumping PBKDF2_ITERATIONS would make every
    // existing PIN unverifiable (correct PINs hash differently), and with no
    // recovery path the user's only way back in is wiping all site data.
    const computed = await _pbkdf2Pin(pin, _fromHex(stored.salt), stored.iterations);
    ok = computed === stored.hash;
  }
  if (ok) _clearLockout();
  else recordPinFailure();
  return ok;
}

async function setStoredPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await _pbkdf2Pin(pin, salt);
  localStorage.setItem(PIN_KEY, JSON.stringify({
    v: 2, salt: _toHex(salt), hash, iterations: PBKDF2_ITERATIONS,
  }));
  sessionStorage.setItem(UNLOCK_KEY, "1");
  _clearLockout();
}

function clearStoredPin() {
  localStorage.removeItem(PIN_KEY);
  sessionStorage.removeItem(UNLOCK_KEY);
  _clearLockout();
}
function isUnlocked() { return sessionStorage.getItem(UNLOCK_KEY) === "1"; }
function markUnlocked() { sessionStorage.setItem(UNLOCK_KEY, "1"); _clearLockout(); }
function markLocked() { sessionStorage.removeItem(UNLOCK_KEY); }

// Lockout: after 5 failed attempts, refuse verifyPin attempts for an
// exponentially-growing window (2s, 4s, 8s, ... capped at 5 min). State
// lives in localStorage so closing/reopening the tab or reloading the page
// can't reset the cool-down — a stolen device can't be brute-forced by
// scripting a reload between guesses.
function _readLockout() {
  try {
    const raw = localStorage.getItem(PIN_LOCKOUT_KEY);
    if (!raw) return { attempts: 0, until: 0 };
    const o = JSON.parse(raw);
    return { attempts: o.attempts || 0, until: o.until || 0 };
  } catch (_) { return { attempts: 0, until: 0 }; }
}
function _writeLockout(o) {
  try { localStorage.setItem(PIN_LOCKOUT_KEY, JSON.stringify(o)); } catch (_) {}
}
function _clearLockout() { try { localStorage.removeItem(PIN_LOCKOUT_KEY); } catch (_) {} }
function pinLockoutMsLeft() {
  const { until } = _readLockout();
  return Math.max(0, until - Date.now());
}
function recordPinFailure() {
  const { attempts } = _readLockout();
  const next = attempts + 1;
  let until = 0;
  if (next >= 5) {
    const sec = Math.min(300, Math.pow(2, next - 4));  // 2,4,8,...,300
    until = Date.now() + sec * 1000;
  }
  _writeLockout({ attempts: next, until });
}

const DEFAULT_SETTINGS = {
  theme: "auto",             // "auto" | "light" | "dark"
  reminderInterval: "off",   // "off" | "daily" | "3days" | "weekly"
  nudgeSnoozedUntil: 0,      // epoch ms; suppress the nudge banner until this time
  // Worry-postponement window — when the user has parked worries and the
  // wall-clock crosses this time, the journal surfaces a calm banner.
  worryWindowTime: "18:00",  // HH:MM 24-hour, local
};
function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return { ...DEFAULT_SETTINGS, ...(raw || {}) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) {
  // Guard against QuotaExceededError so a full disk can't throw uncaught out
  // of a settings click handler. Settings are tiny, so a failure here almost
  // always means storage is full from entries — surface it rather than crash.
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (_) {
    if (typeof toast === "function") {
      toast("Couldn't save settings — storage may be full.", { variant: "error" });
    }
  }
}

// Reminder interval → milliseconds. `off` returns 0 to short-circuit checks.
const REMINDER_MS = {
  off:     0,
  daily:   24 * 3600 * 1000,
  "3days": 3 * 24 * 3600 * 1000,
  weekly:  7 * 24 * 3600 * 1000,
};

// Fields added after v1 shipped. Existing JSON exports won't carry them, so
// we normalize on read to a stable shape. null (not 0) means "not rated" —
// that distinction matters for the before/after delta display.
// Schema v2 (built on the Mind Over Mood thought record): moods and thoughts are arrays so a
// single triggering moment can carry the multiple feelings and competing
// automatic thoughts canonical thought-records capture. One thought is
// marked `isHot` — that's the one Steps 4 and 5 challenge and reframe.
// Legacy v1 entries (single emotion + single automaticThought) are
// converted on read; the v1 scalar fields are dropped from the output so
// we never have stale duplicates to keep in sync.
// Valid entry kinds. The default — for backward-read and new captures —
// is the thought record (Mind Over Mood's columns plus a distortion check,
// a Socratic question and a follow-up action). Each non-default kind has
// its own narrower field set, captured by its own UI flow. Fields not
// relevant to a kind stay at their default ("" / 0 / null / false) so
// renderers can simply check kind first and pick the relevant fields.
const ENTRY_KINDS = ["thought-record", "freeform", "activity", "worry"];
// Terminal states a parked worry can reach. Anything else normalizes to null
// ("still parked").
const WORRY_RESOLUTIONS = ["dissolved", "escalated", "postponed"];

// PR 6: clinical-terminology rename map. Saved entries written before the
// rename keep their old labels in localStorage; remap on read so dropdowns
// can re-select them and reference views show the new wording. Empty / new
// values pass through unchanged.
// Ingress coercion for hand-edited backups and peers. A non-string scalar
// in a text field (`"body": 123`) used to pass the `|| ""` check, get
// persisted, and then throw inside render on every load (`.replace is not a
// function`), leaving the journal blank with no way to reach Settings. A
// number outside its scale (`"intensity": 1e400` → Infinity) rendered
// literally and poisoned every Patterns average.
const _str = v => (typeof v === "string" ? v : (v == null || typeof v === "object" || typeof v === "function") ? "" : String(v));
const _num = (v, lo, hi, dflt) => {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
// Rename maps are plain objects: a key like "constructor" from a crafted
// backup resolved to Object and put a function in the entry.
const _renamed = (map, v) => (typeof v === "string" && Object.prototype.hasOwnProperty.call(map, v)) ? map[v] : v;

const DISTORTION_RENAME = {
  "Mental Filtering": "Mental Filter",
  // Burns's item is two-way (blow up the bad, shrink the good); "Minimization"
  // alone was half of it.
  "Minimization": "Magnification and Minimization",
};
const SOCRATIC_RENAME = {
  "Historical testing": "Track record",
  "Historical test": "Track record",
  // Perspective broadening asked "what would this look like zoomed out to
  // the full week?", which is what Full picture asks now. The pie question
  // that later took over its name is Responsibility pie.
  "Perspective broadening": "Full picture",
  "Zoom out (pie chart)": "Responsibility pie",
};
const REFRAME_RENAME = {
  "Growth-Oriented": "Coping/encouraging thought",
  "vs. Absolutes": "Continuum thinking",
};

function normalizeEntry(e) {
  const kind = (ENTRY_KINDS.includes(e && e.kind)) ? e.kind : "thought-record";
  // Mint an id if the source object lacks one — hand-edited or stripped
  // backups can omit it; without a fresh id the dedupe-by-id Map in
  // processImportFile would collapse every such entry into one. Also re-mint
  // ids that aren't plain tokens: entry ids are interpolated into HTML
  // attributes and querySelector strings throughout the renderers, so a
  // crafted id in an imported backup or a synced peer payload could inject
  // markup or break selectors. Every ingress path (import, P2P merge,
  // storage load) funnels through here, so this one gate covers them all.
  const out = {
    // safeId also excludes prototype-named ids, so a synced/imported entry
    // can never reach the deletion-tombstone map (a plain object) with an id
    // of "__proto__" — where map[id] = ts would be a silent no-op and the
    // delete could never sync.
    id: safeId(e.id),
    kind,
    // Clamp future-dated stamps from imports/peers the same way new captures
    // are clamped, so the newest-first sort and the 30-day views hold. Drafts
    // legitimately carry an empty createdAt until save — leave those alone.
    createdAt: e.createdAt ? clampDate(e.createdAt) : "",
    // Clamp future-dated updatedAt to a FIXED value here, not just at compare
    // time: a poisoned/clock-skewed future stamp left raw re-evaluates to
    // "now" on every sync merge (clampSyncTs clamps to Date.now() each call),
    // so it would beat every genuine later edit forever and block deletions.
    updatedAt: e.updatedAt ? clampDate(e.updatedAt) : undefined,

    trigger: _str(e.trigger),

    moods: Array.isArray(e.moods) ? e.moods.map(normalizeMood) : [],
    thoughts: Array.isArray(e.thoughts) ? e.thoughts.map(normalizeThought) : [],

    bodyCheck: _str(e.bodyCheck),
    bodyInferred: !!e.bodyInferred,

    distortions: Array.isArray(e.distortions)
      ? e.distortions.filter(n => typeof n === "string" && n).map(n => _renamed(DISTORTION_RENAME, n))
      : [],
    distortionNote: _str(e.distortionNote),
    // "I looked at the thought and it actually feels accurate to me" — a
    // valid CBT outcome that the workflow needs to permit explicitly,
    // otherwise users in real grief / valid distress get nudged into
    // pathologizing healthy reactions.
    thoughtsAccurate: !!e.thoughtsAccurate,

    evidenceFor: _str(e.evidenceFor),
    evidenceAgainst: _str(e.evidenceAgainst),
    socraticType: _renamed(SOCRATIC_RENAME, _str(e.socraticType)),
    socraticQuestion: _str(e.socraticQuestion),
    // What the user found when they asked it. A question with no answer is
    // a prompt, not Socratic questioning (Padesky: questions, listening,
    // summary, then a synthesizing question).
    socraticAnswer: _str(e.socraticAnswer),

    reframeMethod: _renamed(REFRAME_RENAME, _str(e.reframeMethod)),
    newThought: _str(e.newThought),
    // Belief is re-rated in both the original hot thought (Beck's Outcome
    // column; lives on the thought row as beliefAfter) and the NEW balanced
    // thought (Mind Over Mood's alternative-thought rating). The latter is a
    // separate scalar so it survives multi-thought edits.
    newThoughtBelief: _num(e.newThoughtBelief, 0, 100, null),
    // Feelings that showed up after the reframe (relief, calm, hope).
    // Mind Over Mood's last column re-rates the original moods "as well as
    // any new moods". Kept as words, not rated rows: every mood statistic
    // treats a falling number as progress, which a rising "relief" is not.
    newFeelings: _str(e.newFeelings),

    pivot: _str(e.pivot),
    pivotDone: !!e.pivotDone,
    pivotDoneAt: _str(e.pivotDoneAt),
    pivotReflection: _str(e.pivotReflection),
    // Written before acting, so the outcome has something to be checked
    // against: the prediction that turns the pivot into a small behavioral
    // experiment (Mind Over Mood, ch. 11).
    pivotPrediction: _str(e.pivotPrediction),
    outcomeRecorded: !!e.outcomeRecorded,

    // Free-form (kind: "freeform") fields — title is optional, body is the
    // long-form text. Moods + distortions remain reusable on free-form too.
    body: _str(e.body),

    // Behavioral-activation (kind: "activity") fields. Pleasure + Mastery
    // are rated 0–10, as in Beck et al.'s (1979) activity scheduling and the
    // Beck Institute worksheets ("predict, then measure"). predicted* are set when
    // planning; actual* + completedAt are set on log-completion.
    category: _str(e.category),          // connection|movement|creation|work|meaning|self-care|chore|rest|other
    plannedFor: _str(e.plannedFor),      // ISO datetime
    predictedP: _num(e.predictedP, 0, 10, null),
    predictedM: _num(e.predictedM, 0, 10, null),
    completedAt: _str(e.completedAt),
    actualP: _num(e.actualP, 0, 10, null),
    actualM: _num(e.actualM, 0, 10, null),
    activityNotes: _str(e.activityNotes),

    // Worry (kind: "worry") fields. urgency 0–10. resolution null until the
    // worry-window pass; "dissolved" means user marked it gone without
    // further work, "escalated" means it got converted to a thought-record,
    // "postponed" pushes scheduledFor forward another window.
    worryText: _str(e.worryText),
    urgency: _num(e.urgency, 0, 10, null),
    parkedAt: _str(e.parkedAt),
    scheduledFor: _str(e.scheduledFor),
    // Whitelisted: the value is interpolated into a class attribute by the
    // worry card, so an arbitrary string from an imported backup or a synced
    // peer must not reach the markup.
    resolution: WORRY_RESOLUTIONS.includes(e.resolution) ? e.resolution : null,
    resolvedAt: _str(e.resolvedAt),
    // How many times this worry has been pushed to another window. Past two,
    // postponing has stopped being postponement and started being avoidance.
    postponeCount: Number.isInteger(e.postponeCount) && e.postponeCount > 0 ? Math.min(e.postponeCount, 999) : 0,
    linkedEntryId: typeof e.linkedEntryId === "string" ? e.linkedEntryId : "",

    isQuick: !!e.isQuick,
    // "Just venting" quick captures: named, saved, deliberately not taken
    // through the structured flow. Excluded from thought-record statistics.
    isVent: !!e.isVent,
    isSample: !!e.isSample,
    isFavorite: !!e.isFavorite,
  };

  // Migrate v1 single-emotion/single-thought entries. Only applies to
  // thought-record-shaped entries; free-form/activity/worry never had v1.
  if (kind === "thought-record") {
    if (out.moods.length === 0 && (e.emotionFamily || typeof e.emotionIntensity === "number")) {
      out.moods.push(normalizeMood({
        family: e.emotionFamily,
        variant: e.emotionVariant,
        intensity: e.emotionIntensity,
        estimated: e.emotionEstimated,
        intensityAfterReframe: e.emotionIntensityAfter,
      }));
    }
    if (out.thoughts.length === 0 && (e.automaticThought || typeof e.beliefBefore === "number")) {
      out.thoughts.push(normalizeThought({
        text: e.automaticThought,
        beliefBefore: e.beliefBefore,
        beliefAfter: e.beliefAfter,
        isHot: true,
      }));
    }
    // Guarantee at least one thought is hot.
    if (out.thoughts.length > 0 && !out.thoughts.some(t => t.isHot)) {
      out.thoughts[0].isHot = true;
    }
    // hotThought() and several renderers assume thought-records have ≥1
    // thought. Hand-edited or partially-saved backups can violate that;
    // mint a placeholder so the entry is at least viewable.
    if (out.thoughts.length === 0) {
      out.thoughts.push(normalizeThought({ isHot: true }));
    }
  }
  if (kind === "activity" && !out.plannedFor) {
    const t = new Date(Date.now() + 60 * 60 * 1000);
    t.setSeconds(0, 0);
    out.plannedFor = toLocalDatetimeValue(t);
  }
  return out;
}

const MOOD_FAMILY_RENAME = { Jealousy: "Jealousy & envy" };
function normalizeMood(m) {
  m = m || {};
  return {
    id: safeId(m.id),
    family: _renamed(MOOD_FAMILY_RENAME, _str(m.family)),
    variant: _str(m.variant),
    intensity: _num(m.intensity, 0, 100, 40),
    estimated: !!m.estimated,
    intensityAfterReframe: _num(m.intensityAfterReframe, 0, 100, null),
    intensityAfterPivot:   _num(m.intensityAfterPivot, 0, 100, null),
  };
}
function normalizeThought(t) {
  t = t || {};
  return {
    id: safeId(t.id),
    text: _str(t.text),
    beliefBefore: _num(t.beliefBefore, 0, 100, null),
    beliefAfter:  _num(t.beliefAfter, 0, 100, null),
    isHot: !!t.isHot,
  };
}

/** Step 2 belief slider defaults to 70 in the UI when unset; persist that on advance/save. */
function persistDefaultBeliefsForFilledThoughts(d) {
  if (!d || d.kind !== "thought-record") return false;
  let changed = false;
  for (const t of d.thoughts || []) {
    if ((t.text || "").trim() && typeof t.beliefBefore !== "number") {
      t.beliefBefore = 70;
      changed = true;
    }
  }
  return changed;
}

// Convenience accessors used across renderers and exporters. Centralizing
// the "hot thought" lookup keeps the rest of the code from re-implementing
// the search and lets us swap selection rules in one place.
function hotThought(entry) {
  const list = (entry && entry.thoughts) || [];
  return list.find(t => t.isHot) || list[0] || null;
}

/** Values for `[thought]` / `[person]` / etc. inside question + reframe templates. */
function templatePlaceholderContext(d) {
  const hot = hotThought(d);
  const thought = ((hot && (hot.text || "").trim()) ||
    ((d.thoughts || []).map(t => (t.text || "").trim()).filter(Boolean)[0]) ||
    (d.trigger || "").trim() ||
    "what I'm telling myself").trim();
  const trigger = ((d.trigger || "").trim());

  const trig = trigger;
  let person = "";
  const mTrig = trig.match(/^([\w'-]+(?:\s+[\w'-]+){0,2})\s+(?:said|says|told|thought|thinks)\b/i);
  if (mTrig) person = (mTrig[1] || "").trim();
  if (!person) person = "they";

  const snippet = trigger || thought;
  const worstCase = thought;
  const fearedOutcome = thought;
  return {
    thought,
    person,
    worstCase,
    fearedOutcome,
    snippet: snippet.length > 120 ? snippet.slice(0, 117) + "…" : snippet,
  };
}

/** Replace `[thought]` / `[person]` / `[worst case]` / `[feared outcome]`; leave `[X]` for users. */
function applyTemplate(template, d) {
  if (!template || typeof template !== "string") return "";
  const { thought, person, worstCase, fearedOutcome } = templatePlaceholderContext(d);
  // Function replacers: user text can contain `$&`, `$'` etc., which string
  // replacements would expand as substitution patterns and corrupt the seed.
  return template
    .replace(/\[thought\]/gi, () => thought)
    .replace(/\[person\]/gi, () => person)
    .replace(/\[worst case\]/gi, () => worstCase)
    .replace(/\[feared\s*outcome\]/gi, () => fearedOutcome);
}

/**
 * Seeds Socratic/reframe from DISTORTION_DEFAULTS[primary].
 * Empty-only so user text is never overwritten. Returns true if any field changed.
 *
 * The reframe method is pre-selected but its template is never written into
 * newThought: it shows as the textarea's placeholder instead. Writing it in
 * saved a stock sentence (with a literal "[X]" in it) as the user's balanced
 * thought whenever they tapped through, which is the "unsupported thought
 * replacement" the Reference tab tells people to avoid. The question type's
 * template does pre-fill, because a question commits the user to nothing.
 */
function seedDraftFromPrimaryDistortion(d) {
  const primary = (d.distortions || [])[0];
  if (!primary) return false;
  const defaults = DISTORTION_DEFAULTS[primary];
  if (!defaults) return false;
  let changed = false;
  if (!d.socraticType) {
    d.socraticType = defaults.socratic;
    changed = true;
  }
  if (!d.reframeMethod) {
    d.reframeMethod = defaults.reframe;
    changed = true;
  }
  if (!(d.socraticQuestion || "").trim()) {
    const t = SOCRATIC_TYPES.find(s => s.type === defaults.socratic);
    if (t && t.template) {
      d.socraticQuestion = applyTemplate(t.template, d);
      changed = true;
    }
  }
  return changed;
}

/** True when the drafted Socratic line still matches the built-in template for the selected type (context-aware). */
function draftedSocraticMatchesBuiltInTemplate(d) {
  if (!d || !d.socraticType || !(d.socraticQuestion || "").trim()) return false;
  const t = SOCRATIC_TYPES.find(s => s.type === d.socraticType);
  if (!t || !t.template) return false;
  return applyTemplate(t.template, d).trim() === String(d.socraticQuestion).trim();
}

/** True when newThought matches the selected method's template (context-aware). */
function draftedNewThoughtMatchesBuiltInTemplate(d) {
  if (!d || !d.reframeMethod || !(d.newThought || "").trim()) return false;
  const r = REFRAME_METHODS.find(m => m.method === d.reframeMethod);
  if (!r || !r.template) return false;
  return applyTemplate(r.template, d).trim() === String(d.newThought).trim();
}

// Where an unparseable journal blob is stashed before loadEntries() gives up
// on it. Returning [] alone isn't safe: the very next persist() (a favorite
// tap, a quick capture) would write over the still-recoverable raw string.
const STORAGE_CORRUPT_KEY = STORAGE_KEY + "-unreadable";
function _stashUnreadableJournal(rawText) {
  if (!rawText) return;
  try { localStorage.setItem(STORAGE_CORRUPT_KEY, rawText); } catch (_) { /* best-effort */ }
  try {
    toast("Your saved journal couldn't be read, so it's starting empty. The unreadable copy was " +
          "kept under \"" + STORAGE_CORRUPT_KEY + "\" in this browser's site data for recovery.",
          { variant: "error", persist: true });
  } catch (_) { /* toast stack not mounted yet */ }
}
function loadEntries() {
  let rawText = null;
  try {
    rawText = localStorage.getItem(STORAGE_KEY);
    const raw = JSON.parse(rawText || "[]");
    // Guard each element: a single null / non-object in stored data (a hand-
    // edit, a devtools mishap, an `undefined` serialized to `null`) would make
    // normalizeEntry throw on `e.id` and take the whole array down to [] — and
    // the next persist() would then overwrite the still-recoverable raw data.
    // Mirror processImportFile's per-element filter so one bad record is
    // dropped, not the entire journal.
    if (Array.isArray(raw)) return raw.filter(x => x && typeof x === "object").map(normalizeEntry);
    _stashUnreadableJournal(rawText);
    return [];
  }
  catch {
    _stashUnreadableJournal(rawText);
    return [];
  }
}
function saveEntries(arr) { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }
function loadDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    return raw ? normalizeEntry(raw) : null;
  }
  catch { return null; }
}
// Underlying synchronous persistence — called from saveDraft on a 300ms
// trailing edge, and flushed eagerly on step transitions, modal close,
// and beforeunload. Keystroke-frequency writes were re-serializing the
// whole draft on every input event on long-form fields.
function _saveDraftNow(d) {
  // Runs from a debounce timer and from beforeunload, so a QuotaExceededError
  // here must never throw into a timer/unload context. The draft stays in
  // memory (state.draft) regardless; we only lose the on-disk autosave.
  try {
    if (hasDraftContent(d)) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
    _draftSaveFailed = false;
  } catch (_) {
    // Best-effort, but not silent: with storage full every keystroke's
    // autosave was swallowed and a long free write evaporated on a tab
    // discard with nothing on screen to warn about it. One notice per
    // failure streak.
    if (!_draftSaveFailed) {
      _draftSaveFailed = true;
      try { toast("Your draft isn't being autosaved — storage is full. Save or export soon.", { variant: "error", persist: true }); } catch (_e) { /* no DOM yet */ }
    }
  }
}
let _draftSaveFailed = false;
let _saveDraftTimer = null;
let _pendingDraft = null;
function saveDraft(d) {
  // Never autosave while editing an existing entry. The edit copy carries the
  // original entry's id, so persisting it to DRAFT_KEY (a) overwrites any
  // stashed unfinished NEW entry the user still expects to resume, and (b) if
  // the tab closes mid-edit, the resumed "draft" would save as a second entry
  // with a duplicate id. Edits live in state.entries once saved; an abandoned
  // edit should simply evaporate.
  if (state.editingId) return;
  _pendingDraft = d;
  if (_saveDraftTimer !== null) return;
  _saveDraftTimer = setTimeout(() => {
    _saveDraftTimer = null;
    if (_pendingDraft) _saveDraftNow(_pendingDraft);
    _pendingDraft = null;
  }, 300);
}
function flushDraft() {
  if (_saveDraftTimer !== null) { clearTimeout(_saveDraftTimer); _saveDraftTimer = null; }
  if (_pendingDraft) { _saveDraftNow(_pendingDraft); _pendingDraft = null; }
}
window.addEventListener("beforeunload", flushDraft);
// Mobile browsers often skip beforeunload when a tab is backgrounded and
// then discarded; pagehide / visibilitychange→hidden are what actually fire
// there, and the last ≤300 ms of typing lives only in the debounce timer.
window.addEventListener("pagehide", flushDraft);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushDraft();
});
function clearDraft() {
  // Drop any pending debounced write so it can't resurrect cleared data.
  if (_saveDraftTimer !== null) { clearTimeout(_saveDraftTimer); _saveDraftTimer = null; }
  _pendingDraft = null;
  localStorage.removeItem(DRAFT_KEY);
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// Sanitize an id from any ingress (import, sync, storage): ids are
// interpolated into HTML attributes and concatenated into querySelector
// strings, so a value with quotes/brackets/backslashes breaks selectors,
// and prototype-named ids ("__proto__" etc.) corrupt plain-object maps.
// Re-mint anything that isn't a plain token. Same gate normalizeEntry uses.
const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const safeId = (raw) => {
  const s = raw == null ? "" : String(raw);
  return ID_RE.test(s) && s !== "__proto__" && s !== "constructor" && s !== "prototype" ? s : newId();
};
// Stamp an entry's updatedAt so P2P sync's last-write-wins merge (js/sync.js)
// can tell which device holds the freshest copy after an in-place mutation
// (favorite, pivot-done, worry resolution, activity log, etc.). The full
// edit-save and new-entry paths already set updatedAt/createdAt themselves.
const touchEntry = e => { if (e) e.updatedAt = new Date().toISOString(); };
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

// Minimal line-icon set. Inline SVG so they inherit currentColor and stay
// crisp at any size — no emoji, no font dependency, no extra requests. Each
// entry is just the inner path(s); svgIcon() wraps them in a sized <svg>.
// Stroke-based by default to match the topbar / nav icon language; a few
// glyphs (bolt, star) opt into a solid fill where a filled mark reads better.
const ICONS = {
  // Activity categories
  connection: '<circle cx="9" cy="8.5" r="2.6"/><circle cx="16" cy="9.5" r="2.2"/><path d="M3.5 19v-.8A3.7 3.7 0 0 1 7.2 14.5h3.6a3.7 3.7 0 0 1 3.7 3.7v.8"/><path d="M16 14.6a3.2 3.2 0 0 1 4.5 2.9V19"/>',
  movement:   '<path d="M21.5 12H18l-2.3 6.5a.4.4 0 0 1-.76-.02L10.7 5.6a.4.4 0 0 0-.77-.01L7.8 12H2.5"/>',
  creation:   '<path d="M11 20.5h9"/><path d="M16.4 4a1.9 1.9 0 0 1 2.7 2.7L8.4 17.4 4 18.5l1.1-4.4z"/>',
  selfcare:   '<path d="M12 20.3 4.8 13a4.4 4.4 0 0 1 6.2-6.2l1 1 1-1A4.4 4.4 0 0 1 20.2 13z"/>',
  chore:      '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M8 12l2.8 2.8L16.4 9"/>',
  work:       '<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5"/><path d="M3.5 12.5h17"/>',
  meaning:    '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  rest:       '<path d="M20.4 13.4A8 8 0 1 1 10.6 3.6a6.3 6.3 0 0 0 9.8 9.8z"/>',
  other:      '<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  // Entry / state marks
  flame:      '<path d="M12 2.5c3 3.5 5 6.2 5 9.3a5 5 0 0 1-10 0c0-1.7.6-3 1.6-4.2.2 1.2 1 2 2.1 2.2C9.6 7.4 10.4 5 12 2.5z"/>',
  bolt:       '<path d="M13 2.5 4.5 13.5H10l-1 8 8.5-11.5H12z" fill="currentColor" stroke="none"/>',
  clock:      '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 1.9"/>',
  star:       '<path d="M12 3.3l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.3 6.9 19l1-5.7-4.1-4 5.7-.8z" fill="currentColor" stroke="none"/>',
  sparkle:    '<path d="M12 3.5c.6 3.6 1.9 4.9 5.5 5.5-3.6.6-4.9 1.9-5.5 5.5-.6-3.6-1.9-4.9-5.5-5.5 3.6-.6 4.9-1.9 5.5-5.5z" fill="currentColor" stroke="none"/><path d="M18.5 14.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z" fill="currentColor" stroke="none"/>',
  // Directional + control marks (replace ← → ＋ × ✓ used as UI affordances)
  arrowRight: '<path d="M4 12h14"/><path d="M12.5 6.5 18 12l-5.5 5.5"/>',
  arrowLeft:  '<path d="M20 12H6"/><path d="M11.5 6.5 6 12l5.5 5.5"/>',
  plus:       '<path d="M12 5v14M5 12h14"/>',
  close:      '<path d="M6 6l12 12M18 6 6 18"/>',
  check:      '<path d="M4.5 12.5 10 18l9.5-11"/>',
};
// Returns an inline SVG string for the named icon. `cls` adds modifier
// classes; all icons share the `.ico` base for sizing/alignment in CSS.
function svgIcon(name, cls = "") {
  const inner = ICONS[name];
  if (!inner) return "";
  return `<svg class="ico${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
// Clock-skew guard. A device with the wrong date set could otherwise
// stamp entries minutes/days in the future, breaking sort order and the
// 30-day heatmap. Anything more than a minute ahead of now gets pulled
// back to now. One minute of slack absorbs ordinary NTP drift.
function clampDate(iso) {
  const t = Date.parse(iso);
  if (isNaN(t)) return new Date().toISOString();
  const now = Date.now();
  return t > now + 60000 ? new Date(now).toISOString() : iso;
}
const band = n => INTENSITY_BANDS.find(b => n <= b.max) || INTENSITY_BANDS[INTENSITY_BANDS.length - 1];

// Format a Date as a LOCAL "YYYY-MM-DDTHH:MM" string — the value shape
// <input type="datetime-local"> and `new Date(str)` both interpret as local
// wall-clock time. toISOString().slice(0,16) looks identical but is UTC, so
// using it shifts the value by the timezone offset (hours in the past east
// of UTC, hours further ahead west of it).
function toLocalDatetimeValue(date) {
  const pad = n => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
    "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

// Coerce any stored plannedFor value into the shape <input type="datetime-local">
// accepts. Sample entries and some historical saves carry full ISO-Z strings,
// which the input silently rejects (it renders blank).
function toDatetimeLocalInputValue(v) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return v;
  const t = Date.parse(v);
  return isNaN(t) ? "" : toLocalDatetimeValue(new Date(t));
}

function emptyEntry() {
  // Default: the thought record (kind: "thought-record").
  // Other kinds use the dedicated factories below.
  return normalizeEntry({
    kind: "thought-record",
    thoughts: [normalizeThought({ isHot: true })],
    moods: [normalizeMood({})],
  });
}

function emptyFreeform() {
  return normalizeEntry({
    kind: "freeform",
    moods: [],       // free-form starts with zero moods; user can add via the optional widget
    thoughts: [],    // no thoughts captured
  });
}

function emptyActivity() {
  const t = new Date(Date.now() + 60 * 60 * 1000);
  t.setSeconds(0, 0);
  return normalizeEntry({
    kind: "activity",
    moods: [],
    thoughts: [],
    plannedFor: toLocalDatetimeValue(t),
  });
}

function emptyWorry() {
  return normalizeEntry({
    kind: "worry",
    urgency: 5,
    moods: [],
    thoughts: [],
  });
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  // Guard against corrupted timestamps (hand-edited backups, half-
  // written entries) — printing the literal "Invalid Date" string in
  // the UI is worse than rendering nothing.
  if (isNaN(d.getTime())) return "";
  // `undefined` locale = use the browser's default so a German user sees
  // "5. Nov. 2025" and an en-US user still sees "Nov 5, 2025".
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function fmtDateTime(iso) { return fmtDate(iso) + " · " + fmtTime(iso); }

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function daysBetween(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
}
function dateGroupLabel(iso) {
  const days = daysBetween(new Date(), new Date(iso));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (days < 14) return "Last week";
  if (days < 30) return "This month";
  if (days < 90) return "Last 3 months";
  return "Earlier";
}

function entryToMd(e, idx) {
  // Dispatch by kind — each kind has a different shape so it gets its
  // own render. Thought-record keeps the full step layout.
  if (e.kind === "freeform") return freeformToMd(e, idx);
  if (e.kind === "activity") return activityToMd(e, idx);
  if (e.kind === "worry")    return worryToMd(e, idx);
  return thoughtRecordToMd(e, idx);
}

function freeformToMd(e, idx) {
  const L = [];
  L.push("---", "", "### Free write " + (idx + 1), "");
  if (e.trigger) L.push("**" + e.trigger + "**", "");
  if (e.createdAt) L.push("*" + fmtDateTime(e.createdAt) + "*", "");
  L.push(e.body || "—", "");
  const moods = (e.moods || []).filter(m => m.family);
  if (moods.length) {
    L.push("**Mood" + (moods.length > 1 ? "s" : "") + ":**");
    moods.forEach(m => {
      const label = m.variant ? cap(m.variant) + " (" + m.family + ")" : m.family;
      L.push("- " + label + " — " + m.intensity + "/100");
    });
    L.push("");
  }
  if (e.isFavorite) L.push("★ *Coping card — pinned.*", "");
  return L.join("\n");
}

function activityToMd(e, idx) {
  const L = [];
  const cat = ACTIVITY_CATEGORIES.find(c => c.value === e.category) || { label: "Activity" };
  L.push("---", "", "### Activity " + (idx + 1) + " · " + cat.label, "");
  L.push("**Plan:** " + (e.body || "—"));
  if (e.plannedFor) L.push("**When:** " + fmtDateTime(e.plannedFor));
  L.push("");
  if (typeof e.predictedP === "number" || typeof e.predictedM === "number") {
    L.push("**Predicted:**");
    if (typeof e.predictedP === "number") L.push("- Pleasure: " + e.predictedP + "/10");
    if (typeof e.predictedM === "number") L.push("- Mastery: "  + e.predictedM + "/10");
    L.push("");
  }
  if (e.completedAt) {
    L.push("**Actual:** *(logged " + fmtDateTime(e.completedAt) + ")*");
    if (typeof e.actualP === "number") {
      const d = typeof e.predictedP === "number" ? " (Δ " + (e.actualP - e.predictedP) + ")" : "";
      L.push("- Pleasure: " + e.actualP + "/10" + d);
    }
    if (typeof e.actualM === "number") {
      const d = typeof e.predictedM === "number" ? " (Δ " + (e.actualM - e.predictedM) + ")" : "";
      L.push("- Mastery: " + e.actualM + "/10" + d);
    }
    if (e.activityNotes) L.push("", e.activityNotes);
    L.push("");
  }
  return L.join("\n");
}

function worryToMd(e, idx) {
  const L = [];
  L.push("---", "", "### Worry " + (idx + 1), "");
  L.push(e.worryText || "—", "");
  if (typeof e.urgency === "number") L.push("- Urgency: " + e.urgency + "/10");
  if (e.parkedAt) L.push("- Parked: " + fmtDateTime(e.parkedAt));
  if (e.scheduledFor) L.push("- Scheduled window: " + fmtDateTime(e.scheduledFor));
  const resLabel = e.resolution === "dissolved" ? "Dissolved on its own"
                : e.resolution === "escalated" ? "Worked through (escalated to thought record)"
                : e.resolution === "postponed" ? "Postponed to next window"
                : "Parked";
  L.push("- Status: " + resLabel + (e.resolvedAt ? " · " + fmtDateTime(e.resolvedAt) : ""));
  if (e.linkedEntryId) L.push("- Linked thought record: " + e.linkedEntryId);
  L.push("");
  return L.join("\n");
}

function thoughtRecordToMd(e, idx) {
  const L = [];
  L.push("---", "", "### Entry " + (idx + 1), "");
  if (e.isQuick) L.push("*⚡ Quick capture — structured steps can be continued from the journal.*", "");
  L.push("**1. Trigger (Antecedent)**", "", e.trigger || "—", "");

  L.push("**2. Initial Reaction**", "");

  // Thoughts: list each, highlight hot.
  const thoughts = e.thoughts || [];
  if (thoughts.length) {
    L.push("*Automatic thoughts:*", "");
    thoughts.forEach((t, i) => {
      const hotTag = t.isHot ? " 🔥 **(hot)**" : "";
      const belief = typeof t.beliefBefore === "number" ? " — belief " + t.beliefBefore + "%" : "";
      L.push(`${i + 1}. "${t.text || "—"}"${hotTag}${belief}`);
    });
    L.push("");
  }

  // Moods: list each with three-stage arc where present.
  const moods = e.moods || [];
  if (moods.length) {
    L.push("*Moods:*", "");
    moods.forEach(m => {
      const label = m.variant ? (cap(m.variant) + " (" + m.family + ")") : (m.family || "Mood");
      const estTag = m.estimated ? " *(est.)*" : "";
      let arc = m.intensity + "/100";
      if (typeof m.intensityAfterReframe === "number") arc += " → " + m.intensityAfterReframe + " after reframe";
      if (typeof m.intensityAfterPivot   === "number") arc += " → " + m.intensityAfterPivot   + " after pivot";
      L.push(`- ${label} — ${arc}${estTag}`);
    });
    L.push("");
  }

  if (e.bodyCheck) {
    const infTag = e.bodyInferred ? " *(pieced together later)*" : "";
    L.push("- **Body Check:** " + e.bodyCheck + infTag, "");
  }

  // Distortion-first: naming the pattern points to how to challenge and
  // reframe, so it leads and the evidence trial follows. Matches the capture
  // flow's Steps 3 (Distortion) and 4 (Challenge).
  // When thoughtsAccurate is set the writer explicitly opted out of the
  // distortion / challenge / reframe arc — only emit those sections if
  // they actually carry content, otherwise the export looks padded with
  // empty "—" placeholders.
  L.push("**3. Distortion Identified**", "");
  if (e.thoughtsAccurate) {
    L.push("*Marked as accurate, not distorted — the thought here was true to the writer; the rest of the entry holds it rather than arguing with it.*", "");
  } else {
    L.push(e.distortions.length ? e.distortions.map(d => "**" + d + "**").join(" + ") : "—", "");
    if (e.distortionNote) L.push(e.distortionNote, "");
  }

  const hasChallenge = e.evidenceFor || e.evidenceAgainst || e.socraticQuestion || e.socraticAnswer;
  if (!e.thoughtsAccurate || hasChallenge) {
    L.push("**4. Challenge (The Trial)**", "");
    L.push("- **Evidence FOR:** " + (e.evidenceFor || "—"), "");
    L.push("- **Evidence AGAINST:** " + (e.evidenceAgainst || "—"), "");
    if (e.socraticQuestion) L.push('- **Socratic Question:** "' + e.socraticQuestion + '"', "");
    if (e.socraticAnswer) L.push("- **Answer:** " + e.socraticAnswer, "");
    if (!e.socraticQuestion && !e.socraticAnswer) L.push("");
  }

  const hasReframe = e.reframeMethod || e.newThought;
  if (!e.thoughtsAccurate || hasReframe) {
    L.push("**5. Reframe**", "");
    L.push("- **Method:** " + (e.reframeMethod || "—"), "");
    L.push('- **New Thought:** "' + (e.newThought || "—") + '"', "");
  }
  const hot = hotThought(e);
  if (hot && typeof hot.beliefAfter === "number") {
    const drop = typeof hot.beliefBefore === "number" ? (" (Δ " + (hot.beliefAfter - hot.beliefBefore) + ")") : "";
    L.push("- **Belief in hot thought (after):** " + hot.beliefAfter + "%" + drop, "");
  }
  if (typeof e.newThoughtBelief === "number") {
    L.push("- **Belief in new thought:** " + e.newThoughtBelief + "%", "");
  }
  if (e.newFeelings) L.push("- **New feelings:** " + e.newFeelings, "");

  L.push("**6. The Pivot**", "", e.pivot || "—", "");
  if (e.pivotPrediction) L.push("- **Expected:** " + e.pivotPrediction, "");
  if (e.pivotDone) {
    L.push("", "*Pivot completed" + (e.pivotDoneAt ? " — " + fmtDateTime(e.pivotDoneAt) : "") + ".*", "");
    if (e.pivotReflection) {
      L.push("**What happened**", "", e.pivotReflection, "");
    }
    // Post-pivot mood ratings (Step 8) — only render if any are present.
    const afterPivot = moods.filter(m => typeof m.intensityAfterPivot === "number");
    if (afterPivot.length) {
      L.push("**Moods after acting**", "");
      afterPivot.forEach(m => {
        const label = m.variant ? cap(m.variant) : (m.family || "Mood");
        const delta = m.intensityAfterPivot - m.intensity;
        L.push(`- ${label}: ${m.intensity} → ${m.intensityAfterPivot} (Δ ${delta > 0 ? "+" : ""}${delta})`);
      });
      L.push("");
    }
  }
  if (e.isFavorite) L.push("", "★ *Coping card — pinned.*", "");
  return L.join("\n");
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  // Revoke on a later tick, not synchronously: the click only *queues* the
  // download, and Safari (and older Firefox) can abort it if the blob URL is
  // gone before the fetch starts — the user gets a 0-byte or missing backup.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function toast(message, opts) {
  opts = opts || {};
  const isError = opts.variant === "error";
  const persistent = !!opts.persist;
  const stack = document.getElementById("toasts");
  // Errors need an assertive announcement — they interrupt the user's
  // current task in screen-reader output. Non-error toasts stay polite
  // (queued behind whatever the SR is currently announcing). Resetting
  // the attribute on the container before each toast ensures the most
  // recent toast's urgency is what the AT picks up.
  if (stack) stack.setAttribute("aria-live", isError ? "assertive" : "polite");
  const el = document.createElement("div");
  el.setAttribute("role", isError ? "alert" : "status");
  el.className = "toast"
    + (opts.action ? " toast--action" : "")
    + (isError ? " toast--error" : "")
    + (persistent ? " toast--persist" : "");
  // Errors default to 8s (long enough to read), non-errors to 2.4s. A
  // persistent toast doesn't auto-dismiss; users tap the × to clear.
  const defaultMs = isError ? 8000 : 2400;
  const lifespan = (typeof opts.ms === "number") ? opts.ms : defaultMs;
  const iconPath = isError
    ? '<path d="M8 5v4M8 11v0.5M8 2 1 14h14z"/>'
    : '<path d="M3 8l3 3 7-7"/>';
  el.innerHTML = `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
    <span class="toast-message">${esc(message)}</span>`;
  if (opts.action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = opts.action.label;
    // One-shot: a double-tap (easy on mobile) lands both taps before the
    // toast starts leaving, and running the action twice would e.g. splice
    // the same restored entry in twice, creating two cards with one id.
    // Guard so onClick fires at most once.
    let _fired = false;
    btn.addEventListener("click", () => {
      if (_fired) return;
      _fired = true;
      try { opts.action.onClick(); } catch(_) {}
      dismiss();
    });
    el.appendChild(btn);
  }
  // Close × for persistent toasts (errors, kept-open notices) so keyboard
  // and screen-reader users have a clear dismiss path.
  if (persistent || isError) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-close";
    close.setAttribute("aria-label", "Dismiss");
    close.innerHTML = svgIcon("close");
    close.addEventListener("click", dismiss);
    el.appendChild(close);
  }
  // Optional shrinking countdown bar so a time-limited action (e.g. the 6s
  // "Undo" on delete) is visibly running out, not a silent deadline. A CSS
  // animation (.toast-countdown) rather than a transition: the transition
  // version set its end state in a requestAnimationFrame that ran before the
  // bar's first style pass, so there was no start state to transition from
  // and the bar sat at scaleX(0), invisible, from the first frame. Skipped
  // for persistent toasts (no deadline) and when reduced-motion is requested.
  if (opts.countdown && !persistent && !_prefersReducedMotion()) {
    const bar = document.createElement("div");
    bar.className = "toast-countdown";
    bar.setAttribute("aria-hidden", "true");
    bar.style.animationDuration = lifespan + "ms";
    el.appendChild(bar);
  }
  stack.appendChild(el);
  // The stack is anchored to the bottom of the screen, so a toast arriving
  // under others pushed them up a whole toast-height in one frame. Grow its
  // slot from nothing instead; the CSS toastIn handles the fade and rise.
  if (el.previousElementSibling) animateSlot(el, "in");
  let dismissed = false;
  let autoTimer = null;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    if (autoTimer !== null) { clearTimeout(autoTimer); autoTimer = null; }
    // Fade out while the slot closes, so the toasts above glide down into
    // the space instead of dropping into it when the node is removed.
    el.classList.add("is-leaving");
    animateSlot(el, "out", () => el.remove());
  }
  if (!persistent) autoTimer = setTimeout(dismiss, lifespan);
  return { dismiss };
}

// Grow ("in") or close ("out") an element's slot in a vertical stack: its
// height, vertical padding, borders and margins, plus the flex gap it owns,
// so its neighbours move smoothly instead of jumping a whole slot in one
// frame. "out" also fades the element and holds the closed state until
// `done` runs, which is where callers remove it. `done` runs at once when
// there's no motion to wait for (reduced motion, no WAAPI).
function animateSlot(el, dir, done) {
  const dur = motionMs("--dur-medium");
  const parent = el && el.parentElement;
  if (!parent || !dur || typeof el.animate !== "function") { if (done) done(); return; }
  const cs = getComputedStyle(el);
  const gap = parseFloat(getComputedStyle(parent).rowGap) || 0;
  // The gap sits between siblings: absorb the one below when there's a
  // sibling below, else the one above, else there's none to absorb.
  const below = !!el.nextElementSibling;
  const eat = (el.previousElementSibling || below) ? -gap : 0;
  const open = {
    height: el.getBoundingClientRect().height + "px",
    paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom,
    borderTopWidth: cs.borderTopWidth, borderBottomWidth: cs.borderBottomWidth,
    marginTop: cs.marginTop, marginBottom: cs.marginBottom,
  };
  const shut = {
    height: "0px", paddingTop: "0px", paddingBottom: "0px",
    borderTopWidth: "0px", borderBottomWidth: "0px",
    marginTop: (below ? 0 : eat) + "px", marginBottom: (below ? eat : 0) + "px",
  };
  const frames = dir === "in"
    ? [{ ...shut, opacity: 0 }, { ...open, opacity: 1 }]
    : [{ ...open, opacity: 1 }, { opacity: 0, offset: 0.6 }, { ...shut, opacity: 0, transform: "translateY(6px) scale(0.97)" }];
  // Counted, not flagged: a toast dismissed while it's still growing in runs
  // both motions at once, and the first to end mustn't unclip the second.
  el._slotRuns = (el._slotRuns || 0) + 1;
  el.classList.add("is-moving");
  const anim = el.animate(frames, {
    duration: dur,
    easing: motionEase(),
    // A closed slot must stay closed until the node is removed, or it
    // reopens for a frame at the end.
    fill: dir === "out" ? "forwards" : "none",
  });
  let finished = false;
  const end = () => {
    if (finished) return;
    finished = true;
    el._slotRuns -= 1;
    if (!el._slotRuns) el.classList.remove("is-moving");
    if (done) done();
  };
  anim.onfinish = end;
  anim.oncancel = end;
  // Net for a node removed mid-motion (a detached node's animation never
  // finishes) so `done` still runs.
  setTimeout(end, dur + 100);
}

// The app's standard easing (--ease), for Web Animations calls.
function motionEase() {
  let v = "";
  try { v = getComputedStyle(document.documentElement).getPropertyValue("--ease").trim(); } catch (_) {}
  return v || "ease-out";
}

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════

const state = {
  entries: loadEntries(),
  draft: loadDraft() || emptyEntry(),
  editingId: null,
  view: "journal",
  captureStep: 1,
  search: "",
  filter: "",             // distortion-name filter
  viewFilter: "all",      // scope: all | favorites | unfinished | week | pivoted | pending
  // ID of the entry being viewed/edited in the Step 8 outcome screen.
  outcomeEntryId: null,
  expandedIds: new Set(),
  modal: null,
  // Working buffer for the quick-capture modal so the textarea + slider can
  // live-update without churning state.draft (which is reserved for the full
  // 7-step flow).
  quickDraft: null,
  // Same shape as quickDraft but for the log-activity modal — holds the
  // entry id + transient slider values until the user saves.
  logActivityDraft: null,
  // When a worry-escalate is in progress, holds the worry's id. The worry
  // itself stays parked (no resolution set) until the thought-record draft
  // is actually saved — backing out of capture should leave the worry
  // available for a different resolution rather than orphan-linking it.
  pendingEscalateFromWorryId: null,
  // Holds the requested kind while the "switching will lose your draft"
  // modal is open. Cleared on cancel; consumed on confirm.
  pendingModeSwitch: null,
  // Holds a pending "start a fresh draft" action (a thunk) while the
  // "starting a new entry will discard your draft" modal is open. Set by
  // startFreshDraft() when the current draft has content; run on confirm.
  pendingDraftAction: null,
  settings: loadSettings(),
  // Print mode: when true, every entry renders expanded. Used by the
  // Print/PDF flow so the browser print dialog gets a full transcript.
  printMode: false,
  // Locked: when a PIN is set and the current session hasn't unlocked yet,
  // the render() function short-circuits and shows the lock screen instead
  // of the journal. Initialized in the boot block below.
  locked: false,
  lockError: "",
  // One-shot: the next lock-screen render shakes the PIN field (a submit
  // just failed). Cleared by renderLockScreen.
  lockShake: false,
  // Inline-toggle for the "Forgot PIN?" explainer on the lock screen.
  // Replaces the old browser alert() with a quieter on-screen panel.
  lockHelpOpen: false,
  // Transient buffer for the set-pin / remove-pin modal forms — keeps the
  // ongoing PIN-entry attempt off the persistent state.
  pinForm: { current: "", next: "", confirm: "", error: "" },
};

// Resolve "auto" against the system preference at call time so toggling the
// OS theme while the app is open updates the rendered theme.
function resolveTheme(setting) {
  if (setting === "light" || setting === "dark") return setting;
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}
function applyTheme() {
  const resolved = resolveTheme(state.settings.theme);
  document.documentElement.setAttribute("data-theme", resolved);
  // The <head> ships with two media-scoped theme-color metas (one per
  // color-scheme) so first paint matches OS preference without waiting
  // on JS. When the user picks an explicit Light/Dark override (i.e.
  // setting !== "auto"), we want to win over the media-scoped pair —
  // append (or update) a third un-scoped meta last in the head so the
  // browser uses it. For "auto" we remove the override so the media
  // metas take back over.
  let override = document.getElementById("themeColorOverride");
  if (state.settings.theme === "auto") {
    if (override) override.remove();
  } else {
    if (!override) {
      override = document.createElement("meta");
      override.id = "themeColorOverride";
      override.name = "theme-color";
      document.head.appendChild(override);
    }
    override.setAttribute("content", resolved === "light" ? "#f5efe6" : "#1a1715");
  }
}
// Run `update` (a render that replaces what's on screen) as a cross-fade
// from the old screen to the new one, where the browser has View Transitions
// (Chromium 111+, Safari 18+). Without it a view or step change was a hard
// cut: the old screen vanished in one frame and the new one faded up from an
// empty page. Elsewhere, under reduced motion and in a hidden tab, `update`
// just runs.
//
// The DOM changes a frame or two later than the call (the browser snapshots
// the old screen first), so callers change state synchronously and pass only
// the render. Inside `update`, _crossFading tells render() and callers that
// the cross-fade is covering the change, so they skip their own fade-in.
let _crossFading = false;
function crossFade(update) {
  if (typeof document.startViewTransition !== "function" || _prefersReducedMotion() ||
      document.visibilityState === "hidden") {
    update();
    return;
  }
  let t;
  try {
    t = document.startViewTransition(() => {
      _crossFading = true;
      // Rethrow outside the transition so the global error net still sees
      // a render failure, as it would a synchronous one.
      try { update(); } catch (e) { setTimeout(() => { throw e; }); }
      finally { _crossFading = false; }
    });
  } catch (_) { update(); return; }
  // A transition cut short by the next one (a quick second tap) rejects
  // `ready`. That's expected, not an error to report.
  t.ready.catch(() => {});
  t.finished.catch(() => {});
}
// The theme cross-fades too: every colour in the app flips in the same frame,
// and ink ↔ paper read as a flash.
function switchThemeSmoothly(update) {
  crossFade(update);
}
// Print always renders as light-on-white: the print stylesheet only resets
// html/body, so dark-theme tokens (muted kickers, near-invisible rules)
// otherwise carried through to paper. Covers both the in-app Print / PDF
// export and a plain Ctrl/Cmd+P.
window.addEventListener("beforeprint", () => {
  document.documentElement.setAttribute("data-theme", "light");
});
window.addEventListener("afterprint", () => { applyTheme(); });
// Watch the OS preference so "auto" updates live without a reload.
if (window.matchMedia) {
  try {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
      if (state.settings.theme === "auto") switchThemeSmoothly(applyTheme);
    });
  } catch(_) { /* older Safari — ignore */ }
}

// Stale-nudge logic. Returns the most recent entry's age in ms, or Infinity
// if there are no entries (in which case the nudge would show for someone
// who's never written — which we don't want, so the caller short-circuits).
function msSinceLastEntry() {
  if (!state.entries.length) return Infinity;
  const latest = state.entries.reduce((acc, e) => {
    const t = new Date(e.createdAt || 0).getTime();
    return t > acc ? t : acc;
  }, 0);
  return Date.now() - latest;
}
function shouldShowNudge() {
  const intervalMs = REMINDER_MS[state.settings.reminderInterval] || 0;
  if (!intervalMs) return false;
  if (!state.entries.length) return false; // don't nag people who've never written
  if (Date.now() < (state.settings.nudgeSnoozedUntil || 0)) return false;
  return msSinceLastEntry() >= intervalMs;
}
// Smooth scroll wrapper that respects prefers-reduced-motion. The CSS
// @media query handles `scroll-behavior: auto` for declarative scrolls,
// but JS calls to window.scrollTo({behavior:"smooth"}) and
// node.scrollIntoView({behavior:"smooth"}) bypass that — they need this
// runtime check.
function _prefersReducedMotion() {
  try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
}
// A motion duration token from styles.css (e.g. "--dur-medium") in ms. JS
// that waits on a CSS transition reads the token instead of hard-coding a
// copy of it, so retuning the motion in one place can't leave a timer
// removing an element mid-fade. Reduced motion is ~0 everywhere, matching
// the global override at the end of the motion rules.
function motionMs(token) {
  if (_prefersReducedMotion()) return 0;
  let raw = "";
  try { raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim(); } catch (_) {}
  const n = parseFloat(raw);
  if (!isFinite(n)) return 0;
  return /ms$/i.test(raw) ? n : n * 1000;
}
function smoothScrollTo(opts) {
  if (_prefersReducedMotion()) window.scrollTo({ ...opts, behavior: "auto" });
  else window.scrollTo(opts);
}
function smoothScrollIntoView(node, opts) {
  if (!node) return;
  if (_prefersReducedMotion()) node.scrollIntoView({ ...opts, behavior: "auto" });
  else node.scrollIntoView(opts);
}

// Screen chrome that page content slides underneath. The browser's own
// focus scrolling (and scrollIntoView) knows nothing about any of it, so a
// field it "reveals" can land right behind the capture step's sticky
// Back / Continue bar or the bottom nav, which together cover ~150px just
// above an Android keyboard. revealInView() measures around them instead.
const _BOTTOM_CHROME_SEL = ".bottom-nav, .capture-footer";
const _TOP_CHROME_SEL = ".sync-incoming-bar, .sw-update-banner";

function _nearestScrollBox(el) {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

// The slice of the screen where `el` can actually be seen, in client coords:
// the visual viewport (which already excludes an iOS keyboard), minus chrome
// pinned over either edge, clipped to the scrolling dialog `box` if any.
function _visibleBandFor(el, box) {
  const vv = window.visualViewport;
  let top = (vv && vv.offsetTop) || 0;
  let bottom = top + ((vv && vv.height) || window.innerHeight);
  const rects = sel => Array.from(document.querySelectorAll(sel))
    .filter(c => !c.contains(el))
    .map(c => c.getBoundingClientRect())
    .filter(r => r.height > 0);
  // A dialog or the lock screen sits above the page's own chrome.
  if (!el.closest(".modal-overlay, .lock-screen")) {
    // Walk up from the bottom edge. Chrome only covers content while it is
    // anchored there (or stacked on chrome that is): the capture footer back
    // in normal flow at the end of a step is just part of the page, and the
    // nav slid away under .kb-open, or a footer behind an iOS keyboard,
    // starts below the band and covers nothing.
    for (const r of rects(_BOTTOM_CHROME_SEL).sort((a, b) => b.bottom - a.bottom)) {
      if (r.top >= bottom) continue;
      if (r.bottom < bottom - 4) break;
      bottom = r.top;
    }
  }
  for (const r of rects(_TOP_CHROME_SEL)) {
    if (r.top <= top + 16 && r.bottom > top) top = Math.max(top, r.bottom);
  }
  if (box) {
    const b = box.getBoundingClientRect();
    top = Math.max(top, b.top);
    bottom = Math.min(bottom, b.bottom);
  }
  return { top, bottom };
}

// Scroll just far enough that `el` sits fully inside the visible band, or,
// with block "center", centre it there (a field about to be typed into).
// Anything taller than the band gets its top edge shown, since that's where
// reading starts. Scrolls the enclosing dialog first and the page with
// whatever is left over. No-op when `el` is already fully in view.
function revealInView(el, { block = "nearest", rect = null } = {}) {
  if (!el || !el.isConnected) return false;
  // `rect` stands in for where `el` is about to be (a card still opening).
  const r = rect || el.getBoundingClientRect();
  if (!r.height && !r.width) return false;
  const box = _nearestScrollBox(el);
  const { top, bottom } = _visibleBandFor(el, box);
  const pad = 12;
  const room = bottom - top - 2 * pad;
  if (room <= 0) return false;
  if (r.top >= top + pad && r.bottom <= bottom - pad) return false;
  let delta;
  if (r.height > room)              delta = r.top - (top + pad);
  else if (block === "center")      delta = (r.top + r.bottom) / 2 - (top + bottom) / 2;
  else if (r.bottom > bottom - pad) delta = r.bottom - (bottom - pad);
  else                              delta = r.top - (top + pad);
  const behavior = _prefersReducedMotion() ? "auto" : "smooth";
  if (box) {
    const target = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, box.scrollTop + delta));
    delta -= target - box.scrollTop;
    box.scrollTo({ top: target, behavior });
  }
  if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, behavior });
  return true;
}

// Focus a field because the user asked for it indirectly (tapped "Add
// another thought", or a starter chip that writes into the box). Keyboard
// avoidance only moves the page for focus the user caused, and this marks
// the focus as theirs so the field is brought clear of the keyboard and the
// sticky footer like a direct tap would be.
let _focusRequestedFor = null;
function focusForUser(el) {
  if (!el || typeof el.focus !== "function") return;
  _focusRequestedFor = el;
  try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (__) {} }
  _focusRequestedFor = null;
}

function humanDuration(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "moments";
  const min = Math.floor(sec / 60);
  if (min < 60) return min + " minute" + (min === 1 ? "" : "s");
  const hr = Math.floor(min / 60);
  if (hr < 48) return hr + " hour" + (hr === 1 ? "" : "s");
  const day = Math.floor(hr / 24);
  if (day < 14) return day + " day" + (day === 1 ? "" : "s");
  const wk = Math.floor(day / 7);
  return wk + " week" + (wk === 1 ? "" : "s");
}

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function setView(v) {
  const changed = state.view !== v;
  state.view = v;
  if (v === "capture" && state.editingId === null && !hasDraftContent(state.draft)) {
    state.captureStep = 1;
  }
  if (changed) crossFade(render);
  else render();
}

function hasDraftContent(d) {
  if (!d) return false;
  const anyThought = (d.thoughts || []).some(t => (t.text || "").trim());
  const anyMood    = (d.moods    || []).some(m => m.family);
  const trPartial =
    d.kind === "thought-record" && (
      !!d.thoughtsAccurate ||
      String(d.socraticType || "").trim() ||
      String(d.socraticQuestion || "").trim() ||
      String(d.socraticAnswer || "").trim() ||
      String(d.newFeelings || "").trim() ||
      String(d.pivotPrediction || "").trim() ||
      String(d.evidenceFor || "").trim() ||
      String(d.evidenceAgainst || "").trim() ||
      String(d.bodyCheck || "").trim() ||
      !!d.bodyInferred ||
      String(d.reframeMethod || "").trim() ||
      String(d.newThought || "").trim() ||
      typeof d.newThoughtBelief === "number" ||
      String(d.distortionNote || "").trim() ||
      String(d.pivot || "").trim()
    );
  // Each non-thought-record kind has its own minimum content signal.
  const freeformFilled = d.kind === "freeform" && ((d.body || "").trim() || anyMood);
  const activityFilled = d.kind === "activity" && ((d.body || "").trim() || d.category);
  const worryFilled    = d.kind === "worry"    && (d.worryText || "").trim();
  const distPick = ((d.distortions || []).length > 0);
  return !!(d.trigger || anyThought || anyMood || d.evidenceFor || d.evidenceAgainst ||
           d.newThought || d.pivot || distPick ||
           freeformFilled || activityFilled || worryFilled || trPartial);
}

// Suppress the storage-event listener while we're the writer ourselves.
// `storage` only fires in OTHER tabs, but defensive: if the browser ever
// dispatches it locally (some embedded webviews do), the guard prevents
// a redundant re-load + render mid-write.
let _persistingLocally = false;

// Returns true when the write reached disk, false on quota/error. Callers
// that show a success toast and close a modal MUST check this — otherwise
// they clobber the quota-error modal set below and lie about the outcome.
function persist() {
  // Wrap the write so a QuotaExceededError surfaces a styled blocking
  // modal instead of silently failing. The user's most recent entry
  // sits at state.entries[0] and stays in memory regardless — we never
  // lose data on a quota failure, only the persistence to disk.
  _persistingLocally = true;
  try {
    saveEntries(state.entries);
    // Push the new state to a paired device, if P2P sync is connected.
    if (typeof syncBroadcast === "function") syncBroadcast();
    return true;
  } catch (err) {
    const isQuota = err && (
      err.name === "QuotaExceededError" ||
      err.code === 22 ||
      err.code === 1014   // Firefox legacy code
    );
    if (isQuota) {
      state.modal = "quota-error";
      render();
    } else {
      toast("Couldn't save — " + (err && err.message ? err.message : "unknown error"),
            { variant: "error", persist: true });
    }
    return false;
  } finally {
    _persistingLocally = false;
  }
}

// Another tab in the same origin just wrote to localStorage. Pull the
// fresh data into this tab so the user doesn't keep working against
// stale state. We can't merge drafts safely (last-writer-wins for the
// in-progress one), so for a remote draft change we surface a toast
// instead of overwriting whatever the user is currently typing.
let _draftTabToastUntil = 0;
window.addEventListener("storage", (e) => {
  if (_persistingLocally) return;
  if (!e.key) return;  // null key = storage.clear() — ignore
  // Don't yank focus/caret out from under someone mid-typing: if they're in
  // an editable field, pull the fresh data into memory but defer the render
  // (the next natural render picks it up). A background cross-tab change to
  // entries/settings isn't urgent enough to interrupt active typing.
  const ae = document.activeElement;
  const typing = ae && (ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" ||
    (ae.tagName === "INPUT" && !["checkbox", "radio", "range", "button"].includes(ae.type)));
  if (e.key === STORAGE_KEY) {
    state.entries = loadEntries();
    if (!typing) render();
    // Only one tab holds the peer link; a save made in the other tab sat
    // unsynced until this tab happened to save something itself.
    if (typeof syncBroadcast === "function") syncBroadcast();
  } else if (e.key === SETTINGS_KEY) {
    state.settings = loadSettings();
    // A theme picked in the other tab updated state here but never the
    // document attribute / theme-color meta, so this tab stayed on the old
    // theme until reload.
    applyTheme();
    if (!typing) render();
  } else if (e.key === DRAFT_KEY) {
    // If the local user has typed into the draft, they'd lose work if
    // we overwrote. Just warn and let them decide. The other tab autosaves
    // on a 300 ms trailing edge, so this fires once per write while they
    // type — show one notice at a time, not a stack of twenty.
    if (hasDraftContent(state.draft)) {
      if (!_draftTabToastUntil || Date.now() > _draftTabToastUntil) {
        _draftTabToastUntil = Date.now() + 6000;
        toast("This draft is also open in another tab — the last tab to type wins.", { ms: 6000 });
      }
    } else {
      const incoming = loadDraft();
      if (incoming) state.draft = incoming;
      // The other tab cleared its draft. If this tab is sitting on a blank
      // capture form (say, "Park a worry" picked but nothing typed), keep
      // that form: swapping in emptyEntry() would silently flip it to a
      // thought record under the user.
      else if (state.view !== "capture") state.draft = emptyEntry();
      else return;
      if (!typing) render();
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════

// Tracked between render() calls so the view-fade and capture-step fade
// only retrigger on actual transitions, not on every intra-view re-render
// (search input, slider drag, filter chip toggle).
let lastRenderedView = null;
let lastRenderedStep = null;
let _viewFreshTimer = 0;

// Re-applies an animation class so the same keyframe runs again on a
// node that's already in the DOM. Without the void-offsetWidth reflow,
// removing+re-adding the class in the same tick does nothing because the
// browser collapses the two style mutations.
function retriggerAnimation(node, cls, fallbackMs) {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  const cleanup = () => node.classList.remove(cls);
  let done = false;
  const once = (e) => {
    // animationend bubbles: a descendant's animation (e.g. a capture step
    // entering inside #view) must not end the node's own animation early.
    if (e.target !== node || done) return;
    done = true;
    node.removeEventListener("animationend", once);
    cleanup();
  };
  node.addEventListener("animationend", once);
  // Safety net — `animationend` is reliable but not infallible (e.g. the
  // node gets removed mid-animation, or prefers-reduced-motion suppresses
  // the animation entirely). Clean up — including the listener, so repeated
  // view changes don't accumulate inert handlers — after the duration.
  setTimeout(() => {
    if (!done) {
      done = true;
      node.removeEventListener("animationend", once);
      cleanup();
    }
  }, fallbackMs || 400);
}

// One-shot entrance for a node a render just created where there was nothing
// before: a restored card, a newly pinned coping card, a row the user added.
// The look lives in CSS (.is-arriving and per-component overrides); this
// only adds the class and cleans it up.
function markArrival(node) {
  if (node) retriggerAnimation(node, "is-arriving", motionMs("--dur-medium") + 80);
}

// Controls whose look follows a state class: the selected chip, the active
// Settings choice, the pinned star, the current step. render() rebuilds them
// from scratch, so a new state snapped in even though each one declares a
// transition: a freshly created element has no "before" to transition from.
// snapshotStateClasses() notes each control's classes before a rebuild;
// carryStateClasses() gives a changed control its old classes back for one
// style pass, then its new ones, so its own CSS transition plays.
const _CARRY_SEL = ".view-chip, .filter-chip, .settings-choice, .capture-mode-chip, " +
  ".activity-cat-chip, .accurate-tile, .entry-fav-btn, .progress-dot";
// One-shot animation classes aren't state; never replay them.
const _TRANSIENT_CLS = /\s*\bis-(arriving|moving|spotlit|swapping|leaving|shaking)\b/g;
function snapshotStateClasses(root) {
  const m = new Map();
  if (!root) return m;
  root.querySelectorAll(_CARRY_SEL).forEach(el => {
    const k = _openerSelector(el);
    if (k && !m.has(k)) m.set(k, el.className.replace(_TRANSIENT_CLS, ""));
  });
  return m;
}
function carryStateClasses(root, before) {
  // Nothing here may read a computed style before the old classes go back
  // on (motionMs() does): that styles the new elements in their new state
  // first, and the replay then runs new → old → new, which cancels itself.
  if (!root || !before || !before.size || _prefersReducedMotion()) return;
  const changed = [];
  root.querySelectorAll(_CARRY_SEL).forEach(el => {
    const k = _openerSelector(el);
    const was = k ? before.get(k) : undefined;
    if (was !== undefined && was !== el.className.replace(_TRANSIENT_CLS, "")) {
      changed.push([el, el.className]);
      el.className = was;
    }
  });
  if (!changed.length) return;
  void root.offsetWidth;
  changed.forEach(([el, cls]) => { el.className = cls; });
}

// The whole journal changed at once (samples loaded or removed, a backup
// imported): replay the view's entrance so the new list arrives instead of
// snapping in under the user.
function fadeViewIn() {
  retriggerAnimation(document.getElementById("view"), "view-entering", motionMs("--dur-medium") + 60);
}

// A brief copper ring on the card a link just took the user to (a coping
// card, a worry ↔ thought-record cross-link), so the eye finds where it
// landed after the scroll. Runs about as long as the smooth scroll plus a
// beat to be seen.
function spotlight(node) {
  if (node) retriggerAnimation(node, "is-spotlit", motionMs("--dur-long") * 3 + 80);
}

// Render while holding `el` still on screen. Views are rebuilt with
// innerHTML, which leaves the browser's own scroll anchoring nothing to hold
// on to: pinning the first coping card inserted a ~300px strip above the
// list and the card the user had just starred dropped out from under their
// finger (and jumped back up on unpin). Re-find the element after the render
// and scroll by however far it moved.
function renderAnchored(el) {
  const sel = el && el.isConnected ? _openerSelector(el) : null;
  const before = sel ? el.getBoundingClientRect().top : null;
  render();
  if (before === null) return;
  let now = null;
  try { now = document.querySelector(sel); } catch (_) {}
  if (!now) return;
  const delta = now.getBoundingClientRect().top - before;
  if (Math.abs(delta) >= 1) window.scrollBy(0, delta);
}

// Hold the space a removed element occupied, then close it, so whatever sat
// below glides up instead of jumping. Insert before `before` inside `parent`
// (null `before` = at the end). Purely visual: the data has already changed
// and nothing queries .gap-closer. `height` includes the margin the removed
// element carried; a flex `gap` it owned is absorbed as the slot closes.
function closeGap(parent, before, height, cls) {
  if (!parent || !(height >= 1) || !motionMs("--dur-medium")) return;
  const ghost = document.createElement("div");
  ghost.className = "gap-closer" + (cls ? " " + cls : "");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.height = height + "px";
  parent.insertBefore(ghost, before || null);
  animateSlot(ghost, "out", () => ghost.remove());
}

// A node a render just created, growing its slot open (the reverse of
// closeGap) and fading in, so neighbours make room instead of jumping.
function growIn(node) {
  if (node) animateSlot(node, "in");
}
// growIn for a journal card, or for its whole date group when the card is
// that day's only entry (the group's label is new too).
function growEntry(id) {
  const card = document.getElementById("entry-" + id);
  const group = card && card.closest(".date-group");
  growIn(group && group.querySelectorAll(".entry-card").length === 1 ? group : card);
}

// Measure a node that's about to be removed by a render, for closeGap():
// its height (plus the bottom margin that goes with it) and where its
// neighbours are, so the gap can be put back between them afterwards. A
// neighbour is found again by its own id or row id or, for a date group
// (which has neither), by the first entry card inside it.
function measureForGap(node) {
  if (!node || !node.isConnected) return null;
  const esc = v => (window.CSS && window.CSS.escape) ? window.CSS.escape(v) : String(v).replace(/["\\]/g, "\\$&");
  const locate = n => {
    if (!n) return null;
    if (n.id) return { sel: "#" + esc(n.id) };
    if (n.dataset && n.dataset.rowId) return { sel: '[data-row-id="' + esc(n.dataset.rowId) + '"]' };
    const card = n.querySelector && n.querySelector(".entry-card[id]");
    return card && n.classList[0] ? { sel: "#" + esc(card.id), up: "." + n.classList[0] } : null;
  };
  return {
    height: node.getBoundingClientRect().height + (parseFloat(getComputedStyle(node).marginBottom) || 0),
    next: locate(node.nextElementSibling),
    prev: locate(node.previousElementSibling),
  };
}
function closeGapAfterRender(m, cls) {
  if (!m) return;
  const find = loc => {
    if (!loc) return null;
    let n = null;
    try { n = document.querySelector(loc.sel); } catch (_) {}
    return n && loc.up ? n.closest(loc.up) : n;
  };
  const next = find(m.next);
  if (next) { closeGap(next.parentElement, next, m.height, cls); return; }
  const prev = find(m.prev);
  if (prev) closeGap(prev.parentElement, null, m.height, cls);
}

function render() {
  // Lock gate. When a PIN is set and this session hasn't unlocked yet, we
  // hide the entire app shell behind a lock screen — no journal entries,
  // no modals, not even the bottom-nav titles — so the threat model of
  // "someone glanced at the unlocked phone" is closed.
  if (state.locked) {
    document.body.classList.add("is-locked");
    // Release any modal focus-trap first. "Lock now" is reached from inside
    // the Settings modal, so its capture-phase keydown handler is installed;
    // this branch wipes #modal-root and returns before renderModal() (the
    // only other place the trap is released), so without this the trap would
    // stay bound and swallow every Tab on the lock screen for the whole
    // locked session.
    _releaseModalFocus();
    renderLockScreen();
    // Clear any in-flight modal/view content so nothing leaks behind the
    // lock screen via accidental z-index.
    const view = document.getElementById("view");
    if (view) view.innerHTML = "";
    const mr = document.getElementById("modal-root");
    if (mr) mr.innerHTML = "";
    _renderedModal = null;
    return;
  }
  document.body.classList.remove("is-locked");
  const existingLock = document.getElementById("lockScreen");
  if (existingLock) dismissLockScreen(existingLock);

  // Capture what opened the modal while it's still in the DOM — the view
  // rebuild below would otherwise destroy an in-view opener (an entry's
  // Delete button, "Log result", the empty-state Import button) before
  // renderModal() gets a chance to remember it, and closing the modal would
  // drop focus to <body>.
  if (state.modal) _rememberModalOpener();

  document.querySelectorAll(".nav-item").forEach(b => {
    const active = b.dataset.nav === state.view;
    b.classList.toggle("active", active);
    // aria-current orients screen-reader users to which view is showing;
    // the active class is purely visual.
    if (active) b.setAttribute("aria-current", "page");
    else        b.removeAttribute("aria-current");
  });

  const view = document.getElementById("view");
  const stateClasses = snapshotStateClasses(view);
  if (state.view === "journal")        view.innerHTML = renderJournal();
  else if (state.view === "capture")   view.innerHTML = renderCapture();
  else if (state.view === "patterns")  view.innerHTML = renderPatterns();
  else if (state.view === "reference") view.innerHTML = renderReference();
  else if (state.view === "outcome")   view.innerHTML = renderOutcomeView();
  carryStateClasses(view, stateClasses);

  if (state.view === "journal")      bindJournal();
  else if (state.view === "capture") bindCapture();
  else if (state.view === "outcome") bindOutcome();

  // New content starts at the top of the page. Jump there in the same frame
  // the content swaps, under the cross-fade (or fade-in), rather than
  // smooth-scrolling afterwards: that scrolled the freshly rendered view
  // past the reader while it was still fading in (two motions fighting), and
  // saving an entry from the bottom of Step 7 used to land mid-journal,
  // nowhere near it. The first render is left alone so the browser's own
  // scroll restoration on reload still applies.
  const viewChanged = state.view !== lastRenderedView;
  const stepChanged = state.view === "capture" && state.captureStep !== lastRenderedStep;
  if ((viewChanged || stepChanged) && lastRenderedView !== null && window.scrollY > 0) {
    window.scrollTo(0, 0);
  }

  // View transition: fire only when state.view actually changed.
  if (viewChanged) {
    // The cross-fade already covers the change where it runs.
    if (!_crossFading) retriggerAnimation(view, "view-entering", motionMs("--dur-medium") + 60);
    // "Just opened" window for things that draw themselves in on arrival
    // (the Patterns charts). Scoped to the view change so a background
    // re-render — a sync merge, another tab's write — doesn't replay them.
    view.classList.add("is-fresh");
    clearTimeout(_viewFreshTimer);
    // Long enough for the slowest chart draw (the sparkline, 1.5× --dur-long).
    _viewFreshTimer = setTimeout(() => view.classList.remove("is-fresh"), motionMs("--dur-long") * 1.5 + 200);
    lastRenderedView = state.view;
    // Reset step tracking so re-entering the capture view animates step 1.
    lastRenderedStep = null;
  }
  // Capture step transition: fire only when the step number changed.
  if (state.view === "capture" && state.captureStep !== lastRenderedStep) {
    if (!_crossFading) retriggerAnimation(view.querySelector(".capture-screen"), "step-entering", motionMs("--dur-medium") + 60);
    // Stepping forward fills the step's bar in the progress track rather
    // than snapping it copper.
    if (lastRenderedStep !== null && state.captureStep > lastRenderedStep) {
      markArrival(view.querySelector(".progress-dot.active"));
    }
    lastRenderedStep = state.captureStep;
    // Focus the step's primary field ONCE on step entry. The fields used to
    // carry the `autofocus` attribute, but Chromium re-focuses a dynamically
    // inserted autofocus element on every intra-step re-render (e.g. tapping
    // an activity category chip), yanking focus back and popping the mobile
    // keyboard on each tap. Focusing only on the step transition avoids that.
    const af = view.querySelector(".capture-screen [data-autofocus]");
    if (af) setTimeout(() => { try { af.focus({ preventScroll: true }); } catch (_) { af.focus(); } }, 40);
  }

  renderModal();
}

// Fade the lock screen off the unlocked app instead of cutting to it. The
// leaving copy sheds its ids (a fresh lock builds its own, and nothing may
// find the old PIN field), goes inert and lets taps through while it fades.
function dismissLockScreen(el) {
  const dur = motionMs("--dur-medium");
  if (!dur) { el.remove(); return; }
  el.removeAttribute("id");
  el.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
  el.setAttribute("inert", "");
  el.classList.add("is-leaving");
  let gone = false;
  const done = () => { if (!gone) { gone = true; el.remove(); } };
  el.addEventListener("animationend", e => { if (e.target === el) done(); });
  setTimeout(done, dur + 100);
}

function renderLockScreen() {
  let el = document.getElementById("lockScreen");
  if (!el) {
    el = document.createElement("div");
    el.id = "lockScreen";
    document.body.appendChild(el);
  }
  // Preserve what the user typed across a failed-attempt re-render so they can
  // see and correct a one-character typo instead of retyping the whole PIN
  // (each retype otherwise burns another attempt toward the lockout). Only
  // when an error is showing — a fresh lock starts with an empty field.
  const _prevPinEl = document.getElementById("lockPinInput");
  const _prevPin = (_prevPinEl && state.lockError) ? _prevPinEl.value : "";
  el.className = "lock-screen" + (state.lockError ? " has-error" : "");
  // Shake once per failed submit. Keyed to the error class it replayed on
  // every re-render while an error showed — tapping "Forgot PIN?" after a
  // wrong PIN shook the field again.
  const shake = !!state.lockShake;
  state.lockShake = false;
  // Lock card is functionally a modal — block everything else on the
  // page until the PIN is correct — so expose it as a dialog with an
  // accessible name. The first focused control (the PIN input) carries
  // its own aria-label, but the dialog itself needs a labelledby so
  // screen readers announce "Rephrame Locked, dialog" on entry.
  el.innerHTML = `
    <div class="lock-card" role="dialog" aria-modal="true" aria-labelledby="lockTitle">
      <div class="lock-brand" id="lockTitle">
        <span class="brand-mark" aria-hidden="true">r</span>
        <div>
          <div class="brand-name">Rephrame</div>
          <div class="brand-sub">Locked</div>
        </div>
      </div>
      <p class="lock-help">Enter your PIN to unlock the journal.</p>
      <form class="lock-form" id="lockForm" autocomplete="off">
        <input
          id="lockPinInput"
          class="lock-pin-input${shake ? " is-shaking" : ""}"
          type="password"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="8"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          aria-label="PIN"
          aria-invalid="${state.lockError ? "true" : "false"}"
        >
        ${state.lockError ? `<p class="lock-error" role="alert">${esc(state.lockError)}</p>` : ""}
        <button type="submit" class="btn btn-primary lock-submit">Unlock</button>
      </form>
      <button type="button" class="link-button lock-forgot" data-action="lock-forgot">${state.lockHelpOpen ? "Hide" : "Forgot PIN?"}</button>
      ${state.lockHelpOpen ? `
        <div class="lock-help-panel" role="region" aria-label="PIN recovery info">
          <p><strong>No PIN recovery.</strong> Rephrame is offline and stores everything locally — there's no server-side reset. If you've forgotten the PIN, the only way back in is to clear this site's data in your browser, which also deletes every entry.</p>
          <p><strong>Tip:</strong> export to JSON or Markdown regularly from Settings while the app is unlocked. That export is your recovery copy — you can re-import it on a fresh install.</p>
        </div>
      ` : ""}
    </div>
  `;
  // Wire form submission. Doing this here (rather than in a bind* function)
  // because the lock screen lives outside the normal render tree.
  const form = document.getElementById("lockForm");
  const input = document.getElementById("lockPinInput");
  if (input && _prevPin) input.value = _prevPin;
  if (input) setTimeout(() => {
    input.focus();
    // Put the caret at the end of the restored text so correcting a typo
    // doesn't require re-selecting first.
    try { const n = input.value.length; input.setSelectionRange(n, n); } catch (_) {}
  }, 30);
  let _verifying = false;
  if (form) form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // PBKDF2 at 100k iterations takes a noticeable beat on a phone; a second
    // Enter/tap before it resolves would run verifyPin() again and count two
    // failures for one wrong PIN, reaching the lockout early.
    if (_verifying) return;
    const pin = (input.value || "").trim();
    if (!pin) { state.lockError = "Enter your PIN to continue."; state.lockShake = true; render(); return; }
    // Brute-force throttle. After 5 wrong tries the form refuses to
    // submit until the cool-down expires — defends a stolen device from
    // a script that fires 10,000 PINs in a loop.
    const waitMs = pinLockoutMsLeft();
    if (waitMs > 0) {
      const sec = Math.ceil(waitMs / 1000);
      state.lockError = "Too many tries. Wait " + sec + "s before another attempt.";
      state.lockShake = true;
      render();
      return;
    }
    _verifying = true;
    let ok;
    try { ok = await verifyPin(pin); } finally { _verifying = false; }
    if (ok) {
      markUnlocked();
      state.locked = false;
      state.lockError = "";
      render();
      _openPendingImport();
      // Sync (js/sync.js) stays completely down while the journal is locked —
      // no peer registration, no auto-dial — and starts on this signal.
      try { window.dispatchEvent(new CustomEvent("rephrame:unlocked")); } catch (_) {}
    } else {
      // verifyPin() already recorded the failure + advanced the lockout.
      const wait = pinLockoutMsLeft();
      state.lockError = wait > 0
        ? "Too many tries. Wait " + Math.ceil(wait / 1000) + "s before another attempt."
        : "That PIN doesn't match. Try again.";
      // Brief shake-feedback via a class the CSS animates, then re-render
      // so the error message lands. Keep the input value so the user can
      // see what they typed and correct it.
      state.lockShake = true;
      render();
    }
  });
  el.querySelectorAll('[data-action="lock-forgot"]').forEach(b =>
    b.addEventListener("click", () => {
      state.lockHelpOpen = !state.lockHelpOpen;
      render();
    })
  );
}

// Scope filter applied to the journal list. Each branch is a separate
// concept so adding "this month" or "high intensity" later is a one-line
// edit instead of a state-shape change.
function applyViewFilter(entries, key) {
  if (key === "favorites")  return entries.filter(e => e.isFavorite);
  if (key === "unfinished") return entries.filter(e => e.isQuick);
  if (key === "week")       return entries.filter(e =>
    excludeQuickThoughtRecord(e) && daysBetween(new Date(), new Date(e.createdAt)) < 7
  );
  if (key === "pivoted")    return entries.filter(e =>
    excludeQuickThoughtRecord(e) && e.pivotDone
  );
  if (key === "pending")    return entries.filter(e =>
    excludeQuickThoughtRecord(e) && e.pivot && !e.pivotDone
  );
  if (key === "freeform")   return entries.filter(e => e.kind === "freeform");
  if (key === "activities") return entries.filter(e => e.kind === "activity");
  if (key === "worries")    return entries.filter(e => e.kind === "worry");
  return entries;
}

// Free-text search predicate shared by the journal list and the "reveal this
// entry" cross-links, so both agree on what a query matches. `q` is already
// lower-cased and trimmed.
function entryMatchesSearch(e, q) {
  const thoughtText = (e.thoughts || []).map(t => t.text).join(" ");
  const moodText    = (e.moods    || []).map(m => `${m.family || ""} ${m.variant || ""}`).join(" ");
  const blob = [
    e.trigger, thoughtText, moodText, e.newThought, e.pivot,
    e.pivotReflection, e.distortionNote, e.evidenceFor, e.evidenceAgainst,
    e.socraticQuestion, e.socraticAnswer, e.bodyCheck, e.newFeelings, e.pivotPrediction,
    e.body, e.worryText, e.activityNotes,
    (e.distortions || []).join(" ")
  ].join(" ").toLowerCase();
  return blob.includes(q);
}

// Make sure a specific entry will actually be in the rendered journal list:
// clear whichever of the scope chip, distortion chip, or search box would
// hide it. Used by the coping-card and worry↔record cross-links, which
// scroll to the entry — scrolling to a card that isn't rendered lands the
// user on an empty state with no idea what happened.
function ensureEntryVisible(entry) {
  if (!entry) return;
  if (state.viewFilter !== "all" && !applyViewFilter([entry], state.viewFilter).length) {
    state.viewFilter = "all";
  }
  if (state.filter && !(entry.distortions || []).includes(state.filter)) {
    state.filter = "";
  }
  const q = (state.search || "").toLowerCase().trim();
  if (q && !entryMatchesSearch(entry, q)) state.search = "";
}

// Coping cards: horizontal carousel of favorited entries surfaced at the
// top of the Journal so the user can re-read the reframes that have landed
// for them. Tapping a card jumps to and expands the underlying entry.
function renderCopingCards(favorites) {
  return `
    <section class="coping-strip" aria-label="Coping cards">
      <div class="coping-strip-head">
        <span class="coping-strip-eyebrow">Coping cards</span>
        <span class="coping-strip-meta">${favorites.length} ${favorites.length === 1 ? "pinned reframe" : "pinned reframes"}</span>
      </div>
      <div class="coping-scroller">
        ${favorites.map(e => {
          const h = hotThought(e);
          const hasDelta = h && typeof h.beliefBefore === "number" && typeof h.beliefAfter === "number";
          const bDelta = hasDelta ? (h.beliefAfter - h.beliefBefore) : null;
          return `
            <article class="coping-card" data-action="jump-to-entry" data-id="${e.id}" tabindex="0" role="button" aria-label="Open coping card">
              <div class="coping-card-head">
                <span class="coping-card-star" aria-hidden="true">${svgIcon("star")}</span>
                <span class="coping-card-date">${esc(fmtDate(e.createdAt))}</span>
              </div>
              <p class="coping-card-quote display">${esc(e.newThought) || '<span class="muted">(no reframe yet)</span>'}</p>
              ${e.trigger ? `<p class="coping-card-trigger"><span class="muted">For when:</span> ${esc(e.trigger.slice(0, 120))}${e.trigger.length > 120 ? "…" : ""}</p>` : ""}
              <div class="coping-card-foot">
                ${hasDelta ? `<span class="delta-tag ${bDelta < 0 ? "good" : "flat"}">belief ${bDelta > 0 ? "+" : ""}${bDelta}</span>` : ""}
                ${(e.distortions || []).slice(0, 2).map(d => `<span class="coping-card-dist">${esc(d)}</span>`).join("")}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

// Filtered-Journal empty state. Picks copy + a CTA appropriate to the
// active view-filter — when the user has just selected "Worries" and
// has none parked, point them at the park-a-worry capture instead of
// the generic "reset filters" advice.
function renderJournalFilteredEmpty() {
  const filter = state.viewFilter;
  const copy = {
    freeform:   { title: "No free writes yet.",        body: "An open page for moments that don't have a clear thought to challenge.", ctaLabel: "Start a free write",     ctaKind: "freeform" },
    activities: { title: "No activities planned yet.", body: "Pick something concrete, predict how it'll feel, then compare after.",   ctaLabel: "Plan an activity",      ctaKind: "activity" },
    worries:    { title: "No worries parked yet.",     body: "Park a worry, set it aside, come back at your worry-window time.",       ctaLabel: "Park a worry",          ctaKind: "worry"    },
  }[filter];
  if (!copy) {
    return `
      <div class="empty-state" style="margin-top: 20px;">
        <h2 class="empty-state-title display" style="font-size: 20px;">Nothing matches that.</h2>
        <p class="empty-state-body">Try clearing the search, the scope, or the distortion filter.</p>
        <div class="empty-state-actions">
          <button class="btn btn-ghost" data-action="reset-filters">Reset filters</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="empty-state" style="margin-top: 20px;">
      <h2 class="empty-state-title display" style="font-size: 20px;">${esc(copy.title)}</h2>
      <p class="empty-state-body">${esc(copy.body)}</p>
      <div class="empty-state-actions">
        <button class="btn btn-primary" data-action="start-kind" data-kind="${esc(copy.ctaKind)}">${esc(copy.ctaLabel)}</button>
        <button class="btn btn-ghost" data-action="reset-filters">Show all entries</button>
      </div>
    </div>
  `;
}

function renderJournal() {
  const entries = state.entries;
  const hasDraft = hasDraftContent(state.draft) && !state.editingId;

  if (entries.length === 0) {
    return `
      <div class="page-header">
        <div class="page-eyebrow">Personal</div>
        <h1 class="page-title display">Journal</h1>
      </div>
      ${hasDraft ? renderResumeBanner() : ""}
      <div class="empty-state">
        <div class="empty-state-mark" aria-hidden="true"></div>
        <h2 class="empty-state-title display">A quiet start.</h2>
        <p class="empty-state-body">Four ways to capture: a structured thought record, a free-form journal entry, a planned activity, or a parked worry. Pick whatever fits the moment. Everything lives in this browser only.</p>
        <div class="empty-state-actions">
          <button class="btn btn-primary" data-action="goto-capture">Begin first entry</button>
          <button class="btn btn-ghost" data-action="load-sample">Load an example</button>
          <button class="btn btn-ghost" data-action="open-import">Import backup</button>
        </div>
        <p class="empty-safety">
          Overwhelmed right now? Tap the ${svgIcon("bolt", "ico--inline")} icon in the top-right for a 30-second quick capture, or
          <button class="link-button" data-action="open-safety">see crisis resources</button>.
        </p>
      </div>
    `;
  }

  const q = state.search.toLowerCase().trim();

  // Counts driving the view-filter chips. We hide chips that would resolve to
  // zero entries — a dead chip is a confusing chip.
  const counts = {
    all: entries.length,
    favorites: entries.filter(e => e.isFavorite).length,
    unfinished: entries.filter(e => e.isQuick).length,
    week: entries.filter(e =>
      excludeQuickThoughtRecord(e) && daysBetween(new Date(), new Date(e.createdAt)) < 7
    ).length,
    pivoted: entries.filter(e =>
      excludeQuickThoughtRecord(e) && e.pivotDone
    ).length,
    pending: entries.filter(e =>
      excludeQuickThoughtRecord(e) && e.pivot && !e.pivotDone
    ).length,
    freeform: entries.filter(e => e.kind === "freeform").length,
    activities: entries.filter(e => e.kind === "activity").length,
    worries: entries.filter(e => e.kind === "worry").length,
  };

  // Apply the scope filter first; the result feeds both the distortion
  // chips (so chips for distortions absent from the current scope don't
  // render) and the list (after search + distortion narrow it further).
  const scoped = applyViewFilter(entries, state.viewFilter);
  let filtered = scoped;
  if (state.filter) filtered = filtered.filter(e => (e.distortions || []).includes(state.filter));
  if (q) filtered = filtered.filter(e => entryMatchesSearch(e, q));

  const usedDistortions = Array.from(new Set(scoped.flatMap(e => e.distortions || []))).sort();
  const favorites = entries.filter(e => e.isFavorite);

  const groups = [];
  const seen = new Map();
  filtered.forEach(e => {
    const label = dateGroupLabel(e.createdAt);
    if (!seen.has(label)) {
      seen.set(label, { label, entries: [] });
      groups.push(seen.get(label));
    }
    seen.get(label).entries.push(e);
  });

  const viewChips = [
    { key: "all",        label: "All",          count: counts.all,        hint: "Every entry" },
    { key: "favorites",  label: "Coping",       ico: "star",  count: counts.favorites,  hint: "Pinned reframes" },
    { key: "unfinished", label: "Unfinished",   ico: "bolt",  count: counts.unfinished, hint: "Quick captures waiting" },
    { key: "freeform",   label: "Free writes",  count: counts.freeform,   hint: "Open-form journal entries" },
    { key: "activities", label: "Activities",   count: counts.activities, hint: "Planned and logged activities" },
    { key: "worries",    label: "Worries",      count: counts.worries,    hint: "Parked worries and resolutions" },
    { key: "week",       label: "This week",    count: counts.week,       hint: "Last 7 days — omits quick thought records" },
    { key: "pivoted",    label: "Pivoted",      count: counts.pivoted,    hint: "Pivot marked done — omits quick thought records" },
    { key: "pending",    label: "Pivot due",    count: counts.pending,    hint: "Pivot not done yet — omits quick thought records" },
  ].filter(c => c.key === "all" || c.count > 0);

  return `
    <div class="page-header">
      <div class="page-eyebrow">${entries.length} ${entries.length === 1 ? "entry" : "entries"}</div>
      <h1 class="page-title display">Journal</h1>
    </div>

    ${hasDraft ? renderResumeBanner() : ""}
    ${shouldShowNudge() ? renderNudgeBanner() : ""}
    ${shouldShowWorryWindow() ? renderWorryWindowBanner() : ""}

    ${favorites.length > 0 && state.viewFilter !== "favorites" ? renderCopingCards(favorites) : ""}

    <div class="journal-toolbar">
      <div class="search-box">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5"/>
          <path d="M10.5 10.5l3 3"/>
        </svg>
        <input type="search" class="search-input" placeholder="Search thoughts, reframes, evidence…" value="${esc(state.search)}" data-action="search" aria-label="Search entries">
      </div>
    </div>

    <div class="view-chips" role="tablist" aria-label="Scope">
      ${viewChips.map(c => `
        <button class="view-chip ${c.ico ? "view-chip--ico" : ""} ${state.viewFilter === c.key ? "active" : ""}" data-action="set-view-filter" data-value="${c.key}" title="${esc(c.hint)}" role="tab" aria-selected="${state.viewFilter === c.key}">
          ${c.ico ? svgIcon(c.ico, "ico--chip") : ""}${esc(c.label)}<span class="view-chip-count">${c.count}</span>
        </button>
      `).join("")}
    </div>

    ${usedDistortions.length > 0 ? `
      <div class="filter-chips">
        <button class="filter-chip ${state.filter === "" ? "active" : ""}" data-action="filter" data-value="">All distortions</button>
        ${usedDistortions.map(d => `
          <button class="filter-chip ${state.filter === d ? "active" : ""}" data-action="filter" data-value="${esc(d)}">${esc(d)}</button>
        `).join("")}
      </div>
    ` : ""}

    <div class="journal-list">
    ${filtered.length === 0 ? renderJournalFilteredEmpty() : (() => {
      // Precompute id → index lookup once. The previous form did
      // entries.indexOf(e) inside the inner map, which made render() O(n²)
      // in the number of entries — visibly stuttery past ~500.
      const indexById = new Map(entries.map((e, i) => [e.id, i]));
      return groups.map(g => `
        <div class="date-group">
          <div class="date-group-label">
            <span class="kicker">${esc(g.label)}</span>
            <span class="date-group-rule"></span>
          </div>
          <div class="entry-stack">
            ${g.entries.map(e => renderEntryCard(e, indexById.get(e.id))).join("")}
          </div>
        </div>
      `).join("");
    })()}
    </div>
  `;
}

function renderNudgeBanner() {
  const ago = humanDuration(msSinceLastEntry());
  return `
    <div class="nudge-banner" role="status">
      <div class="nudge-banner-info">
        <svg class="nudge-banner-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 2v3M10 15v3M2 10h3M15 10h3M4.6 4.6l2 2M13.4 13.4l2 2M4.6 15.4l2-2M13.4 6.6l2-2"/>
        </svg>
        <div class="nudge-banner-text">
          <strong>The door's open if today's a writing day.</strong>
          <span class="preview">Quiet for ${esc(ago)}. No obligation either way.</span>
        </div>
      </div>
      <div class="nudge-banner-actions">
        <button class="action-btn" data-action="goto-capture">Capture</button>
        <button class="action-btn ghost" data-action="snooze-nudge">Not today</button>
      </div>
    </div>
  `;
}

// True when there are unresolved parked worries the user should see now.
// Two cases:
//   1. We're inside the configured 20-minute worry window today.
//   2. The window has already passed (today or earlier) and at least one
//      worry's scheduledFor is in the past — i.e. the app was closed
//      during the window and the worry would otherwise go unsurfaced
//      until the next window. Don't let parked worries sit silently.
function shouldShowWorryWindow() {
  const parked = (state.entries || []).filter(e => e.kind === "worry" && !e.resolution);
  if (parked.length === 0) return false;
  const s = state.settings || {};
  const [h, m] = _parseHHMM(s.worryWindowTime);
  const now = new Date();
  const winStart = new Date(); winStart.setHours(h, m, 0, 0);
  const winEnd = new Date(winStart.getTime() + 20 * 60 * 1000);
  const inWindow = now >= winStart && now <= winEnd;
  const nowMs = now.getTime();
  // A worry only counts as due once its scheduledFor has arrived — a worry
  // parked moments ago (scheduled for tomorrow's window) must not trigger
  // "It's worry time" seconds after the user was told it's parked until
  // tomorrow. Worries without a valid schedule surface during the window.
  return parked.some(w => {
    const t = Date.parse(w.scheduledFor);
    if (isNaN(t)) return inWindow;
    return t <= nowMs;
  });
}

function renderWorryWindowBanner() {
  const parked = (state.entries || []).filter(e => e.kind === "worry" && !e.resolution);
  // Postponement works by tying worry to one time of day (Borkovec et al.,
  // 1983). A worry that fell due while the app was closed still surfaces,
  // but outside the window the banner points at worry time instead of
  // announcing it, so a 2am visit isn't an invitation to start.
  const [wh, wm] = _parseHHMM((state.settings || {}).worryWindowTime);
  const winStart = new Date(); winStart.setHours(wh, wm, 0, 0);
  const inWindow = Date.now() >= winStart.getTime() && Date.now() <= winStart.getTime() + 20 * 60 * 1000;
  const when = String(wh).padStart(2, "0") + ":" + String(wm).padStart(2, "0");
  const count = parked.length + " parked worr" + (parked.length === 1 ? "y" : "ies");
  return `
    <div class="nudge-banner worry-banner" role="status">
      <div class="nudge-banner-info">
        <svg class="nudge-banner-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>
        </svg>
        <div class="nudge-banner-text">
          <strong>${inWindow ? "It's worry time." : "Worry time is at " + when + "."}</strong>
          <span class="preview">${inWindow ? count + ". Ready to look?" : count + " waiting for it. You can leave them until then."}</span>
        </div>
      </div>
      <div class="nudge-banner-actions">
        <button class="action-btn" data-action="set-view-filter" data-value="worries">Open the list</button>
      </div>
    </div>
  `;
}

function renderResumeBanner() {
  const firstThought = (state.draft.thoughts || []).find(t => (t.text || "").trim());
  const preview = state.draft.trigger || (firstThought && firstThought.text) || "(unfinished entry)";
  return `
    <div class="resume-banner">
      <div class="resume-banner-info">
        <svg class="resume-banner-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 10a7 7 0 1 0 14 0 7 7 0 0 0-14 0z"/>
          <path d="M10 6v4l3 2"/>
        </svg>
        <div class="resume-banner-text">
          <strong>Draft in progress</strong>
          <span class="preview">${esc(preview.slice(0, 60))}${preview.length > 60 ? "…" : ""}</span>
        </div>
      </div>
      <div class="resume-banner-actions">
        <button class="action-btn" data-action="resume-draft">Resume</button>
        <button class="action-btn" data-action="discard-draft">Discard</button>
      </div>
    </div>
  `;
}

function renderEntryCard(entry, index) {
  // Dispatch by kind. Existing thought-record card lives in
  // renderThoughtRecordCard; the new kinds get their own card variants
  // tuned to the data they actually carry.
  if (entry.kind === "freeform") return renderFreeformCard(entry, index);
  if (entry.kind === "activity") return renderActivityCard(entry, index);
  if (entry.kind === "worry")    return renderWorryCard(entry, index);
  return renderThoughtRecordCard(entry, index);
}

function renderThoughtRecordCard(entry, index) {
  const expanded = state.printMode || state.expandedIds.has(entry.id);
  const moods = entry.moods || [];
  const hot = hotThought(entry);
  const namedMoods = moods.filter(m => m.family);

  // Hot-thought belief delta — the single number users glance at to see
  // whether the reframe moved anything.
  const hasBeliefDelta = hot && typeof hot.beliefBefore === "number" && typeof hot.beliefAfter === "number";
  const beliefDelta = hasBeliefDelta ? (hot.beliefAfter - hot.beliefBefore) : null;

  // Compact mood pills — show the first mood inline with its three-stage
  // arc; any additional moods collapse to a "+N more" badge that opens with
  // the card expansion. Stays one row on mobile.
  const primaryMood = namedMoods[0];
  const moodLabel = primaryMood ? (primaryMood.variant ? cap(primaryMood.variant) : primaryMood.family) : null;
  const after = primaryMood && typeof primaryMood.intensityAfterPivot === "number"
                  ? primaryMood.intensityAfterPivot
              : primaryMood && typeof primaryMood.intensityAfterReframe === "number"
                  ? primaryMood.intensityAfterReframe
              : null;
  const hasMoodDelta = primaryMood && after !== null;
  const moodDelta = hasMoodDelta ? (after - primaryMood.intensity) : null;

  const flagPills = [];
  // Click the ⚡ flag directly to resume the entry — saves the user the
  // expand-then-find-button dance that was the only previous path.
  if (entry.isQuick) flagPills.push(`<button type="button" class="entry-flag flag-quick" data-action="finish-quick" data-id="${entry.id}" title="Pick up where you left off">${svgIcon("bolt", "ico--inline")} Finish this</button>`);
  if (entry.isSample) flagPills.push(`<button type="button" class="entry-flag flag-sample" data-action="remove-samples" title="Remove all sample entries">Sample</button>`);
  if (entry.pivotDone && !entry.outcomeRecorded) flagPills.push(`<button type="button" class="entry-flag flag-outcome" data-action="open-outcome" data-id="${entry.id}" title="Record what happened">Step 8 open</button>`);

  return `
    <article class="entry-card ${expanded ? "expanded" : ""} ${entry.isQuick ? "is-quick" : ""} ${entry.isFavorite ? "is-favorite" : ""}" id="entry-${entry.id}">
      <div class="entry-card-head" data-action="toggle-expand" data-id="${entry.id}" role="button" tabindex="0" aria-expanded="${expanded ? "true" : "false"}">
        <div class="entry-meta-row">
          <span class="entry-meta-num">No. ${String(index + 1).padStart(2, "0")}</span>
          <span class="entry-meta-dot">·</span>
          <span class="entry-meta-time">${esc(fmtTime(entry.createdAt))}</span>
          <span class="entry-meta-flags">
            ${flagPills.join("")}
            ${entry.pivotDone ? `<span class="pivot-indicator done"><span class="pivot-dot"></span> Pivoted</span>` : ""}
          </span>
          <button class="entry-fav-btn ${entry.isFavorite ? "active" : ""}" data-action="toggle-favorite" data-id="${entry.id}" aria-label="${entry.isFavorite ? "Unpin from coping cards" : "Pin as a coping card"}" title="${entry.isFavorite ? "Unpin from coping cards" : "Pin as a coping card"}">
            <svg viewBox="0 0 16 16" fill="${entry.isFavorite ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">
              <path d="M8 1.8l1.8 4 4.4.5-3.3 3 1 4.3L8 11.5l-3.9 2.1 1-4.3-3.3-3 4.4-.5z"/>
            </svg>
          </button>
        </div>
        <h3 class="entry-card-trigger display ${entry.trigger || (hot && hot.text) ? "" : "empty"}">
          ${entry.trigger ? esc(entry.trigger) : (hot && hot.text ? esc(hot.text) : "(no trigger)")}
        </h3>
        <div class="entry-tags-row">
          ${moodLabel ? `
            <span class="felt-pill">
              Felt <span class="felt-emo">${esc(moodLabel)}</span>
              ${hasMoodDelta
                ? `<span class="intensity-delta"><span class="intensity-mini">${primaryMood.intensity}</span> ${svgIcon("arrowRight", "ico--xs")} <span class="intensity-mini">${after}</span> <span class="delta-tag ${moodDelta < 0 ? "good" : "flat"}">${moodDelta > 0 ? "+" : ""}${moodDelta}</span></span>`
                : `<span class="intensity-mini">${primaryMood.intensity}</span>`}
            </span>
          ` : ""}
          ${namedMoods.length > 1 ? `<span class="dist-more" title="${esc(namedMoods.slice(1).map(m => m.variant ? cap(m.variant) : m.family).join(", "))}">+${namedMoods.length - 1} more</span>` : ""}
          ${hasBeliefDelta ? `
            <span class="belief-pill">
              Belief <span class="belief-mini">${hot.beliefBefore}%</span> ${svgIcon("arrowRight", "ico--xs")} <span class="belief-mini">${hot.beliefAfter}%</span>
              <span class="delta-tag ${beliefDelta < 0 ? "good" : "flat"}">${beliefDelta > 0 ? "+" : ""}${beliefDelta}</span>
            </span>
          ` : ""}
          ${(entry.distortions || []).slice(0, 2).map(d => `<span class="dist-chip">${esc(d)}</span>`).join("")}
          ${(entry.distortions || []).length > 2 ? `<span class="dist-more">+${(entry.distortions || []).length - 2}</span>` : ""}
        </div>
      </div>
      <div class="entry-body-wrap" aria-hidden="${expanded ? "false" : "true"}"${expanded ? "" : " inert"}>
        <div class="entry-body-clip">${renderEntryDetails(entry)}</div>
      </div>
    </article>
  `;
}

// Free-form card: quiet eyebrow tag instead of "No. NN", title + 3-line
// body preview. Tapping expands to the full body. Mood pill if any.
function renderFreeformCard(entry, index) {
  const expanded = state.printMode || state.expandedIds.has(entry.id);
  const moods = entry.moods || [];
  const namedMoods = moods.filter(m => m.family);
  const primaryMood = namedMoods[0];
  const moodLabel = primaryMood ? (primaryMood.variant ? cap(primaryMood.variant) : primaryMood.family) : null;
  const title = entry.trigger || "Free write";
  const preview = (entry.body || "").replace(/\s+/g, " ").trim().slice(0, 160);
  return `
    <article class="entry-card entry-card--freeform ${expanded ? "expanded" : ""} ${entry.isFavorite ? "is-favorite" : ""}" id="entry-${entry.id}">
      <div class="entry-card-head" data-action="toggle-expand" data-id="${entry.id}" role="button" tabindex="0" aria-expanded="${expanded ? "true" : "false"}">
        <div class="entry-meta-row">
          <span class="entry-kind-tag">Free write</span>
          <span class="entry-meta-dot">·</span>
          <span class="entry-meta-time">${esc(fmtTime(entry.createdAt))}</span>
          <span class="entry-meta-flags"></span>
          <button class="entry-fav-btn ${entry.isFavorite ? "active" : ""}" data-action="toggle-favorite" data-id="${entry.id}" aria-label="${entry.isFavorite ? "Unpin" : "Pin"}">
            <svg viewBox="0 0 16 16" fill="${entry.isFavorite ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">
              <path d="M8 1.8l1.8 4 4.4.5-3.3 3 1 4.3L8 11.5l-3.9 2.1 1-4.3-3.3-3 4.4-.5z"/>
            </svg>
          </button>
        </div>
        <h3 class="entry-card-trigger display">${esc(title)}</h3>
        ${preview ? `<p class="entry-card-preview">${esc(preview)}${entry.body.length > 160 ? "…" : ""}</p>` : ""}
        ${moodLabel ? `
          <div class="entry-tags-row">
            <span class="felt-pill">
              Felt <span class="felt-emo">${esc(moodLabel)}</span>
              <span class="intensity-mini">${primaryMood.intensity}</span>
            </span>
          </div>
        ` : ""}
      </div>
      <div class="entry-body-wrap" aria-hidden="${expanded ? "false" : "true"}"${expanded ? "" : " inert"}>
        <div class="entry-body-clip">${renderFreeformDetails(entry)}</div>
      </div>
    </article>
  `;
}

// Activity card: category emoji + description + Planned/Completed pill
// + predicted/actual P/M arc if completed.
function renderActivityCard(entry, index) {
  const expanded = state.printMode || state.expandedIds.has(entry.id);
  const cat = ACTIVITY_CATEGORIES.find(c => c.value === entry.category) || ACTIVITY_CATEGORIES[ACTIVITY_CATEGORIES.length - 1];
  const isCompleted = !!entry.completedAt;
  const isPast = entry.plannedFor && new Date(entry.plannedFor).getTime() < Date.now();
  const statusLabel = isCompleted ? "Completed" : (isPast ? "Awaiting log" : "Planned");
  const statusClass = isCompleted ? "completed" : (isPast ? "due" : "planned");
  const pDelta = (isCompleted && typeof entry.predictedP === "number" && typeof entry.actualP === "number") ? entry.actualP - entry.predictedP : null;
  const mDelta = (isCompleted && typeof entry.predictedM === "number" && typeof entry.actualM === "number") ? entry.actualM - entry.predictedM : null;
  return `
    <article class="entry-card entry-card--activity ${expanded ? "expanded" : ""}" id="entry-${entry.id}">
      <div class="entry-card-head" data-action="toggle-expand" data-id="${entry.id}" role="button" tabindex="0" aria-expanded="${expanded ? "true" : "false"}">
        <div class="entry-meta-row">
          <span class="entry-kind-tag">${catIcon(entry.category, "ico--kind")} ${esc(cat.label)}</span>
          <span class="entry-meta-dot">·</span>
          <span class="entry-meta-time">${esc(fmtDateTime(entry.plannedFor || entry.createdAt))}</span>
          <span class="entry-meta-flags">
            <span class="entry-flag flag-activity flag-activity--${statusClass}">${esc(statusLabel)}</span>
          </span>
        </div>
        <h3 class="entry-card-trigger display">${esc(entry.body) || "(activity)"}</h3>
        <div class="entry-tags-row">
          ${typeof entry.predictedP === "number" ? `
            <span class="felt-pill">Pleasure <span class="intensity-mini">${entry.predictedP}</span>${isCompleted && entry.actualP !== null ? ` ${svgIcon("arrowRight", "ico--xs")} <span class="intensity-mini">${entry.actualP}</span> <span class="delta-tag ${pDelta > 0 ? "good" : pDelta < 0 ? "flat" : "flat"}">${pDelta > 0 ? "+" : ""}${pDelta}</span>` : " predicted"}</span>
          ` : ""}
          ${typeof entry.predictedM === "number" ? `
            <span class="felt-pill">Mastery <span class="intensity-mini">${entry.predictedM}</span>${isCompleted && entry.actualM !== null ? ` ${svgIcon("arrowRight", "ico--xs")} <span class="intensity-mini">${entry.actualM}</span> <span class="delta-tag ${mDelta > 0 ? "good" : mDelta < 0 ? "flat" : "flat"}">${mDelta > 0 ? "+" : ""}${mDelta}</span>` : " predicted"}</span>
          ` : ""}
        </div>
      </div>
      <div class="entry-body-wrap" aria-hidden="${expanded ? "false" : "true"}"${expanded ? "" : " inert"}>
        <div class="entry-body-clip">${renderActivityDetails(entry)}</div>
      </div>
    </article>
  `;
}

// Worry card: urgency + status (parked/dissolved/escalated/postponed)
// + time since parking.
function renderWorryCard(entry, index) {
  const expanded = state.printMode || state.expandedIds.has(entry.id);
  const r = entry.resolution;
  const statusLabel = r === "dissolved" ? "Dissolved on its own"
                    : r === "escalated" ? "Worked through"
                    : r === "postponed" ? "Postponed"
                    : "Parked";
  // Emits flag-worry--parked / flag-worry--resolved--<r>, which is what
  // styles.css defines. (The old "resolved resolved--<r>" form produced
  // classes no rule matched, so every resolved pill rendered unstyled.)
  const statusClass = r ? `resolved--${r}` : "parked";
  const ago = entry.parkedAt ? humanDuration(Date.now() - new Date(entry.parkedAt).getTime()) : "";
  return `
    <article class="entry-card entry-card--worry ${expanded ? "expanded" : ""}" id="entry-${entry.id}">
      <div class="entry-card-head" data-action="toggle-expand" data-id="${entry.id}" role="button" tabindex="0" aria-expanded="${expanded ? "true" : "false"}">
        <div class="entry-meta-row">
          <span class="entry-kind-tag">${svgIcon("clock", "ico--kind")} Worry</span>
          <span class="entry-meta-dot">·</span>
          <span class="entry-meta-time">${esc(fmtTime(entry.parkedAt || entry.createdAt))}${ago ? ` · ${esc(ago)} ago` : ""}</span>
          <span class="entry-meta-flags">
            <span class="entry-flag flag-worry flag-worry--${esc(statusClass)}">${esc(statusLabel)}</span>
          </span>
        </div>
        <h3 class="entry-card-trigger display">${esc(entry.worryText) || "(parked worry)"}</h3>
        <div class="entry-tags-row">
          ${typeof entry.urgency === "number" ? `<span class="felt-pill">Urgency <span class="intensity-mini">${entry.urgency}</span>/10</span>` : ""}
          ${entry.scheduledFor && !r ? `<span class="dist-chip">Window: ${esc(fmtDateTime(entry.scheduledFor))}</span>` : ""}
        </div>
      </div>
      <div class="entry-body-wrap" aria-hidden="${expanded ? "false" : "true"}"${expanded ? "" : " inert"}>
        <div class="entry-body-clip">${renderWorryDetails(entry)}</div>
      </div>
    </article>
  `;
}

function renderEntryDetails(entry) {
  const thoughts = entry.thoughts || [];
  const moods = entry.moods || [];

  // Three-stage mood arc per mood: initial → after reframe → after pivot.
  // Renders as a row per mood for legibility.
  const moodArc = moods.filter(m => m.family).map(m => {
    const label = m.variant ? cap(m.variant) + " · " + m.family : m.family;
    const stages = [{label: "start", value: m.intensity}];
    if (typeof m.intensityAfterReframe === "number") stages.push({label: "after reframe", value: m.intensityAfterReframe});
    if (typeof m.intensityAfterPivot   === "number") stages.push({label: "after pivot",   value: m.intensityAfterPivot});
    const last = stages[stages.length - 1].value;
    const delta = last - m.intensity;
    return `
      <div class="mood-arc">
        <div class="mood-arc-head">
          <span class="mood-arc-label">${esc(label)}</span>
          ${stages.length > 1 ? `<span class="delta-tag ${delta < 0 ? "good" : "flat"}">${delta > 0 ? "+" : ""}${delta}</span>` : ""}
        </div>
        <div class="mood-arc-stages">
          ${stages.map((s, i) => `
            <span class="mood-arc-stage">${s.value}</span>
            ${i < stages.length - 1 ? `<span class="mood-arc-sep" aria-hidden="true">${svgIcon("arrowRight", "ico--xs")}</span>` : ""}
          `).join("")}
          <span class="mood-arc-stage-key">${esc(stages.map(s => s.label).join(" → "))}</span>
        </div>
      </div>
    `;
  }).join("");

  // If this thought-record was escalated from a worry, surface the link
  // back so the user can see (and re-read) the worry that prompted it.
  const linkedWorry = entry.linkedEntryId
    ? state.entries.find(x => x.id === entry.linkedEntryId && x.kind === "worry")
    : null;

  return `
    <div class="entry-body">
      ${linkedWorry ? `
        <div class="detail-row entry-link-row">
          <button class="entry-link-btn" data-action="open-linked" data-id="${esc(linkedWorry.id)}" aria-label="Open the parked worry that started this entry">
            <span class="entry-link-eyebrow">From a parked worry</span>
            <span class="entry-link-text">"${esc((linkedWorry.worryText || "").slice(0, 80))}${linkedWorry.worryText && linkedWorry.worryText.length > 80 ? "…" : ""}"</span>
          </button>
        </div>
      ` : ""}
      <div class="detail-row">
        <div class="detail-label">1 · Trigger</div>
        <p class="detail-text">${entry.trigger ? esc(entry.trigger) : "—"}</p>
      </div>
      <div class="detail-row">
        <div class="detail-label">2 · Initial reaction</div>
        ${thoughts.length ? `
          <div class="detail-label" style="font-size: 13px; margin-bottom: 6px; opacity: 0.85;">Automatic thoughts</div>
          <ol class="thought-list">
            ${thoughts.map(t => `
              <li class="thought-list-item ${t.isHot ? "is-hot" : ""}">
                <p class="detail-text italic">${t.isHot ? `<span class="thought-hot-tag">${svgIcon("flame")}</span> ` : ""}"${esc(t.text) || "—"}"</p>
                ${typeof t.beliefBefore === "number" || typeof t.beliefAfter === "number" ? `
                  <div class="thought-belief-line">
                    ${typeof t.beliefBefore === "number" ? `<span>Belief start: <strong>${t.beliefBefore}%</strong></span>` : ""}
                    ${typeof t.beliefAfter  === "number" ? `<span>${svgIcon("arrowRight", "ico--xs")} after reframe: <strong>${t.beliefAfter}%</strong></span>` : ""}
                  </div>
                ` : ""}
              </li>
            `).join("")}
          </ol>
        ` : `<p class="detail-text muted">—</p>`}
        ${moodArc ? `
          <div class="detail-label" style="font-size: 13px; margin: 14px 0 6px; opacity: 0.85;">Moods</div>
          <div class="mood-arc-list">${moodArc}</div>
        ` : ""}
        ${entry.bodyCheck ? `
          <div class="detail-label" style="font-size: 13px; margin: 14px 0 6px; opacity: 0.85;">Body check</div>
          <p class="detail-text">${esc(entry.bodyCheck)}${entry.bodyInferred ? ` <span class="muted italic">(pieced together later)</span>` : ""}</p>
        ` : ""}
      </div>
      ${entry.thoughtsAccurate ? `
        <div class="detail-row">
          <div class="detail-label">3 · Distortion</div>
          <p class="detail-text"><span class="accurate-detail">Marked as accurate, not distorted — these thoughts feel true to you, and the rest of the entry holds them rather than arguing with them.</span></p>
        </div>
      ` : entry.distortions.length || entry.distortionNote ? `
        <div class="detail-row">
          <div class="detail-label">3 · Distortion${entry.distortions.length > 1 ? "s" : ""}</div>
          ${entry.distortions.length ? `<p class="detail-text">${entry.distortions.map(d => `<strong>${esc(d)}</strong>`).join(" + ")}</p>` : ""}
          ${entry.distortionNote ? `<p class="detail-text" style="margin-top: 4px;">${esc(entry.distortionNote)}</p>` : ""}
        </div>
      ` : ""}
      <div class="detail-row">
        <div class="detail-label">4 · Challenge (evidence + Socratic)</div>
        <div class="evidence-split">
          <div>
            <div class="detail-label" style="margin-bottom: 4px;">For</div>
            <p class="detail-text">${esc(entry.evidenceFor) || "—"}</p>
          </div>
          <div>
            <div class="detail-label" style="margin-bottom: 4px;">Against</div>
            <p class="detail-text">${esc(entry.evidenceAgainst) || "—"}</p>
          </div>
        </div>
        ${(entry.socraticQuestion || entry.socraticAnswer) ? `
          <div class="socratic-quote">
            <div class="detail-label" style="color: var(--copper-deep); margin-bottom: 2px;">
              Socratic${entry.socraticType ? " · " + esc(entry.socraticType) : ""}
              ${draftedSocraticMatchesBuiltInTemplate(entry) ? ` <span class="suggested-pill" title="Still matches the app starter — customize anytime">Starter text</span>` : ""}
            </div>
            ${entry.socraticQuestion ? `<p class="detail-text italic">"${esc(entry.socraticQuestion)}"</p>` : ""}
            ${entry.socraticAnswer ? `<p class="detail-text" style="margin-top: 6px;">${esc(entry.socraticAnswer)}</p>` : ""}
          </div>
        ` : ""}
      </div>
      <div class="detail-row">
        <div class="detail-label">
          5 · Reframe${entry.reframeMethod ? " · " + esc(entry.reframeMethod) : ""}
          ${draftedNewThoughtMatchesBuiltInTemplate(entry) ? ` <span class="suggested-pill" title="Still matches the app starter — customize anytime">Starter text</span>` : ""}
        </div>
        <p class="detail-text italic">${entry.newThought ? `"${esc(entry.newThought)}"` : "—"}</p>
        ${typeof entry.newThoughtBelief === "number" ? `<p class="detail-text" style="margin-top: 4px; color: var(--on-paper-mute);">Belief in this thought: <strong>${entry.newThoughtBelief}%</strong></p>` : ""}
        ${entry.newFeelings ? `<p class="detail-text" style="margin-top: 4px; color: var(--on-paper-mute);">New feelings: ${esc(entry.newFeelings)}</p>` : ""}
      </div>
      <div class="detail-row entry-pivot">
        <div class="entry-pivot-content">
          <div class="detail-label" style="color: var(--copper);">6 · The Pivot</div>
          <p class="detail-text entry-pivot-text ${entry.pivotDone ? "done" : ""}">${esc(entry.pivot) || "—"}</p>
          ${entry.pivotPrediction ? `<p class="detail-text" style="margin-top: 4px; color: var(--on-paper-mute);">Expected: ${esc(entry.pivotPrediction)}</p>` : ""}
        </div>
        <label class="pivot-toggle-large">
          <input type="checkbox" data-action="toggle-pivot" data-id="${entry.id}" ${entry.pivotDone ? "checked" : ""}>
          <span>Done</span>
        </label>
      </div>
      ${entry.pivotDone ? `
        <div class="detail-row pivot-followup">
          <div class="detail-label pivot-followup-label">
            <span>What happened?</span>
            ${entry.pivotDoneAt ? `<span class="pivot-followup-when">marked done ${esc(fmtDateTime(entry.pivotDoneAt))}</span>` : ""}
          </div>
          <textarea class="textarea pivot-reflection-input" data-action="edit-reflection" data-id="${entry.id}" rows="3" placeholder="${entry.pivotPrediction ? "How did it compare with what you expected? That gap is what teaches you next time." : "A line on how it went. The dread vs. the actual outcome is the part to write down; that's what teaches you next time."}">${esc(entry.pivotReflection)}</textarea>
          ${!entry.outcomeRecorded ? `
            <button class="btn btn-primary outcome-cta" data-action="open-outcome" data-id="${entry.id}">
              Step 8 · Re-rate moods after acting
            </button>
          ` : `<p class="outcome-done-line">${svgIcon("check", "ico--inline")} Step 8 complete — moods re-rated after the pivot.</p>`}
        </div>
      ` : ""}
    </div>
    <div class="entry-card-actions">
      <span class="entry-card-actions-time">${esc(fmtDateTime(entry.createdAt))}</span>
      <div class="entry-card-actions-buttons">
        ${entry.isQuick ? `<button class="action-btn primary" data-action="finish-quick" data-id="${entry.id}">Finish this entry</button>` : `<button class="action-btn primary" data-action="edit" data-id="${entry.id}">Edit</button>`}
        <button class="action-btn" data-action="copy-entry" data-id="${entry.id}" title="Copy this entry as Markdown — for sharing with a clinician or pasting elsewhere">Copy</button>
        <button class="action-btn danger" data-action="delete" data-id="${entry.id}">Delete</button>
      </div>
    </div>
  `;
}

// Free-form expanded body — just the full text, plus mood arc + actions.
function renderFreeformDetails(entry) {
  const moods = entry.moods || [];
  return `
    <div class="entry-body">
      <div class="detail-row">
        <p class="freeform-detail-body">${esc(entry.body) || "—"}</p>
      </div>
      ${moods.filter(m => m.family).length ? `
        <div class="detail-row">
          <div class="detail-label">Mood${moods.filter(m => m.family).length > 1 ? "s" : ""}</div>
          <div class="mood-arc-list">
            ${moods.filter(m => m.family).map(m => {
              const label = m.variant ? cap(m.variant) + " · " + m.family : m.family;
              return `<div class="mood-arc"><div class="mood-arc-head"><span class="mood-arc-label">${esc(label)}</span></div><div class="mood-arc-stages"><span class="mood-arc-stage">${m.intensity}</span></div></div>`;
            }).join("")}
          </div>
        </div>
      ` : ""}
    </div>
    <div class="entry-card-actions">
      <span class="entry-card-actions-time">${esc(fmtDateTime(entry.createdAt))}</span>
      <div class="entry-card-actions-buttons">
        <button class="action-btn primary" data-action="edit" data-id="${entry.id}">Edit</button>
        <button class="action-btn" data-action="copy-entry" data-id="${entry.id}" title="Copy as Markdown">Copy</button>
        <button class="action-btn danger" data-action="delete" data-id="${entry.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderActivityDetails(entry) {
  const isPast = entry.plannedFor && new Date(entry.plannedFor).getTime() < Date.now();
  const isCompleted = !!entry.completedAt;
  const showLogCTA = isPast && !isCompleted;
  return `
    <div class="entry-body">
      ${typeof entry.predictedP === "number" || typeof entry.predictedM === "number" ? `
        <div class="detail-row">
          <div class="detail-label">Predicted</div>
          <div class="review-meta-row">
            ${typeof entry.predictedP === "number" ? `<div class="review-meta-item">Pleasure: <strong>${entry.predictedP}/10</strong></div>` : ""}
            ${typeof entry.predictedM === "number" ? `<div class="review-meta-item">Mastery: <strong>${entry.predictedM}/10</strong></div>` : ""}
          </div>
        </div>
      ` : ""}
      ${isCompleted ? `
        <div class="detail-row">
          <div class="detail-label">Actual</div>
          <div class="review-meta-row">
            ${typeof entry.actualP === "number" ? `<div class="review-meta-item">Pleasure: <strong>${entry.actualP}/10</strong></div>` : ""}
            ${typeof entry.actualM === "number" ? `<div class="review-meta-item">Mastery: <strong>${entry.actualM}/10</strong></div>` : ""}
          </div>
          ${entry.activityNotes ? `<p class="detail-text" style="margin-top: 10px;">${esc(entry.activityNotes)}</p>` : ""}
        </div>
      ` : ""}
      ${showLogCTA ? `
        <div class="detail-row pivot-followup">
          <button class="btn btn-primary outcome-cta" data-action="open-log-activity" data-id="${entry.id}">
            How did it go? · Log actual P/M
          </button>
        </div>
      ` : ""}
    </div>
    <div class="entry-card-actions">
      <span class="entry-card-actions-time">${esc(fmtDateTime(entry.createdAt))}</span>
      <div class="entry-card-actions-buttons">
        ${showLogCTA ? `<button class="action-btn primary" data-action="open-log-activity" data-id="${entry.id}">Log result</button>` : `<button class="action-btn primary" data-action="edit" data-id="${entry.id}">Edit</button>`}
        <button class="action-btn" data-action="copy-entry" data-id="${entry.id}">Copy</button>
        <button class="action-btn danger" data-action="delete" data-id="${entry.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderWorryDetails(entry) {
  const r = entry.resolution;
  const showWindow = !r; // parked worries can still be resolved
  const linkedRecord = entry.linkedEntryId
    ? state.entries.find(x => x.id === entry.linkedEntryId && x.kind === "thought-record")
    : null;
  return `
    <div class="entry-body">
      <div class="detail-row">
        <p class="detail-text">${esc(entry.worryText) || "—"}</p>
      </div>
      ${entry.parkedAt ? `
        <div class="detail-row">
          <div class="detail-label">Parked</div>
          <p class="detail-text">${esc(fmtDateTime(entry.parkedAt))}${entry.scheduledFor ? ` · scheduled window: ${esc(fmtDateTime(entry.scheduledFor))}` : ""}</p>
        </div>
      ` : ""}
      ${r ? `
        <div class="detail-row">
          <div class="detail-label">Resolved</div>
          <p class="detail-text">${esc(r === "dissolved" ? "Dissolved on its own" : r === "escalated" ? "Worked through (converted to a thought record)" : "Postponed to next window")}${entry.resolvedAt ? " — " + esc(fmtDateTime(entry.resolvedAt)) : ""}</p>
        </div>
      ` : ""}
      ${linkedRecord ? `
        <div class="detail-row entry-link-row">
          <button class="entry-link-btn" data-action="open-linked" data-id="${esc(linkedRecord.id)}" aria-label="Open the thought record that worked through this worry">
            <span class="entry-link-eyebrow">Worked through here ${svgIcon("arrowRight", "ico--xs")}</span>
            <span class="entry-link-text">"${esc((linkedRecord.trigger || "").slice(0, 80))}${linkedRecord.trigger && linkedRecord.trigger.length > 80 ? "…" : ""}"</span>
          </button>
        </div>
      ` : ""}
      ${showWindow ? `
        <div class="detail-row pivot-followup">
          <div class="detail-label pivot-followup-label">
            <span>How is this worry doing?</span>
          </div>
          <div class="worry-actions">
            <button class="action-btn primary" data-action="worry-dissolve" data-id="${entry.id}">Dissolved on its own</button>
            <button class="action-btn" data-action="worry-escalate" data-id="${entry.id}">Work it through or make a plan</button>
            <button class="action-btn ghost" data-action="worry-postpone" data-id="${entry.id}">Postpone again</button>
          </div>
          ${entry.postponeCount >= 2 ? `
            <p class="field-help-paper" style="margin-top: 8px;">This one has been postponed ${entry.postponeCount} times. Worry time is for dealing with it, so working it through, or making a plan (the thought record ends with one concrete step), will likely help more than another postponement.</p>
          ` : ""}
        </div>
      ` : ""}
    </div>
    <div class="entry-card-actions">
      <span class="entry-card-actions-time">${esc(fmtDateTime(entry.createdAt))}</span>
      <div class="entry-card-actions-buttons">
        <button class="action-btn" data-action="copy-entry" data-id="${entry.id}">Copy</button>
        <button class="action-btn danger" data-action="delete" data-id="${entry.id}">Delete</button>
      </div>
    </div>
  `;
}

// Entry-kind metadata used by the Capture mode switcher. Order here is
// the visual order of the chip row.
const CAPTURE_MODES = [
  { kind: "thought-record", label: "Thought record", sub: "Walk a thought through 7 steps." },
  { kind: "freeform",       label: "Free write",     sub: "Open page. Write whatever comes." },
  { kind: "activity",       label: "Plan activity",  sub: "Pick something to do, rate later." },
  { kind: "worry",          label: "Park a worry",   sub: "Set it aside for the worry window." },
];

function renderCapture() {
  const d = state.draft;
  // Mode switcher only shows when starting fresh (not when editing an
  // existing entry — switching the kind of an in-flight entry would
  // discard its data, which would feel hostile).
  const showModeSwitcher = !state.editingId;
  const modeHeader = showModeSwitcher ? `
    <div class="capture-modes" role="tablist" aria-label="Entry type">
      ${CAPTURE_MODES.map(m => `
        <button class="capture-mode-chip ${d.kind === m.kind ? "active" : ""}" data-action="set-capture-mode" data-kind="${esc(m.kind)}" role="tab" aria-selected="${d.kind === m.kind}">
          <span class="capture-mode-label">${esc(m.label)}</span>
          <span class="capture-mode-sub">${esc(m.sub)}</span>
        </button>
      `).join("")}
    </div>
  ` : "";

  const inner = d.kind === "freeform" ? renderFreeformCapture(d)
              : d.kind === "activity" ? renderActivityCapture(d)
              : d.kind === "worry"    ? renderWorryCapture(d)
              :                          renderThoughtRecordCapture(d);

  return `
    <div class="page-header">
      <div class="page-eyebrow">${state.editingId ? "Editing" : "Capture"}</div>
      <h1 class="page-title display">${state.editingId ? "Refine entry" : "New entry"}</h1>
    </div>
    ${modeHeader}
    ${inner}
  `;
}

// The original 7-step structured thought-record flow, lifted as-is from
// the old renderCapture() body.
function renderThoughtRecordCapture(d) {
  const totalSteps = 7;
  const step = state.captureStep;
  return `
    <div class="capture-shell">
      <div class="capture-progress">
        <div class="progress-top">
          <span class="progress-title">${esc(STEP_TITLES[step - 1])}</span>
          <span class="progress-count">${step} of ${totalSteps}</span>
        </div>
        <div class="progress-track">
          ${Array.from({ length: totalSteps }, (_, i) => {
            const n = i + 1;
            const cls = n < step ? "completed" : n === step ? "active" : "";
            return `<button class="progress-dot ${cls}" data-action="goto-step" data-step="${n}" aria-label="Step ${n}"></button>`;
          }).join("")}
        </div>
      </div>

      <div class="capture-screen">
        <div class="step-header">
          <div class="step-num">Step ${step === 7 ? "—" : step}</div>
          <h2 class="step-prompt display">${esc(STEP_PROMPTS[step - 1])}</h2>
          <p class="step-hint">${esc(STEP_HINTS[step - 1])}</p>
        </div>

        ${renderCaptureStep(step, d)}
      </div>

      <div class="capture-footer">
        <div class="capture-footer-left">
          ${step > 1 ? `<button class="btn-back" data-action="prev-step">${svgIcon("arrowLeft", "ico--btn")} Back</button>` : ""}
          <button class="btn-discard" data-action="discard-capture">Discard</button>
        </div>
        ${step < totalSteps
          ? `<button class="btn btn-primary" data-action="next-step" ${canAdvance(step, d) ? "" : "disabled"}>Continue ${svgIcon("arrowRight", "ico--btn")}</button>`
          : `<button class="btn btn-primary" data-action="save-entry">${state.editingId ? "Save changes" : "Save entry"}</button>`
        }
      </div>
    </div>
  `;
}

// Free-form: single screen. Optional title (the existing `trigger` field
// is reused as the title for kind:"freeform" entries — keeps the schema
// tighter), a long-form body textarea, and an optional mood widget.
function renderFreeformCapture(d) {
  const moods = d.moods || [];
  return `
    <div class="capture-shell">
      <div class="capture-screen">
        <div class="step-header">
          <h2 class="step-prompt display">Write what's there</h2>
          <p class="step-hint">No structure. No prompts you have to answer. Title is optional. You can tag a mood at the bottom if it helps you find the entry later.</p>
        </div>

        <div class="field-group">
          <label class="field-label-paper">Title (optional)</label>
          <input class="input" data-field="trigger" placeholder="A line that names this moment" value="${esc(d.trigger)}">
        </div>

        <div class="field-group">
          <label class="field-label-paper">Body</label>
          <textarea class="textarea input-large freeform-body" data-field="body" rows="14" data-autofocus placeholder="Whatever comes. One sentence is fine. So is ten paragraphs.">${esc(d.body)}</textarea>
        </div>

        <div class="step2-section" style="margin-top: 18px;">
          <div class="step2-section-head">
            <span class="step2-eyebrow">Optional</span>
            <h3 class="step2-title display">Tag a mood (or skip)</h3>
            <p class="step2-sub">Only if a feeling stands out. Otherwise leave it blank.</p>
          </div>
          ${moods.length === 0 ? `
            <div class="quick-prompts" role="group" aria-label="Starter mood tags" style="margin-bottom: 10px;">
              <span class="quick-prompts-label">Or start from a mood family:</span>
              ${Object.keys(EMOTION_FAMILIES).map(f => `
                <button type="button" class="quick-prompt-chip" data-action="seed-freeform-mood" data-family="${esc(f)}">${esc(f)}</button>
              `).join("")}
            </div>
            <button type="button" class="row-add" data-action="add-mood">${svgIcon("plus", "ico--btn")} Add a mood</button>
          ` : `
            <div class="row-list" data-list="moods">
              ${moods.map(m => `
                <div class="row-card row-card--mood" data-row-id="${esc(m.id)}">
                  <div class="row-head">
                    <div class="field-row-split">
                      <select class="select" data-action="edit-mood-family" data-id="${esc(m.id)}">
                        <option value="">— family —</option>
                        ${Object.keys(EMOTION_FAMILIES).map(f => `<option value="${esc(f)}" ${m.family === f ? "selected" : ""}>${esc(f)}</option>`).join("")}
                      </select>
                      <select class="select" data-action="edit-mood-variant" data-id="${esc(m.id)}" ${!m.family ? "disabled" : ""}>
                        <option value="">— variant —</option>
                        ${_variantOptions(m)}
                      </select>
                    </div>
                    <button type="button" class="row-remove" data-action="remove-mood" data-id="${esc(m.id)}" aria-label="Remove this mood">${svgIcon("close")}</button>
                  </div>
                  <div class="intensity-control intensity-control--row">
                    <div class="intensity-head">
                      <span class="intensity-num-big"><span data-slider-display="mood-${esc(m.id)}">${m.intensity}</span><span class="intensity-num-suffix">/100</span></span>
                      <div class="intensity-band-label">
                        <div class="intensity-band-name display" data-slider-band-name="mood-${esc(m.id)}">${esc(band(m.intensity).label)}</div>
                      </div>
                    </div>
                    <input type="range" min="0" max="100" value="${m.intensity}" data-action="edit-mood-intensity" data-id="${esc(m.id)}" class="intensity-slider intensity-slider--emotion" aria-label="Mood intensity, 0 to 100">
                  </div>
                </div>
              `).join("")}
            </div>
          `}
        </div>
      </div>

      <div class="capture-footer">
        <div class="capture-footer-left">
          <button class="btn-discard" data-action="discard-capture">Discard</button>
        </div>
        <button class="btn btn-primary" data-action="save-entry" ${(d.body || "").trim() ? "" : "disabled"}>${state.editingId ? "Save changes" : "Save entry"}</button>
      </div>
    </div>
  `;
}

// Activity plan: description + category + plannedFor + predicted P/M.
// Logged completion lives in a separate modal (renderLogActivityModal).
function renderActivityCapture(d) {
  const cats = ACTIVITY_CATEGORIES;
  const canSave = (d.body || "").trim().length > 0 && !!d.category && !!d.plannedFor;
  return `
    <div class="capture-shell">
      <div class="capture-screen">
        <div class="step-header">
          <h2 class="step-prompt display">Plan one thing</h2>
          <p class="step-hint">Behavioral activation in one move: pick something concrete, predict how much you'll enjoy it and how much of a sense of accomplishment it'll give you, then come back after to compare. Low mood often underestimates how things will go, but doing the activity is what matters most.</p>
        </div>

        <div class="field-group">
          <label class="field-label-paper">What will you do?</label>
          <input class="input" data-field="body" placeholder="Call my sister" value="${esc(d.body)}" data-autofocus>
        </div>

        <div class="field-group">
          <label class="field-label-paper">Category</label>
          <div class="activity-cats">
            ${cats.map(c => `
              <button type="button" class="activity-cat-chip ${d.category === c.value ? "active" : ""}" data-action="set-activity-category" data-value="${esc(c.value)}">
                <span class="activity-cat-emoji" aria-hidden="true">${svgIcon(c.icon, "ico--cat")}</span>
                <span class="activity-cat-label">${esc(c.label)}</span>
              </button>
            `).join("")}
          </div>
        </div>

        <div class="field-group">
          <label class="field-label-paper">When</label>
          <input class="input" type="datetime-local" data-field="plannedFor" value="${esc(toDatetimeLocalInputValue(d.plannedFor))}">
        </div>

        <div class="field-group">
          <label class="field-label-paper">Predicted pleasure (0–10)</label>
          <div class="belief-control">
            <div class="belief-head">
              <span class="belief-num display"><span data-slider-display="predP">${d.predictedP ?? 5}</span><span class="belief-num-suffix">/10</span></span>
              <span class="belief-hint">How enjoyable do you predict this will be?</span>
            </div>
            <input type="range" min="0" max="10" step="1" value="${d.predictedP ?? 5}" data-field="predictedP" class="intensity-slider" aria-label="Predicted pleasure, 0 to 10">
            <div class="intensity-bands">
              <span>nothing</span><span>some</span><span>a lot</span>
            </div>
          </div>
        </div>

        <div class="field-group">
          <label class="field-label-paper">Predicted mastery (0–10)</label>
          <div class="belief-control">
            <div class="belief-head">
              <span class="belief-num display"><span data-slider-display="predM">${d.predictedM ?? 5}</span><span class="belief-num-suffix">/10</span></span>
              <span class="belief-hint">How much of a sense of accomplishment do you expect, given how you feel today? On a hard day, just getting it done can score high.</span>
            </div>
            <input type="range" min="0" max="10" step="1" value="${d.predictedM ?? 5}" data-field="predictedM" class="intensity-slider" aria-label="Predicted mastery, 0 to 10">
            <div class="intensity-bands">
              <span>not at all</span><span>some</span><span>fully</span>
            </div>
          </div>
        </div>
      </div>

      <div class="capture-footer">
        <div class="capture-footer-left">
          <button class="btn-discard" data-action="discard-capture">Discard</button>
        </div>
        <button class="btn btn-primary" data-action="save-entry" ${canSave ? "" : "disabled"}>${state.editingId ? "Save changes" : "Add to plan"}</button>
      </div>
    </div>
  `;
}

// Worry park: text + urgency. scheduledFor is computed from settings on
// save. The dedicated worry-window list view handles resolution.
function renderWorryCapture(d) {
  const canSave = (d.worryText || "").trim().length > 0;
  const nextWindow = computeNextWorryWindow();
  return `
    <div class="capture-shell">
      <div class="capture-screen">
        <div class="step-header">
          <h2 class="step-prompt display">Park it</h2>
          <p class="step-hint">Worry postponement: write it down, set it aside, and come back to it at worry time. Many worries feel smaller by then, and either way you practise showing that worry can wait. If it's about a symptom that's new, severe or not going away, get it checked: postpone the worry, not the doctor.</p>
        </div>

        <div class="field-group">
          <label class="field-label-paper">What's worrying you?</label>
          <textarea class="textarea input-large" data-field="worryText" rows="5" data-autofocus placeholder="One sentence. You don't have to solve it now — you're parking it.">${esc(d.worryText)}</textarea>
          <div class="quick-prompts" role="group" aria-label="Worries people often park">
            <span class="quick-prompts-label">Starter lines:</span>
            ${WORRY_STARTER_CHIPS.map(p => `
              <button type="button" class="quick-prompt-chip" data-action="insert-capture-starter" data-insert-field="worryText" data-seed="${esc(p.seed)}">${esc(p.label)}</button>
            `).join("")}
          </div>
        </div>

        <div class="field-group">
          <label class="field-label-paper">Urgency, 0–10</label>
          <div class="belief-control">
            <div class="belief-head">
              <span class="belief-num display"><span data-slider-display="urgency">${d.urgency ?? 5}</span><span class="belief-num-suffix">/10</span></span>
              <span class="belief-hint">How loud is it right now?</span>
            </div>
            <input type="range" min="0" max="10" step="1" value="${d.urgency ?? 5}" data-field="urgency" class="intensity-slider" aria-label="Worry urgency, 0 to 10">
            <div class="intensity-bands">
              <span>quiet</span><span>medium</span><span>loud</span>
            </div>
          </div>
        </div>

        <div class="worry-window-note">
          <span class="worry-window-eyebrow">Next worry window</span>
          <span class="worry-window-time">${esc(fmtDateTime(nextWindow))}</span>
          <p class="worry-window-help">You can change the worry-window time in Settings → Worry window.</p>
        </div>
      </div>

      <div class="capture-footer">
        <div class="capture-footer-left">
          <button class="btn-discard" data-action="discard-capture">Discard</button>
        </div>
        <button class="btn btn-primary" data-action="save-entry" ${canSave ? "" : "disabled"}>${state.editingId ? "Save changes" : "Park worry"}</button>
      </div>
    </div>
  `;
}

function canAdvance(step, d) {
  if (step === 1) return ((d.trigger || "").trim()).length > 0;
  // Step 2 now: require at least one thought with text. Moods are nice to
  // have but not required to advance — body-check stays optional.
  if (step === 2) return (d.thoughts || []).some(t => (t.text || "").trim().length > 0);
  return true;
}

// Activity categories — keeping the list short and recognizable so the
// "what category was this" question has obvious answers. Each maps to a
// minimal line icon (see ICONS) for at-a-glance scanning.
const ACTIVITY_CATEGORIES = [
  { value: "connection", label: "Connection", icon: "connection" },
  { value: "movement",   label: "Movement",   icon: "movement" },
  { value: "creation",   label: "Creation",   icon: "creation" },
  // Behavioral activation is organised around life areas and values
  // (Martell et al.; Lejuez et al.'s BATD-R), and work or study and
  // meaning (helping, faith, learning, values) had nowhere to go.
  { value: "work",       label: "Work or study", icon: "work" },
  { value: "meaning",    label: "Meaning",    icon: "meaning" },
  { value: "self-care",  label: "Self-care",  icon: "selfcare" },
  { value: "chore",      label: "Responsibilities", icon: "chore" },
  { value: "rest",       label: "Rest",       icon: "rest" },
  { value: "other",      label: "Other",      icon: "other" },
];
// Resolve a category's icon by value, falling back to the neutral "other"
// mark for unknown/legacy categories.
function catIcon(value, cls = "") {
  const c = ACTIVITY_CATEGORIES.find(x => x.value === value);
  return svgIcon(c ? c.icon : "other", cls);
}

// Computes the next worry-window time given the user's settings.
// If today's window time hasn't passed yet, return today; else tomorrow.
// Parse an HH:MM setting into validated [hours, minutes], falling back to the
// 18:00 default for anything malformed (a hand-edited or older-version
// setting, or a value written by another tab). Without validation a garbage
// value yields NaN → setHours(NaN) → Invalid Date, which makes
// computeNextWorryWindow throw on toISOString() mid-render/mid-save.
function _parseHHMM(str) {
  const mm = /^(\d{1,2}):(\d{2})$/.exec(String(str == null ? "" : str).trim());
  let h = mm ? parseInt(mm[1], 10) : NaN;
  let m = mm ? parseInt(mm[2], 10) : NaN;
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) { h = 18; m = 0; }
  return [h, m];
}

function computeNextWorryWindow() {
  const s = state.settings || {};
  const [h, m] = _parseHHMM(s.worryWindowTime);
  const t = new Date();
  t.setHours(h, m, 0, 0);
  if (t.getTime() < Date.now()) t.setDate(t.getDate() + 1);
  return t.toISOString();
}

function renderCaptureStep(step, d) {
  switch (step) {
    case 1: return `
      <div class="field-group">
        <textarea class="textarea input-large" data-field="trigger" rows="3" data-autofocus placeholder="Texted a friend and they still haven't replied…">${esc(d.trigger)}</textarea>
        <div class="field-help-paper" style="margin-top: 8px;">An event, a thought, or a feeling — any of those can be the starting point. You don't need to know yet which one this is.</div>
        <div class="quick-prompts" role="group" aria-label="Starter lines for trigger">
          <span class="quick-prompts-label">Or tap a starter:</span>
          ${TRIGGER_CAPTURE_CHIPS.map(p => `
            <button type="button" class="quick-prompt-chip" data-action="insert-capture-starter" data-insert-field="trigger" data-seed="${esc(p.seed)}">${esc(p.label)}</button>
          `).join("")}
        </div>
      </div>
    `;

    case 2: {
      // Sectioned layout: Thoughts → Moods → Body. Multi-row, each row
      // editable in place. Hot-thought radio drives Challenge (step 4) and Reframe (step 5).
      // Seed the draft's arrays in place when empty rather than rendering a
      // throwaway placeholder: the row's controls look their model up by id in
      // state.draft.moods/thoughts, so an un-backed placeholder (e.g. a legacy
      // or imported record with moods:[]) would render a mood row whose family
      // select, slider and checkbox all silently do nothing.
      if (!d.thoughts.length) d.thoughts.push(normalizeThought({ isHot: true }));
      if (!d.moods.length)    d.moods.push(normalizeMood({}));
      const thoughts = d.thoughts;
      const moods    = d.moods;
      return `
      <div class="step2-section">
        <div class="step2-section-head">
          <span class="step2-eyebrow">A · Thoughts</span>
          <h3 class="step2-title display">What thoughts came up?</h3>
          <p class="step2-sub">List every automatic thought, not just one. Mark the hot thought: the one with the most emotional charge, most tied to your strongest feeling. That's the one we'll put on trial in Step 4.</p>
        </div>
        <div class="row-list" data-list="thoughts">
          ${thoughts.map((t, idx) => `
            <div class="row-card${t.isHot ? " is-hot" : ""}" data-row-id="${esc(t.id)}">
              <div class="row-head">
                <label class="row-hot">
                  <input type="radio" name="hotThought" data-action="set-hot" data-id="${esc(t.id)}" ${t.isHot ? "checked" : ""}>
                  <span class="row-hot-label">${t.isHot ? `${svgIcon("flame", "ico--inline")} Hot thought` : "Mark hot"}</span>
                </label>
                ${thoughts.length > 1 ? `<button type="button" class="row-remove" data-action="remove-thought" data-id="${esc(t.id)}" aria-label="Remove this thought">${svgIcon("close")}</button>` : ""}
              </div>
              <textarea class="textarea row-textarea" data-action="edit-thought-text" data-id="${esc(t.id)}" rows="3"
                placeholder="${idx === 0 ? "They're ignoring me — I must have said something wrong." : "Another thought that came up…"}">${esc(t.text)}</textarea>
              <div class="row-belief">
                <span class="row-belief-label">Belief at the time</span>
                <span class="row-belief-num"><span data-slider-display="belief-${esc(t.id)}">${t.beliefBefore ?? 70}</span><span class="belief-num-suffix">%</span></span>
              </div>
              <input type="range" min="0" max="100" value="${t.beliefBefore ?? 70}" data-action="edit-thought-belief" data-id="${esc(t.id)}" class="intensity-slider" aria-label="Belief in this thought, 0 to 100 percent">
              <div class="intensity-bands">
                <span>don't buy it</span><span>50%</span><span>fully convinced</span>
              </div>
            </div>
          `).join("")}
        </div>
        <button type="button" class="row-add" data-action="add-thought">${svgIcon("plus", "ico--btn")} Add another thought</button>
      </div>

      <div class="step2-section">
        <div class="step2-section-head">
          <span class="step2-eyebrow">B · Moods</span>
          <h3 class="step2-title display">What feelings did you notice?</h3>
          <p class="step2-sub">Real moments often carry more than one — anxious <em>and</em> ashamed, hurt <em>and</em> angry. List each separately so we can re-rate each one after the reframe and after you act.</p>
        </div>
        <div class="row-list" data-list="moods">
          ${moods.map(m => `
            <div class="row-card row-card--mood" data-row-id="${esc(m.id)}">
              <div class="row-head">
                <div class="field-row-split">
                  <select class="select" data-action="edit-mood-family" data-id="${esc(m.id)}">
                    <option value="">— family —</option>
                    ${Object.keys(EMOTION_FAMILIES).map(f => `<option value="${esc(f)}" ${m.family === f ? "selected" : ""}>${esc(f)}</option>`).join("")}
                  </select>
                  <select class="select" data-action="edit-mood-variant" data-id="${esc(m.id)}" ${!m.family ? "disabled" : ""}>
                    <option value="">— variant —</option>
                    ${_variantOptions(m)}
                  </select>
                </div>
                ${moods.length > 1 ? `<button type="button" class="row-remove" data-action="remove-mood" data-id="${esc(m.id)}" aria-label="Remove this mood">${svgIcon("close")}</button>` : ""}
              </div>
              <div class="intensity-control intensity-control--row">
                <div class="intensity-head">
                  <span class="intensity-num-big"><span data-slider-display="mood-${esc(m.id)}">${m.intensity}</span><span class="intensity-num-suffix">/100</span></span>
                  <div class="intensity-band-label">
                    <div class="intensity-band-name display" data-slider-band-name="mood-${esc(m.id)}">${esc(band(m.intensity).label)}</div>
                    <div class="intensity-band-sig" data-slider-band-sig="mood-${esc(m.id)}">${esc(band(m.intensity).signals)}</div>
                  </div>
                </div>
                <input type="range" min="0" max="100" value="${m.intensity}" data-action="edit-mood-intensity" data-id="${esc(m.id)}" class="intensity-slider intensity-slider--emotion" aria-label="Mood intensity, 0 to 100">
                <div class="intensity-bands">
                  <span>Mild</span><span>Mod</span><span>Strong</span><span>High</span><span>Severe</span>
                </div>
                <label class="checkbox-flag">
                  <input type="checkbox" data-action="edit-mood-estimated" data-id="${esc(m.id)}" ${m.estimated ? "checked" : ""}>
                  <span>Mark as estimated</span>
                </label>
              </div>
            </div>
          `).join("")}
        </div>
        <button type="button" class="row-add" data-action="add-mood">${svgIcon("plus", "ico--btn")} Add another mood</button>
      </div>

      <div class="step2-section">
        <div class="step2-section-head">
          <span class="step2-eyebrow">C · Body</span>
          <h3 class="step2-title display">Where did it land in the body?</h3>
          <p class="step2-sub">Optional. Body sensations can help you name the feeling, and they make a useful early-warning sign for the next time this pattern shows up.</p>
        </div>
        <div class="field-group">
          <textarea class="textarea" data-field="bodyCheck" rows="2" placeholder="Face flushing, urge to flee…">${esc(d.bodyCheck)}</textarea>
          <label class="checkbox-flag">
            <input type="checkbox" data-field="bodyInferred" ${d.bodyInferred ? "checked" : ""}>
            <span>Pieced together later, not felt at the time</span>
          </label>
          <details class="ref-inline">
            <summary><span class="chev">▸</span> Body region reference</summary>
            <div class="ref-inline-body">
              <table>
                ${BODY_REGIONS.map(b => `<tr><td>${b.region}</td><td class="muted">${esc(b.examples)}</td></tr>`).join("")}
              </table>
            </div>
          </details>
        </div>
      </div>
    `;
    }

    case 3: return `
      <div class="field-group">
        <button class="accurate-tile ${d.thoughtsAccurate ? "active" : ""}" data-action="toggle-accurate">
          <div class="accurate-tile-name">
            <span>The facts seem to back these thoughts up</span>
            <span class="distortion-tile-check">${svgIcon("check")}</span>
          </div>
          <div class="accurate-tile-desc">Not every painful thought is distorted. Grief, real anger, and an honest look at a real mistake don't need to be argued away. Distorted thoughts can feel true too, so still weigh the evidence next, and check whether what you're concluding goes further than the facts.</div>
        </button>
      </div>

      ${d.thoughtsAccurate ? "" : `
        <div class="field-group">
          <div class="distortion-grid">
            ${DISTORTIONS.map(dist => {
              const active = (d.distortions || []).includes(dist.name);
              return `
                <button class="distortion-tile ${active ? "active" : ""}" data-action="toggle-distortion" data-name="${esc(dist.name)}">
                  <div class="distortion-tile-name">
                    <span>${esc(dist.name)}</span>
                    <span class="distortion-tile-check">${svgIcon("check")}</span>
                  </div>
                  <div class="distortion-tile-desc">${esc(dist.desc)}</div>
                </button>
              `;
            }).join("")}
          </div>
          <p class="step-hint" style="margin-top: 10px;">Pick the one or two closest; the patterns overlap, so there's rarely a single right answer. Zero is also fine. The question is whether you notice these patterns, not whether you must find one.</p>
          ${(d.distortions && d.distortions[0] && DISTORTION_DEFAULTS[d.distortions[0]]) ? `
            <div class="auto-suggest-note" role="note">
              <strong>You picked ${esc(d.distortions[0])}.</strong> The next steps come pre-set with a question type and a reframe style that usually fit — adapt or swap if a different angle lands better for you.
            </div>
          ` : ""}
          <details class="ref-inline">
            <summary><span class="chev">▸</span> Patterns that often overlap</summary>
            <div class="ref-inline-body">
              <ul>${COMMON_PAIRS.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
            </div>
          </details>
        </div>

        <div class="field-group">
          <label class="field-label-paper">Distortion note (optional)</label>
          <textarea class="textarea" data-field="distortionNote" rows="2" placeholder="Read their silence as rejection, then treated one guess as fact…">${esc(d.distortionNote)}</textarea>
        </div>
      `}
    `;

    case 4: {
      const hot = hotThought(d);
      // Grounding gate now keys off the highest-intensity mood, since
      // there may be several. If anything is ≥80 we surface the prompt.
      const peakIntensity = (d.moods || []).reduce((a, m) => Math.max(a, m.intensity || 0), 0);
      return `
      ${peakIntensity >= 80 ? `
        <div class="grounding-note" role="note">
          <div class="grounding-note-eyebrow">Pause first</div>
          <div class="grounding-note-body">
            <p>One of your moods is at <strong>${peakIntensity}/100</strong>. Cognitive work tends to land better after you've taken a moment to settle the body — and what you write here will still be here when you come back.</p>
            <p><strong>Try 5-4-3-2-1:</strong> name 5 things you can see, 4 you can hear, 3 you can touch, 2 you can smell, 1 you can taste. Slow each one down. Then continue.</p>
            <p class="grounding-note-foot">If this level of distress is more than you can sit with right now, <button class="link-button" data-action="open-safety">crisis support is here</button>.</p>
          </div>
        </div>
      ` : ""}
      ${hot && hot.text ? `
        <div class="hot-thought-card" aria-label="Hot thought you're challenging">
          <span class="hot-thought-eyebrow">${svgIcon("flame", "ico--inline")} Hot thought on trial</span>
          <p class="hot-thought-quote display italic">"${esc(hot.text)}"</p>
          ${typeof hot.beliefBefore === "number" ? `<span class="hot-thought-belief">Belief before: <strong>${hot.beliefBefore}%</strong></span>` : ""}
        </div>
      ` : ""}
      <div class="explainer-card">
        <div class="explainer-eyebrow">What this step is doing</div>
        <p class="explainer-body"><strong>Putting the thought on trial.</strong> CBT calls this <em>cognitive restructuring</em> — instead of accepting the automatic thought as fact, you treat it like a claim and look for evidence on both sides. The goal isn't to "win" against the thought; it's to see whether it holds up when you actually examine it.</p>
      </div>
      <div class="field-group">
        <label class="field-label-paper">Evidence FOR the thought</label>
        <p class="field-help-paper" style="margin: -4px 0 8px 0;">What facts, observations, or past events would support this thought if you were the prosecutor? Be honest — strawmanning the thought is the failure mode here.</p>
        <textarea class="textarea" data-field="evidenceFor" rows="3" placeholder="Facts that would back this thought up — only count things you'd be willing to say out loud.">${esc(d.evidenceFor)}</textarea>
      </div>
      <div class="field-group">
        <label class="field-label-paper">Evidence AGAINST the thought</label>
        <p class="field-help-paper" style="margin: -4px 0 8px 0;">What facts or past experiences would push back? Often the strongest counter-evidence is "I've thought this before and was wrong" or "I'd never apply this label to a friend in the same spot."</p>
        <textarea class="textarea" data-field="evidenceAgainst" rows="3" placeholder="Facts that complicate the thought. Times the predicted bad thing didn't happen. What you'd tell a friend.">${esc(d.evidenceAgainst)}</textarea>
      </div>
      <!-- Whether a thought is accurate is settled by the evidence, not by how
           true it feels (distorted thoughts feel true too), so the choice
           offered on Step 3 comes back here, once both lists are written. -->
      <div class="field-group">
        <button class="accurate-tile ${d.thoughtsAccurate ? "active" : ""}" data-action="toggle-accurate">
          <div class="accurate-tile-name">
            <span>Having weighed it, the facts back this thought up</span>
            <span class="distortion-tile-check">${svgIcon("check")}</span>
          </div>
          <div class="accurate-tile-desc">Pick this if the evidence supports the thought; the next step then helps you hold what's true instead of arguing with it. If the facts hold but your conclusion goes further ("so I'm a terrible partner"), leave this off and reframe the conclusion.</div>
        </button>
      </div>

      <div class="explainer-card explainer-card--socratic">
        <div class="explainer-eyebrow">What a Socratic question is</div>
        <p class="explainer-body">Named after Socrates, who taught by asking questions. A <strong>Socratic question</strong> is one you don't already know the answer to. It points you at facts you might be missing, so you reach your own conclusion instead of being handed one. Ask it of yourself in good faith, then write down your honest answer.</p>
        <p class="explainer-body" style="margin-top: 8px;">Pick a question <em>type</em> below based on what the thought is doing (catastrophizing, mind-reading, etc.) — the template gives you a starting line you can customize.</p>
      </div>
      <div class="field-group">
        <label class="field-label-paper">
          Socratic question type
          ${(() => {
            const primary = (d.distortions || [])[0];
            const hasPick = ((d.distortions || []).length > 0);
            const sugg = primary ? DISTORTION_DEFAULTS[primary] : null;
            return (hasPick && sugg && d.socraticType === sugg.socratic)
              ? `<span class="suggested-pill" title="Auto-selected based on the distortion you picked">Suggested for ${esc(primary)}</span>`
              : "";
          })()}
        </label>
        <select class="select" data-field="socraticType">
          <option value="">— pick one —</option>
          ${SOCRATIC_TYPES.map(s => `<option value="${esc(s.type)}" ${d.socraticType === s.type ? "selected" : ""}>${esc(s.type)}</option>`).join("")}
        </select>
        ${d.socraticType ? `<div class="field-help-paper">${esc(SOCRATIC_TYPES.find(s => s.type === d.socraticType)?.when || "")}</div>` : ""}
      </div>
      <div class="field-group">
        <label class="field-label-paper">Your Socratic question</label>
        <textarea class="textarea" data-field="socraticQuestion" rows="3" placeholder="${esc((() => { const st = SOCRATIC_TYPES.find(s => s.type === d.socraticType); return (st && st.template) ? applyTemplate(st.template, d) : "Pick a type above and a starting question will fill in — then make it your own."; })())}">${esc(d.socraticQuestion)}</textarea>
        <p class="field-help-paper" style="margin-top: 8px;">Picking a type above pre-fills a starting question — feel free to rewrite it in your own words. The point is to <em>genuinely consider</em> the answer, so the wording has to be one you can take seriously.</p>
        <details class="ref-inline">
          <summary><span class="chev">▸</span> All question types</summary>
          <div class="ref-inline-body">
            ${SOCRATIC_TYPES.map(s => `
              <div class="block">
                <div class="block-title">${esc(s.type)}</div>
                <div class="block-when">When: ${esc(s.when)}</div>
                <div class="block-template">"${esc(s.template)}"</div>
              </div>
            `).join("")}
          </div>
        </details>
      </div>
      <div class="field-group">
        <label class="field-label-paper">Your answer</label>
        <textarea class="textarea" data-field="socraticAnswer" rows="3" placeholder="Answer it honestly, in your own words. Then ask: how does that fit with the thought I started with?">${esc(d.socraticAnswer)}</textarea>
      </div>
    `;
    }

    case 5: {
      const hot = hotThought(d);
      return `
      ${d.thoughtsAccurate ? `
        <div class="grounding-note" role="note">
          <div class="grounding-note-eyebrow">You marked these thoughts as accurate</div>
          <div class="grounding-note-body">
            <p>A "new thought" may not fit here, and you don't have to write one. What sometimes helps instead is a kinder way to <em>hold</em> what's true — an acknowledgment that doesn't argue with the facts but doesn't add cruelty either.</p>
            <p>Skip what doesn't apply. The pivot in Step 6 is often where the work lands when the thought itself isn't the problem.</p>
          </div>
        </div>
      ` : (hot && hot.text ? `
        <div class="hot-thought-card" aria-label="Hot thought you're reframing">
          <span class="hot-thought-eyebrow">${svgIcon("flame", "ico--inline")} Reframing the hot thought</span>
          <p class="hot-thought-quote display italic">"${esc(hot.text)}"</p>
          ${typeof hot.beliefBefore === "number" ? `<span class="hot-thought-belief">Belief before: <strong>${hot.beliefBefore}%</strong></span>` : ""}
        </div>
      ` : "")}
      <div class="field-group">
        <label class="field-label-paper">
          ${d.thoughtsAccurate ? "Method (optional)" : "Method"}
          ${(() => {
            const primary = (d.distortions || [])[0];
            const hasPick = ((d.distortions || []).length > 0);
            const sugg = primary ? DISTORTION_DEFAULTS[primary] : null;
            return (hasPick && sugg && d.reframeMethod === sugg.reframe)
              ? `<span class="suggested-pill" title="Auto-selected based on the distortion you picked">Suggested for ${esc(primary)}</span>`
              : "";
          })()}
        </label>
        <select class="select" data-field="reframeMethod">
          <option value="">— pick one —</option>
          ${REFRAME_METHODS.map(r => `<option value="${esc(r.method)}" ${d.reframeMethod === r.method ? "selected" : ""}>${esc(r.method)}</option>`).join("")}
        </select>
        ${d.reframeMethod ? `<div class="field-help-paper">${esc(REFRAME_METHODS.find(r => r.method === d.reframeMethod)?.does || "")}</div>` : ""}
      </div>
      <div class="field-group reframe-new-thought">
        <label class="field-label-paper">${d.thoughtsAccurate ? "Acknowledgment, or skip" : "Your new thought — write the reframe here"}</label>
        <textarea class="textarea input-large" data-field="newThought" rows="4" placeholder="${esc(d.thoughtsAccurate ? "This is real and it's hard. Naming it is enough work for now." : (() => { const rm = REFRAME_METHODS.find(r => r.method === d.reframeMethod); return (rm && rm.template) ? applyTemplate(rm.template, d) : "Write a more balanced, reasonable thought you'd actually accept, in your own words. (Pick a method above to see an example of the shape.)"; })())}">${esc(d.newThought)}</textarea>
        <div class="field-help-paper">${d.thoughtsAccurate ? "Optional. If something kinder fits without contradicting the truth, write it. If not, leave it blank — that's a valid record too." : `Would you actually nod and say "yeah, that's fair," or would you roll your eyes? Tune until it lands. Often the facts are true and the conclusion is the distortion ("I snapped at them" is true; "so I'm a terrible partner" isn't): keep the true part and rewrite the conclusion.`}</div>
        <details class="ref-inline">
          <summary><span class="chev">▸</span> All reframe methods</summary>
          <div class="ref-inline-body">
            ${REFRAME_METHODS.map(r => `
              <div class="block">
                <div class="block-title">${esc(r.method)}</div>
                <div class="block-when">When: ${esc(r.when)} · ${esc(r.does)}</div>
                <div class="block-template">Starter: "${esc(applyTemplate(r.template, d))}"</div>
              </div>
            `).join("")}
          </div>
        </details>
        ${reframeExamplesHTML(d)}
      </div>

      <div class="field-group rerate-group">
        <div class="rerate-head">
          <span class="rerate-eyebrow">Re-rate</span>
          <h3 class="rerate-title display">After writing that, where are you now?</h3>
          <p class="rerate-sub">Rate honestly. Small shifts are still real shifts; no shift is information too. The numbers are awareness, not a grade.</p>
        </div>

        ${hot ? `
          <label class="field-label-paper">Belief in the hot thought, now</label>
          <div class="belief-control">
            <div class="belief-head">
              <span class="belief-num display"><span data-slider-display="hotBeliefAfter">${hot.beliefAfter ?? (hot.beliefBefore ?? 50)}</span><span class="belief-num-suffix">%</span></span>
              ${typeof hot.beliefBefore === "number" ? `
                <span class="belief-hint">Before: <strong>${hot.beliefBefore}%</strong>${typeof hot.beliefAfter === "number" ? ` · Δ <strong class="${(hot.beliefAfter - hot.beliefBefore) < 0 ? "delta-good" : "delta-flat"}">${hot.beliefAfter - hot.beliefBefore > 0 ? "+" : ""}${hot.beliefAfter - hot.beliefBefore}</strong>` : ""}</span>
              ` : `<span class="belief-hint">No baseline set in Step 2 — that's fine, just rate now.</span>`}
            </div>
            <input type="range" min="0" max="100" value="${hot.beliefAfter ?? (hot.beliefBefore ?? 50)}" data-action="edit-hot-belief-after" class="intensity-slider" aria-label="Belief in the hot thought now, 0 to 100 percent">
          </div>
        ` : ""}

        ${(d.reframeMethod || "").trim() || (d.newThought || "").trim() || typeof d.newThoughtBelief === "number" ? `
          <label class="field-label-paper" style="margin-top: 18px;">Belief in the new thought</label>
          <div class="belief-control">
            <div class="belief-head">
              <span class="belief-num display"><span data-slider-display="newThoughtBelief">${d.newThoughtBelief ?? 50}</span><span class="belief-num-suffix">%</span></span>
              <span class="belief-hint">Thought records often ask for both: how much you still believe the hot thought, and how much you believe the new one. A weak "yeah, kind of" is honest data.</span>
            </div>
            <input type="range" min="0" max="100" value="${d.newThoughtBelief ?? 50}" data-field="newThoughtBelief" class="intensity-slider" aria-label="Belief in the new thought, 0 to 100 percent">
          </div>
        ` : ""}

        ${(d.moods || []).filter(m => m.family).map(m => {
          const label = m.variant ? cap(m.variant) : (m.family || "Mood");
          const cur = m.intensityAfterReframe ?? m.intensity;
          const delta = m.intensityAfterReframe !== null && m.intensityAfterReframe !== undefined ? (m.intensityAfterReframe - m.intensity) : null;
          return `
            <label class="field-label-paper" style="margin-top: 18px;">${esc(label)}, now</label>
            <div class="belief-control">
              <div class="belief-head">
                <span class="belief-num display"><span data-slider-display="mood-after-${esc(m.id)}">${cur}</span><span class="belief-num-suffix">/100</span></span>
                <span class="belief-hint"><span data-slider-band-name="mood-after-${esc(m.id)}">${esc(band(cur).label)}</span> · before: <strong>${m.intensity}</strong>${delta !== null ? ` · Δ <strong class="${delta < 0 ? "delta-good" : "delta-flat"}">${delta > 0 ? "+" : ""}${delta}</strong>` : ""}</span>
              </div>
              <input type="range" min="0" max="100" value="${cur}" data-action="edit-mood-after-reframe" data-id="${esc(m.id)}" class="intensity-slider intensity-slider--emotion" aria-label="${esc(label)} intensity now, 0 to 100">
              <div class="intensity-bands">
                <span>Mild</span><span>Mod</span><span>Strong</span><span>High</span><span>Severe</span>
              </div>
            </div>
          `;
        }).join("")}

        <label class="field-label-paper" style="margin-top: 18px;">Anything new showing up?</label>
        <textarea class="textarea" data-field="newFeelings" rows="2" placeholder="Relief, calm, hope, sadness underneath the anger… a word or two, optional.">${esc(d.newFeelings)}</textarea>
      </div>
    `;
    }

    case 6: return `
      <div class="field-group">
        <textarea class="textarea input-large" data-field="pivot" rows="4" placeholder='Send one honest sentence: "Hey, thinking of you — no pressure to reply, just wanted to check in."'>${esc(d.pivot)}</textarea>
        <div class="field-help-paper">A single concrete action you can do today. The smaller and more specific, the better.</div>
        <div class="quick-prompts" role="group" aria-label="Starter pivot ideas">
          <span class="quick-prompts-label">Starter ideas:</span>
          ${PIVOT_STARTER_CHIPS.map(p => `
            <button type="button" class="quick-prompt-chip" data-action="insert-capture-starter" data-insert-field="pivot" data-seed="${esc(p.seed)}">${esc(p.label)}</button>
          `).join("")}
        </div>
      </div>
      <div class="field-group">
        <label class="field-label-paper">What do you expect will happen? (optional)</label>
        <textarea class="textarea" data-field="pivotPrediction" rows="2" placeholder="They'll ignore it. / It'll feel awkward but fine. / I won't be able to finish.">${esc(d.pivotPrediction)}</textarea>
        <div class="field-help-paper">Writing the prediction down before you act turns the action into a small experiment: afterward you can check what actually happened against it.</div>
      </div>
    `;

    case 7: return renderReview(d);
  }
  return "";
}

function renderReview(d) {
  const thoughts = d.thoughts || [];
  const moods = d.moods || [];
  const hot = hotThought(d);
  return `
    <div class="review-card">
      <div class="review-card-head">
        <span class="review-card-num">1 · Trigger</span>
        <button class="review-edit-btn" data-action="goto-step" data-step="1">Edit</button>
      </div>
      <div class="review-card-content">${d.trigger ? esc(d.trigger) : '<span class="empty">missing</span>'}</div>
    </div>

    <div class="review-card">
      <div class="review-card-head">
        <span class="review-card-num">2 · Initial Reaction</span>
        <button class="review-edit-btn" data-action="goto-step" data-step="2">Edit</button>
      </div>
      ${thoughts.length ? `
        <div class="review-meta-row">
          ${thoughts.map(t => `
            <div class="review-meta-item">
              ${t.isHot ? `<span class="thought-hot-tag">${svgIcon("flame")}</span> ` : ""}
              <span class="italic">"${esc(t.text) || "(empty)"}"</span>
              ${typeof t.beliefBefore === "number" ? `<span class="muted"> — belief ${t.beliefBefore}%</span>` : ""}
            </div>
          `).join("")}
        </div>
      ` : '<div class="review-card-content"><span class="empty">no thoughts captured</span></div>'}
      ${moods.filter(m => m.family).length ? `
        <div class="review-meta-row" style="margin-top: 8px;">
          ${moods.filter(m => m.family).map(m => {
            const label = m.variant ? (cap(m.variant) + " · " + m.family) : m.family;
            return `<div class="review-meta-item"><strong>${esc(label)}</strong> · ${m.intensity}/100${m.estimated ? " (est.)" : ""}</div>`;
          }).join("")}
        </div>
      ` : ""}
      ${d.bodyCheck ? `<div class="review-meta-row" style="margin-top: 8px;"><div class="review-meta-item">Body: ${esc(d.bodyCheck)}${d.bodyInferred ? " (pieced together later)" : ""}</div></div>` : ""}
    </div>

    <div class="review-card">
      <div class="review-card-head">
        <span class="review-card-num">3 · Distortion</span>
        <button class="review-edit-btn" data-action="goto-step" data-step="3">Edit</button>
      </div>
      <div class="review-card-content">
        ${d.thoughtsAccurate
          ? '<span class="accurate-detail">Marked as accurate, not distorted.</span>'
          : ((d.distortions || []).length ? (d.distortions || []).map(x => `<strong>${esc(x)}</strong>`).join(" + ") : '<span class="empty">none selected</span>')}
        ${!d.thoughtsAccurate && d.distortionNote ? `<div style="margin-top: 6px; font-size: 13px; color: var(--on-paper-mute);">${esc(d.distortionNote)}</div>` : ""}
      </div>
    </div>

    <div class="review-card">
      <div class="review-card-head">
        <span class="review-card-num">4 · Challenge${draftedSocraticMatchesBuiltInTemplate(d) && d.socraticQuestion ? ` <span class="suggested-pill" title="Still matches the template for this question type — edit if you like">Starter text</span>` : ""}</span>
        <button class="review-edit-btn" data-action="goto-step" data-step="4">Edit</button>
      </div>
      <div class="review-card-content">
        ${hot && hot.text ? `<div class="review-meta-item" style="margin-bottom: 6px;"><span class="muted italic">Putting on trial:</span> "${esc(hot.text)}"</div>` : ""}
        <div class="review-meta-item"><strong>For:</strong> ${d.evidenceFor ? esc(d.evidenceFor) : '<span class="empty">—</span>'}</div>
        <div class="review-meta-item" style="margin-top: 4px;"><strong>Against:</strong> ${d.evidenceAgainst ? esc(d.evidenceAgainst) : '<span class="empty">—</span>'}</div>
        ${d.socraticQuestion ? `<div class="italic" style="margin-top: 8px; color: var(--on-paper-soft);">"${esc(d.socraticQuestion)}"</div>` : ""}
        ${d.socraticAnswer ? `<div class="review-meta-item" style="margin-top: 4px;"><strong>Answer:</strong> ${esc(d.socraticAnswer)}</div>` : ""}
      </div>
    </div>

    <div class="review-card">
      <div class="review-card-head">
        <span class="review-card-num">5 · Reframe${d.reframeMethod ? " · " + esc(d.reframeMethod) : ""}${draftedNewThoughtMatchesBuiltInTemplate(d) ? ` <span class="suggested-pill" title="Still matches the template for this method — edit if you like">Starter text</span>` : ""}</span>
        <button class="review-edit-btn" data-action="goto-step" data-step="5">Edit</button>
      </div>
      <div class="review-card-content italic">"${d.newThought ? esc(d.newThought) : '<span class="empty">missing</span>'}"</div>
      ${(() => {
        // Hot-thought belief delta + per-mood after-reframe deltas.
        const hasHotB = hot && typeof hot.beliefAfter === "number" && typeof hot.beliefBefore === "number";
        const bD = hasHotB ? (hot.beliefAfter - hot.beliefBefore) : null;
        const hasNewB = typeof d.newThoughtBelief === "number";
        const ratedMoods = moods.filter(m => typeof m.intensityAfterReframe === "number");
        if (!hasHotB && !hasNewB && ratedMoods.length === 0 && !d.newFeelings) return "";
        return `
          <div class="review-rerate">
            ${hasHotB ? `<div class="review-meta-item"><strong>Belief in hot thought:</strong> ${hot.beliefBefore}% ${svgIcon("arrowRight", "ico--xs")} ${hot.beliefAfter}% <span class="delta-tag ${bD < 0 ? "good" : "flat"}">${bD > 0 ? "+" : ""}${bD}</span></div>` : ""}
            ${hasNewB ? `<div class="review-meta-item" style="margin-top: 4px;"><strong>Belief in new thought:</strong> ${d.newThoughtBelief}%</div>` : ""}
            ${d.newFeelings ? `<div class="review-meta-item" style="margin-top: 4px;"><strong>New feelings:</strong> ${esc(d.newFeelings)}</div>` : ""}
            ${ratedMoods.map(m => {
              const label = m.variant ? cap(m.variant) : (m.family || "Mood");
              const delta = m.intensityAfterReframe - m.intensity;
              return `<div class="review-meta-item" style="margin-top: 4px;"><strong>${esc(label)}:</strong> ${m.intensity} ${svgIcon("arrowRight", "ico--xs")} ${m.intensityAfterReframe} <span class="delta-tag ${delta < 0 ? "good" : "flat"}">${delta > 0 ? "+" : ""}${delta}</span></div>`;
            }).join("")}
          </div>
        `;
      })()}
    </div>

    <div class="review-card">
      <div class="review-card-head">
        <span class="review-card-num">6 · The Pivot</span>
        <button class="review-edit-btn" data-action="goto-step" data-step="6">Edit</button>
      </div>
      <div class="review-card-content">${d.pivot ? esc(d.pivot) : '<span class="empty">missing</span>'}</div>
      ${d.pivotPrediction ? `<div class="review-meta-item" style="margin-top: 6px;"><strong>Expected:</strong> ${esc(d.pivotPrediction)}</div>` : ""}
    </div>
  `;
}

// Step 8 — Outcome screen. Reached by tapping the "Re-rate moods after
// acting" CTA on an entry whose pivot has been marked done. Lives outside
// the 1-7 capture flow because it's a return visit: the user has done
// the pivot in the real world and is now logging what happened. Reads/
// writes the entry directly (not state.draft); state.outcomeEntryId says
// which one. Once recorded, the entry's outcomeRecorded flag flips and
// the CTA disappears from the entry card.
function renderOutcomeView() {
  const entry = state.entries.find(e => e.id === state.outcomeEntryId);
  if (!entry) {
    return `
      <div class="page-header">
        <div class="page-eyebrow">Outcome</div>
        <h1 class="page-title display">Entry not found</h1>
        <p class="page-sub">It may have been deleted. <button class="link-button" data-action="back-to-journal">Return to the journal</button>.</p>
      </div>
    `;
  }
  const hot = hotThought(entry);
  const moods = entry.moods || [];

  return `
    <div class="page-header">
      <div class="page-eyebrow">Step 8 · Outcome</div>
      <h1 class="page-title display">How did the pivot go?</h1>
      <p class="page-sub">A return visit. Log what actually happened, so the next time this pattern shows up you have your own record to check against. Skip what doesn't apply.</p>
    </div>

    <div class="capture-shell">
      <div class="capture-screen">
        <div class="outcome-context">
          <div class="outcome-context-row">
            <span class="outcome-context-label">Trigger</span>
            <p class="outcome-context-text">${esc(entry.trigger) || "—"}</p>
          </div>
          ${hot && hot.text ? `
            <div class="outcome-context-row">
              <span class="outcome-context-label">Hot thought</span>
              <p class="outcome-context-text italic">"${esc(hot.text)}"</p>
            </div>
          ` : ""}
          ${entry.newThought ? `
            <div class="outcome-context-row">
              <span class="outcome-context-label">Reframe</span>
              <p class="outcome-context-text italic">"${esc(entry.newThought)}"</p>
            </div>
          ` : ""}
          <div class="outcome-context-row">
            <span class="outcome-context-label">Pivot</span>
            <p class="outcome-context-text">${esc(entry.pivot) || "—"}</p>
          </div>
          ${entry.pivotPrediction ? `
            <div class="outcome-context-row">
              <span class="outcome-context-label">Expected</span>
              <p class="outcome-context-text">${esc(entry.pivotPrediction)}</p>
            </div>
          ` : ""}
        </div>

        <div class="field-group">
          <label class="field-label-paper">What happened?</label>
          <textarea class="textarea" id="outcomeReflection" rows="4" placeholder="${entry.pivotPrediction ? "How did it compare with what you expected? That gap is what teaches you next time." : "A line on how it went. The dread vs. the actual outcome is the part to write down; that's what teaches you next time."}">${esc(entry.pivotReflection)}</textarea>
        </div>

        ${moods.filter(m => m.family).length ? `
          <div class="field-group rerate-group">
            <div class="rerate-head">
              <span class="rerate-eyebrow">After acting</span>
              <h3 class="rerate-title display">Where are the moods now?</h3>
              <p class="rerate-sub">Re-rate each mood now that you've done the pivot. Compare it with how you felt before: any change, or none, is useful information.</p>
            </div>

            ${moods.filter(m => m.family).map(m => {
              const label = m.variant ? cap(m.variant) : (m.family || "Mood");
              const cur = m.intensityAfterPivot ?? m.intensityAfterReframe ?? m.intensity;
              return `
                <label class="field-label-paper" style="margin-top: 14px;">${esc(label)}, after the pivot</label>
                <div class="belief-control">
                  <div class="belief-head">
                    <span class="belief-num display"><span data-slider-display="outcome-${esc(m.id)}">${cur}</span><span class="belief-num-suffix">/100</span></span>
                    <span class="belief-hint"><span data-slider-band-name="outcome-${esc(m.id)}">${esc(band(cur).label)}</span> · start: <strong>${m.intensity}</strong>${typeof m.intensityAfterReframe === "number" ? ` · after reframe: <strong>${m.intensityAfterReframe}</strong>` : ""}</span>
                  </div>
                  <input type="range" min="0" max="100" value="${cur}" data-action="edit-mood-after-pivot" data-id="${esc(m.id)}" class="intensity-slider intensity-slider--emotion" aria-label="${esc(label)} intensity after the pivot, 0 to 100">
                  <div class="intensity-bands">
                    <span>Mild</span><span>Mod</span><span>Strong</span><span>High</span><span>Severe</span>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        ` : `
          <div class="grounding-note" role="note">
            <div class="grounding-note-body">
              <p>No moods were captured in this entry's Step 2, so there's nothing to re-rate here. You can still log a reflection above.</p>
            </div>
          </div>
        `}
      </div>

      <div class="capture-footer">
        <div class="capture-footer-left">
          <button class="btn-back" data-action="back-to-journal">${svgIcon("arrowLeft", "ico--btn")} Back</button>
        </div>
        <button class="btn btn-primary" data-action="save-outcome">Save outcome</button>
      </div>
    </div>
  `;
}

function bindOutcome() {
  // Re-resolve the entry by id at event time rather than closing over the
  // object bound at render: a P2P merge that carries a newer copy of this
  // entry replaces the object in state.entries, and edits made on the old
  // reference would then never reach persist().
  const getEntry = () => state.entries.find(e => e.id === state.outcomeEntryId);
  if (!getEntry()) {
    document.querySelectorAll('[data-action="back-to-journal"]').forEach(el =>
      el.addEventListener("click", () => { state.outcomeEntryId = null; setView("journal"); }));
    return;
  }

  // Trailing-edge debounce for persist() — slider drag fires ~30 "input"
  // events per second and each persist() serializes the full entries
  // array to localStorage. Without this, a one-second drag wrote 30 KB+
  // 30 times, which stutters on slow Android.
  let _outcomePersistTimer = null;
  const _schedulePersist = () => {
    clearTimeout(_outcomePersistTimer);
    _outcomePersistTimer = setTimeout(() => persist(), 300);
  };
  document.querySelectorAll('[data-action="edit-mood-after-pivot"]').forEach(el => {
    el.addEventListener("input", () => {
      const entry = getEntry();
      if (!entry) return;
      const m = (entry.moods || []).find(x => x.id === el.dataset.id);
      if (!m) return;
      m.intensityAfterPivot = parseInt(el.value, 10);
      const target = document.querySelector('[data-slider-display="outcome-' + el.dataset.id + '"]');
      if (target) target.textContent = el.value;
      const bandTarget = document.querySelector('[data-slider-band-name="outcome-' + el.dataset.id + '"]');
      if (bandTarget) bandTarget.textContent = band(parseInt(el.value, 10)).label;
      // In-memory mutation is immediate; persist on the trailing edge so
      // backing out (or a tab close) still preserves the re-rate.
      touchEntry(entry);
      _schedulePersist();
    });
  });

  // Persist reflection text as it's typed (debounced). The save/back click
  // handlers below also read it, but they never fire when the user leaves
  // via the bottom nav or Lock now — without this, a typed paragraph
  // vanished on any exit that wasn't one of those two buttons.
  const reflectionEl = document.getElementById("outcomeReflection");
  if (reflectionEl) reflectionEl.addEventListener("input", () => {
    const entry = getEntry();
    if (!entry) return;
    entry.pivotReflection = reflectionEl.value;
    touchEntry(entry);
    _schedulePersist();
  });

  const save = document.querySelector('[data-action="save-outcome"]');
  if (save) save.addEventListener("click", () => {
    const entry = getEntry();
    if (!entry) { state.outcomeEntryId = null; setView("journal"); return; }
    const ref = document.getElementById("outcomeReflection");
    if (ref) entry.pivotReflection = ref.value;
    entry.outcomeRecorded = true;
    touchEntry(entry);
    clearTimeout(_outcomePersistTimer);
    if (!persist()) return;
    state.outcomeEntryId = null;
    state.expandedIds.add(entry.id);
    setView("journal");
    toast("Outcome saved. The loop is closed.");
  });

  const back = document.querySelector('[data-action="back-to-journal"]');
  if (back) back.addEventListener("click", () => {
    // Flush any pending slider debounce, then save reflection text if the
    // user typed anything — both keep accidental data loss off the table.
    clearTimeout(_outcomePersistTimer);
    const entry = getEntry();
    if (!entry) { state.outcomeEntryId = null; setView("journal"); return; }
    const ref = document.getElementById("outcomeReflection");
    if (ref && ref.value !== entry.pivotReflection) {
      entry.pivotReflection = ref.value;
      touchEntry(entry);
    }
    persist();
    state.outcomeEntryId = null;
    setView("journal");
  });
}

function renderPatterns() {
  const entries = state.entries;
  // Thought-record aggregations (distortions, belief deltas, mood drops,
  // pivot follow-through) only make sense for kind:"thought-record" entries.
  // Free-form/activity/worry have empty/undefined fields for those stats,
  // so including them silently inflates denominators.
  const quickThoughtSkips = entries.filter(e => e.kind === "thought-record" && (e.isQuick || e.isVent)).length;
  const thoughtRecords = entries.filter(e => e.kind === "thought-record" && !e.isQuick && !e.isVent);
  // 30-day heatmap + intensity sparkline: omit quick/vent captures so the visual
  // matches structured thought-record stats; other kinds still count as "showed up."
  const patternVizEntries = entries.filter(e => !(e.kind === "thought-record" && (e.isQuick || e.isVent)));
  if (entries.length === 0) {
    return `
      <div class="page-header">
        <div class="page-eyebrow">Insight</div>
        <h1 class="page-title display">Patterns</h1>
      </div>
      <div class="empty-state">
        <div class="empty-state-mark empty-state-mark--alt" aria-hidden="true">∿</div>
        <h2 class="empty-state-title display">Patterns emerge with use.</h2>
        <p class="empty-state-body">Once you've logged a few entries, this view will show you the distortions, emotions, and intensities that recur for you.</p>
      </div>
    `;
  }

  const total = thoughtRecords.length;
  // A record saved without a pivot (step 6 is optional) can never be
  // "followed through"; counting it in the denominator under-reported the
  // ring for everyone who skips the step sometimes.
  const withPivot = thoughtRecords.filter(e => (e.pivot || "").trim());
  const pivotsDone = withPivot.filter(e => e.pivotDone).length;
  const pivotTotal = withPivot.length;
  const pivotPct = pivotTotal > 0 ? Math.round((pivotsDone / pivotTotal) * 100) : 0;

  // Headline: average mood-intensity drop *per mood* across re-rated moods.
  // Multi-mood entries contribute multiple data points — each mood's drop
  // counts independently. After-reframe and after-pivot are both eligible;
  // we use the latest available stage so post-pivot drops show up too.
  function moodDeltaSamples(stage) {
    const out = [];
    thoughtRecords.forEach(e => (e.moods || []).forEach(m => {
      // Only named moods are shown on cards and get re-rate sliders, so count
      // only those — an unnamed placeholder mood must not inflate "N re-rated".
      if (!m.family) return;
      const after = stage === "pivot" ? m.intensityAfterPivot : m.intensityAfterReframe;
      if (typeof after === "number" && typeof m.intensity === "number") {
        out.push(m.intensity - after);
      }
    }));
    return out;
  }
  const reframeDrops = moodDeltaSamples("reframe");
  const pivotDrops   = moodDeltaSamples("pivot");
  const avgIntensityDrop = reframeDrops.length
    ? Math.round(reframeDrops.reduce((a, b) => a + b, 0) / reframeDrops.length)
    : null;
  const avgPivotDrop = pivotDrops.length
    ? Math.round(pivotDrops.reduce((a, b) => a + b, 0) / pivotDrops.length)
    : null;

  // Belief drop on hot thoughts.
  const beliefDrops = [];
  thoughtRecords.forEach(e => {
    const h = hotThought(e);
    if (h && typeof h.beliefBefore === "number" && typeof h.beliefAfter === "number") {
      beliefDrops.push(h.beliefBefore - h.beliefAfter);
    }
  });
  const avgBeliefDrop = beliefDrops.length
    ? Math.round(beliefDrops.reduce((a, b) => a + b, 0) / beliefDrops.length)
    : null;
  // Aliases so the render-card template reads naturally — "rerated entries"
  // matches the sample arrays one-for-one. Naming this twice avoids the
  // late-discovered ReferenceError that crashed the Patterns view once any
  // user had re-rated even one mood.
  const rerated       = reframeDrops;
  const beliefRerated = beliefDrops;

  // ── Activity P/M aggregation ──────────────────────────────────────
  // For completed activity entries, group by category and compute the
  // mean of (actualP + actualM) / 2. Surfaces the category that's
  // consistently lifting the mood most, with a sample-count gate so a
  // one-off doesn't dominate.
  const completedActivities = entries.filter(e =>
    e.kind === "activity" && e.completedAt &&
    typeof e.actualP === "number" && typeof e.actualM === "number"
  );
  // Null-prototype map: `category` is a free string from imports/synced peers
  // (not whitelisted), so a value of "__proto__" against a plain object would
  // make the `!activityByCat[key]` guard read Object.prototype and the `+=`
  // land on the prototype, polluting every object for the page session.
  const activityByCat = Object.create(null);
  completedActivities.forEach(e => {
    const key = e.category || "other";
    if (!activityByCat[key]) activityByCat[key] = { sum: 0, n: 0 };
    activityByCat[key].sum += (e.actualP + e.actualM) / 2;
    activityByCat[key].n += 1;
  });
  const activityCatRanked = Object.entries(activityByCat)
    .map(([cat, v]) => ({ cat, mean: v.sum / v.n, n: v.n }))
    .sort((a, b) => b.mean - a.mean);

  // ── Worry dissolution rate (last 30 days) ─────────────────────────
  // The headline therapeutic number: of all worries that have reached
  // *any* resolution in the last 30 days, what fraction dissolved on
  // their own? Filtering to resolved worries (not all parked) avoids
  // skewing the % with worries that are still in the window.
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const resolvedWorries = entries.filter(e =>
    e.kind === "worry" && e.resolution &&
    e.resolvedAt && new Date(e.resolvedAt).getTime() >= thirtyDaysAgo
  );
  const dissolvedCount = resolvedWorries.filter(e => e.resolution === "dissolved").length;
  const dissolvedPct = resolvedWorries.length >= 3
    ? Math.round((dissolvedCount / resolvedWorries.length) * 100)
    : null;

  const distCounts = {};
  thoughtRecords.forEach(e => (e.distortions || []).forEach(d => distCounts[d] = (distCounts[d] || 0) + 1));
  const sortedDist = Object.entries(distCounts).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const maxDist = sortedDist[0]?.[1] || 1;

  // Emotion families: count occurrences across all moods on all thought
  // records (so a single entry with both Anxiety + Shame contributes one
  // to each).
  const emoCounts = {};
  Object.keys(EMOTION_FAMILIES).forEach(f => emoCounts[f] = 0);
  thoughtRecords.forEach(e => (e.moods || []).forEach(m => {
    if (m.family) emoCounts[m.family] = (emoCounts[m.family] || 0) + 1;
  }));
  const maxEmo = Math.max(...Object.values(emoCounts), 1);

  const today = startOfDay(new Date());
  const dayCounts = new Array(30).fill(0);
  patternVizEntries.forEach(e => {
    const dayIdx = 29 - daysBetween(today, new Date(e.createdAt));
    if (dayIdx >= 0 && dayIdx < 30) dayCounts[dayIdx]++;
  });
  const last30Total = dayCounts.reduce((a, b) => a + b, 0);
  const activeDays = dayCounts.filter(c => c > 0).length;

  // Sparkline plots peak initial mood intensity per entry (the loudest mood
  // in the moment, since multi-mood entries don't fit on a single Y-axis).
  // Skip entries with no moods — activity/worry/freeform entries that don't
  // carry a mood would otherwise plot at peak=0 and tank the line.
  // Skip the untouched placeholder row every thought record carries from
  // emptyEntry() (no family, not estimated, slider left at the default 40):
  // plotting it drew a flat line at 40 for records whose author never tagged
  // a mood. A family-less mood the user actually rated — a finished quick
  // capture stores its intensity that way, flagged estimated — still counts.
  const isPlaceholderMood = m => !m.family && !m.estimated && m.intensity === 40;
  function peakIntensity(e) {
    return (e.moods || []).reduce((a, m) => Math.max(a, isPlaceholderMood(m) ? 0 : (m.intensity || 0)), 0);
  }
  const recent = patternVizEntries.filter(e => (e.moods || []).some(m => typeof m.intensity === "number" && !isPlaceholderMood(m))).slice(0, 20).reverse();
  const sparkW = 280, sparkH = 50, pad = 4;
  const sparkPath = recent.length > 1
    ? recent.map((e, i) => {
        const x = pad + (i / (recent.length - 1)) * (sparkW - 2 * pad);
        const y = pad + ((100 - peakIntensity(e)) / 100) * (sparkH - 2 * pad);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join(" ")
    : "";
  const sparkArea = recent.length > 1
    ? `${sparkPath} L ${pad + (sparkW - 2 * pad)} ${sparkH - pad} L ${pad} ${sparkH - pad} Z`
    : "";

  const R = 32, C = 2 * Math.PI * R;
  const offset = C - (pivotPct / 100) * C;

  const topDist = sortedDist[0]?.[0] || "—";

  return `
    <div class="page-header">
      <div class="page-eyebrow">Insight</div>
      <h1 class="page-title display">Patterns</h1>
      <p class="page-sub">A quiet read of what's recurring in your reframes.</p>
    </div>

    <div class="patterns-grid">

      <div class="pattern-card">
        <div class="pattern-card-head">
          <span class="pattern-card-title">Thought records</span>
        </div>
        <div class="pattern-stat-big display">${total}</div>
        <div class="pattern-stat-label">${total} full thought ${total === 1 ? "record" : "records"} (${entries.length} journal ${entries.length === 1 ? "entry" : "entries"} total${quickThoughtSkips ? "; " + quickThoughtSkips + " quick" : ""}). Heatmap & spark chart: ${activeDays} active ${activeDays === 1 ? "day" : "days"}, structured captures only.</div>
      </div>

      <div class="pattern-card">
        <div class="pattern-card-head">
          <span class="pattern-card-title">Pivots followed through</span>
        </div>
        <div class="pivot-ring-wrap">
          <div class="pivot-ring" style="width: 72px; height: 72px;">
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle class="pivot-ring-track" cx="36" cy="36" r="${R}" fill="none" stroke-width="5"/>
              <circle class="pivot-ring-fill" style="--ring-c: ${C.toFixed(2)}" cx="36" cy="36" r="${R}" fill="none" stroke-width="5"
                stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-linecap="round"/>
            </svg>
            <div class="pivot-ring-label">
              <div class="pivot-ring-pct display">${pivotsDone}<span class="small">/${pivotTotal}</span></div>
            </div>
          </div>
          <div class="pivot-ring-detail">
            ${pivotsDone === 0 ? "Untried isn't unkind" : "Each one is information"}<br><span class="muted">whether followed or not</span>
          </div>
        </div>
      </div>

      <div class="pattern-card span-2 pattern-card-rerate">
        <div class="pattern-card-head">
          <span class="pattern-card-title">Re-rating shift</span>
          <span class="pattern-card-meta">${rerated.length || 0} ${rerated.length === 1 ? "mood" : "moods"} re-rated across ${total} ${total === 1 ? "record" : "records"}</span>
        </div>
        ${avgIntensityDrop === null ? `
          <div class="pattern-stat-label">
            Re-rate your emotion intensity at Step 5 to see how much your reframes are actually shifting the dial. Right now nothing has been re-rated, so the headline number is just the work you haven't measured yet.
          </div>
        ` : `
          <div class="rerate-grid">
            <div class="rerate-stat">
              <div class="rerate-stat-num display ${avgIntensityDrop > 0 ? "good" : avgIntensityDrop < 0 ? "bad" : ""}">${avgIntensityDrop > 0 ? "−" : avgIntensityDrop < 0 ? "+" : ""}${Math.abs(avgIntensityDrop)}</div>
              <div class="rerate-stat-label">avg intensity drop<br><span class="rerate-stat-sub">across ${rerated.length} re-rated ${rerated.length === 1 ? "mood" : "moods"}</span></div>
            </div>
            ${avgBeliefDrop !== null ? `
              <div class="rerate-stat">
                <div class="rerate-stat-num display ${avgBeliefDrop > 0 ? "good" : avgBeliefDrop < 0 ? "bad" : ""}">${avgBeliefDrop > 0 ? "−" : avgBeliefDrop < 0 ? "+" : ""}${Math.abs(avgBeliefDrop)}<span class="rerate-stat-suffix">pts</span></div>
                <div class="rerate-stat-label">avg belief drop<br><span class="rerate-stat-sub">across ${beliefRerated.length} ${beliefRerated.length === 1 ? "record" : "records"}</span></div>
              </div>
            ` : ""}
            ${avgPivotDrop !== null ? `
              <div class="rerate-stat">
                <div class="rerate-stat-num display ${avgPivotDrop > 0 ? "good" : avgPivotDrop < 0 ? "bad" : ""}">${avgPivotDrop > 0 ? "−" : avgPivotDrop < 0 ? "+" : ""}${Math.abs(avgPivotDrop)}</div>
                <div class="rerate-stat-label">avg drop after pivot<br><span class="rerate-stat-sub">across ${pivotDrops.length} re-rated ${pivotDrops.length === 1 ? "mood" : "moods"}</span></div>
              </div>
            ` : ""}
          </div>
        `}
      </div>

      <div class="pattern-card span-2">
        <div class="pattern-card-head">
          <span class="pattern-card-title">Last 30 days</span>
          <span class="pattern-card-meta">${last30Total} ${last30Total === 1 ? "entry" : "entries"}${quickThoughtSkips ? " · quick captures excluded" : ""}</span>
        </div>
        <div class="activity-grid">
          ${dayCounts.map(c => {
            const cls = c === 0 ? "" : c === 1 ? "has" : "has-many";
            return `<div class="activity-dot ${cls}" title="${c} ${c === 1 ? "entry" : "entries"}"></div>`;
          }).join("")}
        </div>
        <div class="activity-legend">
          <span class="activity-legend-item"><span class="activity-dot"></span> Quiet</span>
          <span class="activity-legend-item"><span class="activity-dot has"></span> One entry</span>
          <span class="activity-legend-item"><span class="activity-dot has-many"></span> Multiple</span>
        </div>
      </div>

      ${activityCatRanked.length > 0 ? `
        <div class="pattern-card span-2">
          <div class="pattern-card-head">
            <span class="pattern-card-title">Highest-rated activity types</span>
            <span class="pattern-card-meta">${completedActivities.length} ${completedActivities.length === 1 ? "activity" : "activities"} logged</span>
          </div>
          <div class="bar-list">
            ${activityCatRanked.map(({ cat, mean, n }) => {
              const meta = ACTIVITY_CATEGORIES.find(c => c.value === cat) || { label: cap(cat) };
              const pct = (mean / 10) * 100;
              return `
                <div class="bar-row">
                  <div class="bar-row-label">${catIcon(cat, "ico--bar")} ${esc(meta.label)} <span class="bar-row-sub">· ${n}</span></div>
                  <div class="bar-track"><div class="bar-fill" style="width: ${pct.toFixed(1)}%"></div></div>
                  <div class="bar-row-value">${mean.toFixed(1)}</div>
                </div>
              `;
            }).join("")}
          </div>
          <p class="pattern-card-foot">Average of your pleasure and mastery ratings (0 to 10) per type; the small number is how many you've logged. Early numbers are rough, and mood can lag behind action, so keep doing things that matter to you even if they don't score high yet.</p>
        </div>
      ` : ""}

      ${dissolvedPct !== null ? `
        <div class="pattern-card">
          <div class="pattern-card-head">
            <span class="pattern-card-title">Worries that dissolved</span>
            <span class="pattern-card-meta">last 30 days · ${resolvedWorries.length} resolved</span>
          </div>
          <div class="pattern-stat-big display">${dissolvedPct}<span class="pattern-stat-pct">%</span></div>
          <div class="pattern-stat-label">${dissolvedPct > 50 ? "went away on their own. More than half didn't need extra work." : "went away on their own, without extra work."}</div>
        </div>
      ` : ""}

      <div class="pattern-card span-2">
        <div class="pattern-card-head">
          <span class="pattern-card-title">Most common distortions</span>
          <span class="pattern-card-meta">${esc(topDist)} leads</span>
        </div>
        <div class="bar-list">
          ${sortedDist.length === 0 ? `<div class="pattern-stat-label">No distortions logged yet.</div>` :
            sortedDist.map(([name, count]) => `
              <div class="bar-row">
                <div class="bar-row-label">${esc(name)}</div>
                <div class="bar-track"><div class="bar-fill" style="width: ${(count / maxDist) * 100}%"></div></div>
                <div class="bar-row-value">${count}</div>
              </div>
            `).join("")
          }
        </div>
      </div>

      <div class="pattern-card span-2">
        <div class="pattern-card-head">
          <span class="pattern-card-title">Emotion families</span>
          <span class="pattern-card-meta">${Object.values(emoCounts).reduce((a,b)=>a+b,0)} tagged</span>
        </div>
        <div class="emo-grid">
          ${Object.entries(emoCounts).map(([fam, count]) => `
            <div class="emo-tile" style="--intensity: ${count > 0 ? 0.06 + (count / maxEmo) * 0.18 : 0}">
              <div class="emo-tile-name">${esc(fam)}</div>
              <div class="emo-tile-count display">${count}</div>
            </div>
          `).join("")}
        </div>
      </div>

      ${recent.length > 1 ? `
        <div class="pattern-card span-2">
          <div class="pattern-card-head">
            <span class="pattern-card-title">Intensity, last ${recent.length} entries</span>
            <span class="pattern-card-meta">oldest ${svgIcon("arrowRight", "ico--xs")} newest · structured entries only</span>
          </div>
          <div class="spark-wrap">
            <svg viewBox="0 0 ${sparkW} ${sparkH}" width="100%" height="${sparkH}" preserveAspectRatio="none" style="display: block;">
              <defs>
                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--copper)" stop-opacity="0.3"/>
                  <stop offset="100%" stop-color="var(--copper)" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <path class="spark-area" d="${sparkArea}" fill="url(#sparkGrad)"/>
              <path class="spark-line" d="${sparkPath}" pathLength="1" fill="none" stroke="var(--copper)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              ${recent.map((e, i) => {
                const x = pad + (i / (recent.length - 1)) * (sparkW - 2 * pad);
                const y = pad + ((100 - peakIntensity(e)) / 100) * (sparkH - 2 * pad);
                return `<circle class="spark-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="var(--copper)"/>`;
              }).join("")}
            </svg>
            <div class="spark-axis-row">
              <span>0</span><span>50</span><span>100</span>
            </div>
          </div>
        </div>
      ` : ""}

    </div>
  `;
}

function renderReference() {
  return `
    <div class="page-header">
      <div class="page-eyebrow">In-app handbook</div>
      <h1 class="page-title display">Reference</h1>
      <p class="page-sub">The cognitive distortions, emotion families, and reframing methods that drive the 7-step capture flow (plus Step 8 outcome). Browseable anytime, not only while capturing.</p>
    </div>

    <div class="ref-section ref-section--scope">
      <div class="ref-section-head">
        <span class="ref-section-num">?</span>
        <h2 class="ref-section-title display">When a thought record is the right tool</h2>
        <span class="ref-section-step">Read first</span>
      </div>
      <p class="ref-section-intro">A thought record helps when there's a thought to record — a specific moment of distress where slowing down and looking at the thinking can shift something. It's not a universal solvent.</p>
      <div class="ref-item">
        <div class="ref-item-name">A thought record tends to help with</div>
        <div class="ref-item-desc">Ordinary anxiety, frustration, embarrassment, self-criticism, low mood that comes and goes, social worries, perfectionism, catastrophic thinking, post-event rumination. Anything where there's a thought you can name and examine. For worry and anxiety, testing the prediction with a small real-world experiment often helps more than weighing evidence on paper.</div>
      </div>
      <div class="ref-item">
        <div class="ref-item-name">A self-help journal isn't enough on its own for</div>
        <div class="ref-item-desc"><strong>Trauma memories that keep intruding</strong> (flashbacks, nightmares, feeling unreal). Trauma-focused CBT and EMDR work well, with a trained therapist. <strong>Severe depression</strong>, when even small tasks feel impossible. A clinician can help, often starting with small planned activities, sometimes with medication. <strong>Psychosis.</strong> A specialised form of CBT helps, alongside medication and a care team. <strong>Thoughts of suicide.</strong> Please reach for the resources below first. <strong>Grief.</strong> Painful thoughts after a loss usually aren't errors to fix, and the "facts seem to back these thoughts up" tile on Step 3 is for exactly this. If grief stays intense and gets in the way of life for many months, grief-focused therapy can help.</div>
      </div>
      <div class="ref-item">
        <div class="ref-item-name">If a thought turns out to be accurate</div>
        <div class="ref-item-desc">Not every painful thought is distorted. "I hurt them," "I'm out of my depth," "this relationship is over" — sometimes those are true. The work then is sitting with what's true, not arguing with it. Use the "The facts seem to back these thoughts up" tile on Step 3, weigh the evidence anyway, and let the rest of the entry hold what's real.</div>
      </div>
      <div class="ref-item">
        <div class="ref-item-name">Pace</div>
        <div class="ref-item-desc">One entry isn't a treatment. The benefit shows up across many entries, ideally with a clinician you trust. If the journal starts to feel like a task, scale down — quick capture or vent-only is a complete option.</div>
      </div>
    </div>

    <div class="ref-section ref-section--safety">
      <div class="ref-section-head">
        <span class="ref-section-num">!</span>
        <h2 class="ref-section-title display">If you're in crisis</h2>
        <span class="ref-section-step">Always</span>
      </div>
      <p class="ref-section-intro">A thought record is for ordinary distress — moments where you can still pause and write. If you can't, please reach out to one of these now. They're free, confidential, and answer 24/7.</p>
      <!-- Checked against each service's own site, Sep 2026. The US Lifeline
           and Canada's 9-8-8 share a number but are separate services, and
           each country's text line has its own operator and keyword. -->
      <div class="ref-item">
        <div class="ref-item-name">988 Suicide &amp; Crisis Lifeline · US</div>
        <div class="ref-item-desc">Call or text <strong>988</strong>. Online chat at <a href="https://chat.988lifeline.org" rel="noopener noreferrer" target="_blank"><strong>chat.988lifeline.org</strong></a>.</div>
      </div>
      <div class="ref-item">
        <div class="ref-item-name">9-8-8: Suicide Crisis Helpline · Canada</div>
        <div class="ref-item-desc">Call or text <strong>988</strong>, in English or French. <a href="https://988.ca" rel="noopener noreferrer" target="_blank"><strong>988.ca</strong></a></div>
      </div>
      <div class="ref-item">
        <div class="ref-item-name">Text lines</div>
        <div class="ref-item-desc">US: text <strong>HOME</strong> to <strong>741741</strong> (Crisis Text Line). UK: text <strong>SHOUT</strong> to <strong>85258</strong> (Shout). Ireland: text <strong>50808</strong> (Text About It). Canada, young people: text <strong>CONNECT</strong> to <strong>686868</strong> (Kids Help Phone).</div>
      </div>
      <div class="ref-item">
        <div class="ref-item-name">Samaritans · UK / Ireland</div>
        <div class="ref-item-desc">Call <strong>116 123</strong>. Free, day or night.</div>
      </div>
      <div class="ref-item">
        <div class="ref-item-name">Other countries</div>
        <div class="ref-item-desc"><a href="https://findahelpline.com" rel="noopener noreferrer" target="_blank"><strong>findahelpline.com</strong></a> lists free, confidential helplines by country.</div>
      </div>
      <div class="ref-item">
        <div class="ref-item-name">Emergency</div>
        <div class="ref-item-desc">If you or someone near you is in immediate danger, call your local emergency number: <strong>911</strong> (US, Canada), <strong>112</strong> (EU, Ireland), <strong>999</strong> (UK, Ireland).</div>
      </div>
      <p class="ref-section-intro" style="margin-top: 16px; font-style: italic;">Rephrame is a journaling tool, not a substitute for therapy or crisis care. If you have a clinician, exporting your journal as Markdown for a session is a good use of the data.</p>
    </div>

    <div class="ref-section">
      <div class="ref-section-head">
        <span class="ref-section-num">3</span>
        <h2 class="ref-section-title display">Cognitive Distortions</h2>
        <span class="ref-section-step">Step 3</span>
      </div>
      <p class="ref-section-intro">Patterns of thinking that warp interpretation. Naming the pattern first points you toward how to challenge and reframe it next — the suggested question type and reframe method follow from the distortion you pick.</p>
      ${DISTORTIONS.map(d => `
        <div class="ref-item">
          <div class="ref-item-name">${esc(d.name)}</div>
          <div class="ref-item-desc">${esc(d.desc)}</div>
          ${d.cues ? `<div class="ref-item-cues">Cues: ${esc(d.cues)}</div>` : ""}
        </div>
      `).join("")}
      <div class="ref-pairs">
        <div class="ref-pairs-head">Patterns that often overlap (examples)</div>
        <ul>${COMMON_PAIRS.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
      </div>
    </div>

    <div class="ref-section">
      <div class="ref-section-head">
        <span class="ref-section-num">2</span>
        <h2 class="ref-section-title display">Emotions</h2>
        <span class="ref-section-step">Step 2</span>
      </div>
      <p class="ref-section-intro">Eight families, with more precise variants. Use the closest match.</p>
      ${Object.entries(EMOTION_FAMILIES).map(([fam, variants]) => `
        <div class="ref-item ref-table-emotion">
          <div class="ref-item-name">${esc(fam)}</div>
          <div class="ref-item-desc">${esc(variants.join(" · "))}</div>
        </div>
      `).join("")}
    </div>

    <div class="ref-section">
      <div class="ref-section-head">
        <span class="ref-section-num">2</span>
        <h2 class="ref-section-title display">Intensity Scale</h2>
        <span class="ref-section-step">Step 2</span>
      </div>
      <p class="ref-section-intro">Rate how strong it feels to you, not how it looks from outside. 0 means not there at all; 100 means the most you have ever felt it. If it's hard to pin a number on it, give your best guess and tick <em>Mark as estimated</em>.</p>
      <div class="ref-table-intensity">
        ${INTENSITY_BANDS.map((b, i) => {
          const minR = i === 0 ? 0 : INTENSITY_BANDS[i - 1].max + 1;
          return `
            <div class="ref-band-row">
              <div class="ref-band-range">${minR === b.max ? b.max : minR + "–" + b.max}</div>
              <div>
                <div class="ref-band-label">${b.label}</div>
                <div class="ref-band-signals">${esc(b.signals)}</div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>

    <div class="ref-section">
      <div class="ref-section-head">
        <span class="ref-section-num">2</span>
        <h2 class="ref-section-title display">Body Check</h2>
        <span class="ref-section-step">Step 2</span>
      </div>
      <p class="ref-section-intro">Where emotions are often felt in the body. The same feeling can land differently for different people, so treat these as prompts, not rules. If you didn't notice it in the moment and are working it out afterward, say so with the checkbox under the body field.</p>
      ${BODY_REGIONS.map(b => `
        <div class="ref-item">
          <div class="ref-item-name">${esc(b.region)}</div>
          <div class="ref-item-desc">${esc(b.examples)}</div>
        </div>
      `).join("")}
    </div>

    <div class="ref-section">
      <div class="ref-section-head">
        <span class="ref-section-num">4</span>
        <h2 class="ref-section-title display">Socratic Questions</h2>
        <span class="ref-section-step">Step 4</span>
      </div>
      <p class="ref-section-intro">Pick the question type that matches what the thought is doing — catastrophizing, mind-reading, self-blame, etc. The template gives you a starting line you can rewrite.</p>
      ${SOCRATIC_TYPES.map(s => `
        <div class="ref-item">
          <div class="ref-item-name">${esc(s.type)}</div>
          <div class="ref-item-desc">When: ${esc(s.when)}</div>
          <div class="ref-item-template">"${esc(s.template)}"</div>
        </div>
      `).join("")}
    </div>

    <div class="ref-section">
      <div class="ref-section-head">
        <span class="ref-section-num">5</span>
        <h2 class="ref-section-title display">Reframing Methods</h2>
        <span class="ref-section-step">Step 5</span>
      </div>
      <p class="ref-section-intro">Quality test: would you say "yeah, that's fair," or roll your eyes? If eye-roll, make it less positive.</p>
      ${REFRAME_METHODS.map(r => `
        <div class="ref-item">
          <div class="ref-item-name">${esc(r.method)}</div>
          <div class="ref-item-desc"><strong>When:</strong> ${esc(r.when)}. ${esc(r.does)}.</div>
          ${r.template ? `<div class="ref-item-template">"${esc(r.template)}"</div>` : ""}
        </div>
      `).join("")}
      <div class="ref-pairs" style="margin-top: 20px;">
        <div class="ref-pairs-head" style="color: var(--copper-deep);">Do NOT use</div>
        <ul style="list-style: none; padding-left: 0;">
          <li style="display: block; padding: 4px 0; color: var(--on-paper-soft);">Toxic positivity</li>
          <li style="display: block; padding: 4px 0; color: var(--on-paper-soft);">Dismissal ("it's not that bad")</li>
          <li style="display: block; padding: 4px 0; color: var(--on-paper-soft);">Hollow affirmation ("you're amazing!")</li>
          <li style="display: block; padding: 4px 0; color: var(--on-paper-soft);">Unsupported thought replacement</li>
        </ul>
      </div>
    </div>
  `;
}

function renderModal() {
  const root = document.getElementById("modal-root");
  if (!state.modal) {
    // Every close fades out, whether the user dismissed the dialog or it
    // closed itself after an action (Save, Delete, Import). After an action
    // it used to vanish in a single frame. An overlay already on its way out
    // is left to finish.
    const leaving = root.querySelector(".modal-overlay");
    if (leaving && !leaving.classList.contains("is-closing") && motionMs("--dur-short")) {
      _fadeOutOverlay(root, leaving);
    } else if (!leaving || !leaving.classList.contains("is-closing")) {
      root.innerHTML = "";
    }
    _renderedModal = null;
    // Release focus back to whatever opened the dialog now, while it fades,
    // not after.
    _releaseModalFocus();
    return;
  }

  let inner = "";
  if (state.modal === "export") {
    inner = `
      <h3 class="display">Export</h3>
      <p class="modal-sub">Markdown for therapists, journals, or Obsidian. JSON for backup. Print / PDF for paper or a clean read-back.</p>
      <div class="modal-options">
        <button class="modal-option" data-action="export-md">
          <div class="modal-option-title">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v10h10V3z"/><path d="M5 6h6M5 9h4"/></svg>
            Markdown (.md)
          </div>
          <div class="modal-option-desc">Entry N format with all seven sections, ready to paste into Obsidian or share with a clinician</div>
        </button>
        <button class="modal-option" data-action="export-print">
          <div class="modal-option-title">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 5V2h8v3M4 11H2V6h12v5h-2M5 9h6v5H5z"/></svg>
            Print / Save as PDF
          </div>
          <div class="modal-option-desc">Opens your browser's print dialog with every entry expanded — pick "Save as PDF" to keep an offline copy</div>
        </button>
        <button class="modal-option" data-action="export-json">
          <div class="modal-option-title">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 4l-2 4 2 4M11 4l2 4-2 4"/></svg>
            JSON (.json)
          </div>
          <div class="modal-option-desc">Structured data, re-importable across devices</div>
        </button>
      </div>
      <div class="modal-actions">
        <button class="btn-modal btn-modal-secondary" data-action="close-modal">Close</button>
      </div>
    `;
  } else if (state.modal === "import") {
    inner = `
      <h3 class="display">Import backup</h3>
      <p class="modal-sub">Load a previously exported JSON file. Choose how to handle entries that already exist here.</p>
      <div class="modal-options">
        <button class="modal-option" data-action="import-merge">
          <div class="modal-option-title">Merge with current</div>
          <div class="modal-option-desc">Add imported entries, skip duplicates by ID</div>
        </button>
        <button class="modal-option" data-action="import-replace">
          <div class="modal-option-title">Replace everything</div>
          <div class="modal-option-desc">Wipe current entries and use the import as-is</div>
        </button>
      </div>
      <div class="modal-actions">
        <button class="btn-modal btn-modal-secondary" data-action="close-modal">Cancel</button>
      </div>
    `;
  } else if (state.modal === "discard-draft") {
    inner = `
      <h3 class="display">Discard draft?</h3>
      <p class="modal-sub">The unfinished entry will be lost. This can't be undone.</p>
      <div class="modal-actions">
        <button class="btn-modal btn-modal-secondary" data-action="close-modal">Keep</button>
        <button class="btn-modal btn-modal-danger" data-action="confirm-discard-draft">Discard</button>
      </div>
    `;
  } else if (state.modal === "confirm-new-draft") {
    inner = `
      <h3 class="display">Start a new entry?</h3>
      <p class="modal-sub">You have an unfinished draft. Starting fresh will discard it. This can't be undone.</p>
      <div class="modal-actions">
        <button class="btn-modal btn-modal-secondary" data-action="cancel-new-draft">Keep draft</button>
        <button class="btn-modal btn-modal-danger" data-action="confirm-new-draft">Discard &amp; start</button>
      </div>
    `;
  } else if (state.modal === "switch-kind") {
    const targetLabel = ({
      "thought-record": "Thought record",
      "freeform":       "Free write",
      "activity":       "Plan activity",
      "worry":          "Park a worry",
    })[state.pendingModeSwitch] || "another kind";
    inner = `
      <h3 class="display">Switch to ${esc(targetLabel)}?</h3>
      <p class="modal-sub">Your current draft will be discarded. This can't be undone.</p>
      <div class="modal-actions">
        <button class="btn-modal btn-modal-secondary" data-action="cancel-mode-switch">Keep current</button>
        <button class="btn-modal btn-modal-danger" data-action="confirm-mode-switch">Switch</button>
      </div>
    `;
  } else if (state.modal && state.modal.type === "delete") {
    inner = `
      <h3 class="display">Delete entry?</h3>
      <p class="modal-sub">This can't be undone. Consider exporting first if you might want it back.</p>
      <div class="modal-actions">
        <button class="btn-modal btn-modal-secondary" data-action="close-modal">Cancel</button>
        <button class="btn-modal btn-modal-danger" data-action="confirm-delete" data-id="${state.modal.id}">Delete</button>
      </div>
    `;
  } else if (state.modal === "quick") {
    const q = state.quickDraft || { thought: "", intensity: 60, ventOnly: false };
    // Starter prompts the user can tap to seed the textarea — scaffolding
    // for moments when "where do I even start" is the actual blocker. Each
    // prompts a different facet so the user can pick whichever fits.
    const QUICK_PROMPTS = [
      { label: "What happened",    seed: "Here's what just happened: " },
      { label: "The thought",      seed: "The thought running through my head: " },
      { label: "The feeling",      seed: "What I'm feeling right now: " },
      { label: "The body",         seed: "Where this sits in my body: " },
    ];
    inner = `
      <h3 class="display">Quick capture</h3>
      <p class="modal-sub">For when a full 7-step entry is too much. Naming what's there is already work — you don't have to do anything else with it.</p>
      <div class="modal-body">
        <label class="field-label-paper">What's here right now?</label>
        <p class="field-help-paper" style="margin: -4px 0 8px 0;">Write whatever comes — the event, a thought, a feeling, what your body's doing. One sentence is plenty.</p>
        <textarea class="textarea input-large" id="quickThought" rows="5" autofocus placeholder="One sentence is fine. No structure needed.">${esc(q.thought)}</textarea>
        <div class="quick-prompts" role="group" aria-label="Starter prompts">
          <span class="quick-prompts-label">Or tap a starter:</span>
          ${QUICK_PROMPTS.map(p => `<button type="button" class="quick-prompt-chip" data-action="insert-quick-prompt" data-seed="${esc(p.seed)}">${esc(p.label)}</button>`).join("")}
        </div>
        <div style="margin-top: 16px;">
          <label class="field-label-paper">Intensity, right now</label>
          <div class="belief-control">
            <div class="belief-head">
              <span class="belief-num display"><span id="quickIntensityDisplay">${q.intensity}</span><span class="belief-num-suffix">/100</span></span>
              <span class="belief-hint" id="quickIntensityBand">${esc(band(q.intensity).label)}</span>
            </div>
            <input type="range" min="0" max="100" value="${q.intensity}" id="quickIntensity" class="intensity-slider intensity-slider--emotion" aria-label="Intensity right now, 0 to 100">
          </div>
        </div>
        <label class="checkbox-flag" style="margin-top: 12px;">
          <input type="checkbox" id="quickVentOnly" ${q.ventOnly ? "checked" : ""}>
          <span>Just venting — don't follow up. Sometimes naming it is enough.</span>
        </label>
        <div id="quickIntensityNote">${quickIntensityNoteHTML(q.intensity)}</div>
      </div>
      <div class="modal-actions">
        <button class="btn-modal btn-modal-secondary" data-action="close-modal">Cancel</button>
        <button class="btn-modal btn-modal-primary" data-action="save-quick">Save</button>
      </div>
    `;
  } else if (state.modal === "onboarding") {
    inner = `
      <h3 class="display">Welcome to Rephrame</h3>
      <p class="modal-sub">A private, offline CBT journal. Four ways to capture what's happening — walk a thought through a structured reframe, write free-form, plan an activity worth doing, or park a worry for later. Pick whatever fits the moment. Everything stays in this browser only.</p>
      <div class="onboard-caveat">
        <strong>When this tool fits.</strong> Rephrame is built for ordinary distress — the daily frustrations, disappointments, and worries that benefit from a structured pause. <strong>It's not built for</strong> active trauma processing, severe depression, psychosis, or acute crisis. For those, please use this alongside professional care, and reach for <button class="link-button" data-action="open-safety">crisis support</button> if you need it now.
      </div>
      <div class="modal-options">
        <button class="modal-option" data-action="load-sample">
          <div class="modal-option-title">Load an example entry</div>
          <div class="modal-option-desc">A fully filled-in sample so you can see what a complete thought record looks like. Tap the Sample badge to remove it whenever you're done.</div>
        </button>
        <button class="modal-option" data-action="onboard-begin">
          <div class="modal-option-title">Begin your own entry</div>
          <div class="modal-option-desc">Jump straight into Step 1. You can always tap the ${svgIcon("bolt", "ico--inline")} icon in the top-right for a quick-capture if you're overwhelmed.</div>
        </button>
      </div>
      <p class="modal-sub" style="font-size: 12px; margin-top: 16px;">
        ${SAFETY_LINK_INLINE}
      </p>
      <div class="modal-actions">
        <button class="btn-modal btn-modal-secondary" data-action="onboard-skip">Skip for now</button>
      </div>
    `;
  } else if (state.modal === "settings") {
    inner = renderSettingsModal();
  } else if (state.modal === "set-pin") {
    inner = renderSetPinModal();
  } else if (state.modal === "remove-pin") {
    inner = renderRemovePinModal();
  } else if (state.modal === "safety") {
    inner = renderSafetyModal();
  } else if (state.modal === "quota-error") {
    inner = renderQuotaErrorModal();
  } else if (state.modal === "log-activity") {
    inner = renderLogActivityModal();
  }

  // Re-render an already-open modal *in place*. Blowing away #modal-root and
  // rebuilding it — which is what this did for every render(), including the
  // one behind each tap on a Settings choice — restarts the overlay's fadeIn
  // and the card's modalIn animations, so the whole dialog flashes on every
  // click. It also scrolls a long modal (Settings) back to the top and drops
  // the caret out of whatever field was being edited. Swapping only the
  // dialog's contents keeps the animated elements mounted, so nothing
  // re-animates, and lets us put the scroll offset and caret back.
  const openOverlay = root.querySelector('.modal-overlay');
  const openModal = openOverlay && openOverlay.querySelector('.modal');
  if (openModal && _renderedModal === state.modal &&
      !openOverlay.classList.contains('is-closing')) {
    const scrollTop = openModal.scrollTop;
    const field = _captureModalField(openModal);
    const stateClasses = snapshotStateClasses(openModal);
    openModal.innerHTML = inner;
    carryStateClasses(openModal, stateClasses);
    _labelModal(openModal);
    // The focus trap's keydown handler closes over this same element, which
    // is still mounted, and initial focus belongs to the open — not to every
    // re-render of it — so _trapModalFocus deliberately isn't re-run here.
    // Scroll and focus are put back after bindModal(), which is what fills in
    // sub-panels rendered by other modules (the sync panel) — restoring
    // before that would target elements that don't exist yet.
    bindModal();
    openModal.scrollTop = scrollTop;
    _restoreModalField(openModal, field);
    return;
  }

  // A different dialog replacing an open one (Settings → Set PIN, Settings →
  // Export, Quick capture → crisis resources). Rebuilding #modal-root here
  // restarted the overlay's fadeIn from opacity 0, so the page behind blinked
  // into view unblurred between the two dialogs. Keep the overlay, morph the
  // card's height from the old dialog to the new one, and fade only the new
  // content in.
  if (openModal && !openOverlay.classList.contains('is-closing')) {
    const fromH = openModal.getBoundingClientRect().height;
    openModal.classList.remove('is-swapping');
    void openModal.offsetWidth;
    openModal.classList.add('is-swapping');
    openModal.innerHTML = inner;
    openModal.scrollTop = 0;
    openModal.removeAttribute('aria-labelledby');
    _renderedModal = state.modal;
    _labelModal(openModal);
    const toH = openModal.getBoundingClientRect().height;
    const dur = motionMs('--dur-medium');
    if (dur && Math.abs(toH - fromH) > 1 && typeof openModal.animate === 'function') {
      // Clip while the box is between sizes: overflow-y:auto would otherwise
      // flash a scrollbar for the length of the morph.
      openModal.style.overflowY = 'hidden';
      const anim = openModal.animate(
        [{ height: fromH + 'px' }, { height: toH + 'px' }],
        { duration: dur, easing: motionEase() });
      const settle = () => { openModal.style.overflowY = ''; };
      anim.onfinish = settle;
      anim.oncancel = settle;
    }
    setTimeout(() => openModal.classList.remove('is-swapping'), dur + 50);
    // A new dialog gets the same initial focus as a fresh open. The opener
    // is left alone, so closing still returns focus to whatever opened the
    // first dialog.
    _modalNeedsInitialFocus = true;
    _trapModalFocus(openModal);
    bindModal();
    return;
  }

  root.innerHTML = `<div class="modal-overlay" data-action="close-modal" role="presentation"><div class="modal" role="dialog" aria-modal="true">${inner}</div></div>`;
  _renderedModal = state.modal;
  // Stop modal-internal clicks from bubbling to the overlay (which has
  // data-action="close-modal"). Previously this was an inline onclick
  // attribute; moving it to addEventListener keeps a strict CSP
  // achievable later without 'unsafe-inline' on script-src.
  {
    const modalForStop = root.querySelector('.modal');
    if (modalForStop) modalForStop.addEventListener('click', e => e.stopPropagation());
  }
  const modalEl = root.querySelector('.modal');
  if (modalEl) {
    _labelModal(modalEl);
    // Move focus into the dialog and trap Tab cycling so keyboard users
    // don't end up tabbing into the now-inert page underneath. We pick
    // the first natively-focusable input/textarea/select if present
    // (forms-heavy modals expect that), else the first button.
    _trapModalFocus(modalEl);
  }
  bindModal();
}

// Play the dialog's exit, then remove it. The leaving overlay goes inert,
// sheds its ids (nothing may find a field in a closed dialog) and lets taps
// through to the page. A dialog opening meanwhile rebuilds #modal-root and
// simply replaces it.
function _fadeOutOverlay(root, overlay) {
  overlay.classList.add("is-closing");
  overlay.setAttribute("inert", "");
  overlay.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
  let gone = false;
  const done = () => {
    if (gone) return;
    gone = true;
    if (overlay.parentNode === root) overlay.remove();
  };
  // animationend bubbles up from the dialog's own exit too; wait for the
  // overlay's. The timer is the net for a browser that never fires it.
  overlay.addEventListener("animationend", e => { if (e.target === overlay) done(); });
  setTimeout(done, motionMs("--dur-short") + 80);
}

// Which modal kind is currently mounted in #modal-root. Distinguishes "the
// same dialog re-rendered" (update in place, no animation) from "a different
// dialog opened" (full rebuild, animate it in).
let _renderedModal = null;

// Wire the modal's first heading as the accessible name so screen readers
// announce "Dialog: <title>" when focus enters.
function _labelModal(modalEl) {
  const heading = modalEl.querySelector('h1, h2, h3');
  if (!heading) return;
  if (!heading.id) heading.id = 'reframe-modal-title';
  modalEl.setAttribute('aria-labelledby', heading.id);
}

// Remember which control inside the dialog had focus (and where the caret
// sat) so an in-place re-render can hand it back. Without this, changing a
// setting mid-edit would drop focus to <body> and close the soft keyboard.
function _captureModalField(modalEl) {
  const el = document.activeElement;
  if (!el || el === document.body || !modalEl.contains(el)) return null;
  const sel = _openerSelector(el);
  if (!sel) return null;
  const f = { sel, start: null, end: null };
  // selectionStart throws on input types that don't support selection
  // (time, number, checkbox…), so it's guarded rather than type-sniffed.
  try { f.start = el.selectionStart; f.end = el.selectionEnd; } catch (_) {}
  return f;
}

function _restoreModalField(modalEl, f) {
  if (!f) return;
  let el = null;
  try { el = modalEl.querySelector(f.sel); } catch (_) {}
  if (!el || typeof el.focus !== 'function') return;
  // preventScroll: the dialog's scroll offset was just restored by the
  // caller, and focus() would otherwise scroll the field back into view.
  try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (__) {} }
  if (f.start == null) return;
  try { el.setSelectionRange(f.start, f.end); } catch (_) {}
}

// Focusable-element selector used by both the focus trap and the
// initial-focus pick. Excludes [tabindex="-1"] and disabled controls.
const _FOCUSABLE_SEL = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

// Remembers the element that opened the modal so we can return focus to
// it on close. Without this, screen-reader / keyboard users land at the
// top of the document body after every modal dismissal.
let _modalOpenerEl = null;
// render() rebuilds #view via innerHTML before renderModal() runs, so an
// opener that lived inside the view (an entry's Delete button, the empty-
// state Import button, "Log result"…) is a detached node by the time focus
// is returned. Remember a selector too, so the freshly rendered equivalent
// can be found.
let _modalOpenerSel = null;
// Set when the opener is captured; consumed by _trapModalFocus to move focus
// into the dialog exactly once per open (not on every re-render of it).
let _modalNeedsInitialFocus = false;
let _modalKeyHandler = null;

// Must run BEFORE render() rebuilds #view: by the time renderModal() executes,
// an opener that lived inside the view has already been replaced by innerHTML
// and document.activeElement has fallen back to <body>.
function _rememberModalOpener() {
  if (_modalOpenerEl) return;
  _modalOpenerEl = document.activeElement || document.body;
  _modalOpenerSel = _openerSelector(_modalOpenerEl);
  _modalNeedsInitialFocus = true;
}

function _openerSelector(el) {
  if (!el || el === document.body || !el.dataset) return null;
  const cssEsc = (v) => (window.CSS && window.CSS.escape) ? window.CSS.escape(v) : String(v).replace(/["\\]/g, "\\$&");
  if (el.id) return "#" + cssEsc(el.id);
  const a = el.dataset.action;
  if (!a) return null;
  let sel = '[data-action="' + cssEsc(a) + '"]';
  for (const k of ["id", "value", "kind", "step", "nav"]) {
    if (el.dataset[k] != null) sel += '[data-' + k + '="' + cssEsc(el.dataset[k]) + '"]';
  }
  return sel;
}

function _untrapModalKeys() {
  if (_modalKeyHandler) {
    document.removeEventListener('keydown', _modalKeyHandler, true);
    _modalKeyHandler = null;
  }
}

function _focusableIn(root) {
  return Array.from(root.querySelectorAll(_FOCUSABLE_SEL))
    .filter(el => el.offsetParent !== null || el === document.activeElement);
}

// Is `el` inside the part of the scrolling dialog the user can currently see?
// Used to decide whether focusing it would drag the dialog somewhere the user
// did not ask to go.
function _isWithinModalView(el, modalEl) {
  const e = el.getBoundingClientRect();
  const m = modalEl.getBoundingClientRect();
  return e.height > 0 && e.top >= m.top - 1 && e.bottom <= m.bottom + 1;
}

function _trapModalFocus(modalEl) {
  _untrapModalKeys();
  _rememberModalOpener();
  const isFreshOpen = _modalNeedsInitialFocus;
  _modalNeedsInitialFocus = false;
  // Defer initial focus by one frame so the modal is laid out and any
  // animation start frame has rendered. Only set initial focus on a
  // fresh open — re-renders of an already-open modal (state changes
  // mid-edit) would otherwise yank the user's focus back to the top
  // of the form on every keystroke.
  if (isFreshOpen) {
    requestAnimationFrame(() => {
      const focusables = _focusableIn(modalEl);
      // Prefer the first form field — but only when it is already on screen.
      // Settings' first input is the worry-window time picker, ~550px down a
      // 2000px panel, so preferring it unconditionally opened Settings
      // scrolled past its own heading with a time picker focused. Fall back
      // to the first focusable, which is at the top of the dialog.
      const field = modalEl.querySelector('input, textarea, select');
      const initial = (field && _isWithinModalView(field, modalEl) ? field : focusables[0]) || field;
      // preventScroll, like every other focus() in this file: the dialog opens
      // at its top and taking focus must not move it.
      if (initial) try { initial.focus({ preventScroll: true }); } catch(_) { try { initial.focus(); } catch(__) {} }
    });
  }
  _modalKeyHandler = (e) => {
    if (e.key !== 'Tab') return;
    const focusables = _focusableIn(modalEl);
    if (focusables.length === 0) { e.preventDefault(); return; }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !modalEl.contains(active))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (active === last || !modalEl.contains(active))) {
      e.preventDefault(); first.focus();
    }
  };
  document.addEventListener('keydown', _modalKeyHandler, true);
}

function _releaseModalFocus() {
  _untrapModalKeys();
  const opener = _modalOpenerEl;
  const sel = _modalOpenerSel;
  _modalOpenerEl = null;
  _modalOpenerSel = null;
  _modalNeedsInitialFocus = false;
  // Prefer the original node if it's still in the document; otherwise the
  // view has been re-rendered under the modal — find its replacement.
  let target = (opener && opener.isConnected) ? opener : null;
  if (!target && sel) { try { target = document.querySelector(sel); } catch(_) {} }
  if (target && typeof target.focus === 'function') {
    try { target.focus({ preventScroll: true }); } catch(_) { try { target.focus(); } catch(__) {} }
  }
}

// Centralized so the same wording is reused across modals, empty state, and
// Reference. Editing the language in one place updates every surface.
const SAFETY_LINK_INLINE =
  'Rephrame is a journaling tool, not a substitute for therapy or crisis care. ' +
  'In the US, call or text <strong>988</strong> (Suicide &amp; Crisis Lifeline) or text <strong>HOME</strong> to <strong>741741</strong> (Crisis Text Line). ' +
  `<button class="link-button" data-action="open-safety">See more crisis resources ${svgIcon("arrowRight", "ico--xs")}</button>`;

// Quick-capture intensity note. Shared by renderModal and the live intensity
// slider handler so the >=80 grounding prompt can be swapped in place (no
// full renderModal mid-drag, which flashed the modal and dropped the grab).
function quickIntensityNoteHTML(intensity) {
  return intensity >= 80
    ? `<div class="grounding-note grounding-note--modal" role="note">
        <div class="grounding-note-eyebrow">At this intensity…</div>
        <div class="grounding-note-body">
          <p>Above 80 is a lot to sit with. Before — or instead of — writing more, try slowing the breath out (4-second in, 6-second out) for a minute, or name 5 things you can see. <button class="link-button" data-action="open-safety">Crisis support is here</button> if you need it.</p>
        </div>
      </div>`
    : `<p class="modal-sub" style="margin-top: 16px; font-size: 13px;">${SAFETY_LINK_INLINE}</p>`;
}

function renderSettingsModal() {
  const s = state.settings;
  const themeChoices = [
    { v: "auto",  label: "Auto",  desc: "Follow your OS preference" },
    { v: "light", label: "Light", desc: "Paper background, ink text" },
    { v: "dark",  label: "Dark",  desc: "Ink background, paper text" },
  ];
  const intervalChoices = [
    { v: "off",    label: "Off",          desc: "No nudges" },
    { v: "daily",  label: "Daily",        desc: "If you haven't written in 24 hours" },
    { v: "3days",  label: "Every 3 days", desc: "Gentler — once your last entry is 3+ days old" },
    { v: "weekly", label: "Weekly",       desc: "Light-touch — only if you've been quiet for a week" },
  ];
  return `
    <h3 class="display">Settings</h3>
    <p class="modal-sub">Local only — nothing here is synced or sent anywhere.</p>

    <div class="settings-section">
      <div class="settings-section-title">Appearance</div>
      <div class="settings-choice-group" role="radiogroup" aria-label="Theme">
        ${themeChoices.map(c => `
          <button class="settings-choice ${s.theme === c.v ? "active" : ""}" data-action="set-theme" data-value="${c.v}" role="radio" aria-checked="${s.theme === c.v}">
            <div class="settings-choice-label">${esc(c.label)}</div>
            <div class="settings-choice-desc">${esc(c.desc)}</div>
          </button>
        `).join("")}
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Gentle nudge</div>
      <p class="settings-section-help">A soft in-app banner that appears at the top of the journal when your last entry is older than the interval below. No notifications go out — it only shows the next time you open the app.</p>
      <div class="settings-choice-group" role="radiogroup" aria-label="Reminder interval">
        ${intervalChoices.map(c => `
          <button class="settings-choice ${s.reminderInterval === c.v ? "active" : ""}" data-action="set-reminder" data-value="${c.v}" role="radio" aria-checked="${s.reminderInterval === c.v}">
            <div class="settings-choice-label">${esc(c.label)}</div>
            <div class="settings-choice-desc">${esc(c.desc)}</div>
          </button>
        `).join("")}
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Worry window</div>
      <p class="settings-section-help">When parked worries reappear for review. Worry time starts at this time and lasts 20 minutes. Keep it the same every day, and not close to bedtime. If the time has already passed today, parking a new worry schedules it for tomorrow.</p>
      <label class="settings-time-row">
        <span class="settings-time-label">Time of day</span>
        <input type="time" class="settings-time-input" data-action="set-worry-window-time" value="${esc(_parseHHMM(s.worryWindowTime).map(n => String(n).padStart(2, "0")).join(":"))}">
      </label>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Privacy lock</div>
      ${hasPin() ? `
        <p class="settings-section-help">A PIN gates the app on each new tab session. Stored as a salted PBKDF2 hash (100k iterations) on this device only, with a brute-force lockout after 5 wrong tries. The journal itself isn't encrypted — anyone with technical access to localStorage could still read the data — but the soft lock stops casual snooping on an unlocked phone.</p>
        <div class="settings-data-actions">
          <button class="settings-data-btn" data-action="open-set-pin">
            <span class="settings-data-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>
            </span>
            <span class="settings-data-text">
              <span class="settings-data-title">Change PIN</span>
              <span class="settings-data-desc">Enter the current PIN, then choose a new one</span>
            </span>
          </button>
          <button class="settings-data-btn" data-action="open-remove-pin">
            <span class="settings-data-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/><path d="M5 12l3-3M8 12l-3-3"/></svg>
            </span>
            <span class="settings-data-text">
              <span class="settings-data-title">Remove PIN</span>
              <span class="settings-data-desc">Stops gating the app on new sessions</span>
            </span>
          </button>
          <button class="settings-data-btn" data-action="lock-now">
            <span class="settings-data-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/><circle cx="8" cy="10.5" r="1" fill="currentColor"/></svg>
            </span>
            <span class="settings-data-text">
              <span class="settings-data-title">Lock now</span>
              <span class="settings-data-desc">Re-enter the PIN to come back</span>
            </span>
          </button>
        </div>
      ` : `
        <p class="settings-section-help">Optional. When set, opening Rephrame on a new tab session requires entering the PIN before the journal is visible. Closes the gap between "private" and "anyone with the unlocked phone."</p>
        <p class="settings-section-help" style="margin-top: 4px;"><strong>There's no PIN recovery.</strong> Forgetting it means clearing site data (which deletes every entry). Export to JSON regularly while unlocked.</p>
        <div class="settings-data-actions">
          <button class="settings-data-btn" data-action="open-set-pin">
            <span class="settings-data-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>
            </span>
            <span class="settings-data-text">
              <span class="settings-data-title">Set a PIN</span>
              <span class="settings-data-desc">4–8 digits, stored as a hash on this device only</span>
            </span>
          </button>
        </div>
      `}
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Backup &amp; restore</div>
      <p class="settings-section-help">All entries live in this browser's localStorage. Export occasionally so you don't lose them if the browser clears site data or the PWA is uninstalled.</p>
      <div class="settings-data-actions">
        <button class="settings-data-btn" data-action="open-export">
          <span class="settings-data-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V4M4 8l4-4 4 4M2 13h12"/></svg>
          </span>
          <span class="settings-data-text">
            <span class="settings-data-title">Export entries</span>
            <span class="settings-data-desc">Markdown, JSON, or Print / PDF</span>
          </span>
        </button>
        <button class="settings-data-btn" data-action="open-import">
          <span class="settings-data-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v9M4 7l4 4 4-4M2 13h12"/></svg>
          </span>
          <span class="settings-data-text">
            <span class="settings-data-title">Import from backup</span>
            <span class="settings-data-desc">Merge with current or replace everything</span>
          </span>
        </button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Sync between devices</div>
      <div id="syncPanel"></div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">About your data</div>
      <p class="settings-section-help">Entries live in this browser's localStorage. Peer-to-peer sync (above) sends them directly to a device you pair — nothing is stored on a server. To wipe everything, clear site data in your browser settings (or delete and re-add the PWA). Rephrame stores entries under <code class="settings-code">reframe-journal-v1</code> and preferences under <code class="settings-code">reframe-settings-v1</code>.</p>
    </div>

    <div class="modal-actions">
      <button class="btn-modal btn-modal-primary" data-action="close-modal">Done</button>
    </div>
  `;
}

function renderSetPinModal() {
  const isChanging = hasPin();
  const f = state.pinForm;
  return `
    <h3 class="display">${isChanging ? "Change PIN" : "Set a PIN"}</h3>
    <p class="modal-sub">${isChanging
      ? "Enter your current PIN, then choose a new one. The PIN is stored as a salted PBKDF2 hash on this device only."
      : "4–8 digits. Stored as a salted PBKDF2 hash on this device. There's no recovery path — if you forget the PIN, the only way back in deletes every entry, so export to JSON regularly."
    }</p>
    <form id="pinSetForm" class="pin-form" autocomplete="off">
      ${isChanging ? `
        <label class="field-label-paper">Current PIN</label>
        <input id="pinCurrent" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" value="${esc(f ? f.current : "")}">
      ` : ""}
      <label class="field-label-paper" style="margin-top: ${isChanging ? "14px" : "0"};">${isChanging ? "New PIN" : "PIN"}</label>
      <input id="pinNew" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password" value="${esc(f ? f.next : "")}" autofocus>
      <label class="field-label-paper" style="margin-top: 14px;">Confirm</label>
      <input id="pinConfirm" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password" value="${esc(f ? f.confirm : "")}">
      ${f && f.error ? `<p class="pin-error" role="alert">${esc(f.error)}</p>` : ""}
      <div class="modal-actions" style="margin-top: 16px;">
        <button type="button" class="btn-modal btn-modal-secondary" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn-modal btn-modal-primary">${isChanging ? "Save new PIN" : "Set PIN"}</button>
      </div>
    </form>
  `;
}

function renderRemovePinModal() {
  const f = state.pinForm;
  return `
    <h3 class="display">Remove PIN</h3>
    <p class="modal-sub">Enter your current PIN to confirm. After removal, the app will open straight to the journal on every new session.</p>
    <form id="pinRemoveForm" class="pin-form" autocomplete="off">
      <label class="field-label-paper">Current PIN</label>
      <input id="pinCurrentRemove" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" value="${esc(f ? f.current : "")}" autofocus>
      ${f && f.error ? `<p class="pin-error" role="alert">${esc(f.error)}</p>` : ""}
      <div class="modal-actions" style="margin-top: 16px;">
        <button type="button" class="btn-modal btn-modal-secondary" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn-modal btn-modal-danger">Remove PIN</button>
      </div>
    </form>
  `;
}

function renderQuotaErrorModal() {
  // Blocking modal — the only error worth a full modal because the user
  // needs to take action (export & clear space) before they can continue
  // capturing entries. The current entry is in memory but unsaved.
  return `
    <h3 class="display">Storage is full</h3>
    <p class="modal-sub">Your browser ran out of space for Rephrame to save this entry. The text is still on this screen — but it won't survive a refresh until you free up storage.</p>
    <div class="modal-options">
      <button class="modal-option" data-action="open-export">
        <div class="modal-option-title">Export everything now</div>
        <div class="modal-option-desc">Save your full journal as JSON or Markdown so nothing's lost. Then clear site data in your browser to free space, and re-import.</div>
      </button>
    </div>
    <p class="modal-sub" style="margin-top: 14px; font-size: 12px;">If this keeps happening, you may have hit your browser's per-site quota (usually ~5MB for localStorage). A future release can move storage to IndexedDB, which scales to gigabytes.</p>
    <div class="modal-actions">
      <button class="btn-modal btn-modal-secondary" data-action="close-modal">Close</button>
    </div>
  `;
}

function renderLogActivityModal() {
  const d = state.logActivityDraft || { actualP: 5, actualM: 5, notes: "" };
  const entry = state.entries.find(x => x.id === d.entryId);
  if (!entry) {
    return `<h3 class="display">Activity not found</h3><div class="modal-actions"><button class="btn-modal btn-modal-secondary" data-action="close-modal">Close</button></div>`;
  }
  return `
    <h3 class="display">How did it go?</h3>
    <p class="modal-sub">${catIcon(entry.category, "ico--inline")} ${esc(entry.body)} — planned for ${esc(fmtDateTime(entry.plannedFor))}</p>
    <div class="modal-body">
      <label class="field-label-paper">Actual pleasure (0–10)</label>
      <div class="belief-control">
        <div class="belief-head">
          <span class="belief-num display"><span id="actualPDisplay">${d.actualP}</span><span class="belief-num-suffix">/10</span></span>
          <span class="belief-hint">Predicted: <strong>${entry.predictedP ?? "—"}</strong></span>
        </div>
        <input type="range" min="0" max="10" step="1" value="${d.actualP}" id="actualP" class="intensity-slider" aria-label="Actual pleasure, 0 to 10">
      </div>
      <label class="field-label-paper" style="margin-top: 14px;">Actual mastery (0–10)</label>
      <div class="belief-control">
        <div class="belief-head">
          <span class="belief-num display"><span id="actualMDisplay">${d.actualM}</span><span class="belief-num-suffix">/10</span></span>
          <span class="belief-hint">Predicted: <strong>${entry.predictedM ?? "—"}</strong></span>
        </div>
        <input type="range" min="0" max="10" step="1" value="${d.actualM}" id="actualM" class="intensity-slider" aria-label="Actual mastery, 0 to 10">
      </div>
      <label class="field-label-paper" style="margin-top: 14px;">Notes (optional)</label>
      <textarea class="textarea" id="actualNotes" rows="3" placeholder="What surprised you? What was different from your prediction?">${esc(d.notes)}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-modal btn-modal-secondary" data-action="close-modal">Cancel</button>
      <button class="btn-modal btn-modal-primary" data-action="save-log-activity">Save</button>
    </div>
  `;
}

function renderSafetyModal() {
  return `
    <h3 class="display">If you're in crisis</h3>
    <p class="modal-sub">A thought record is for ordinary distress — moments where you can still pause and write. If you can't, please reach out to one of these now. They're free, confidential, and answer 24/7.</p>
    <div class="safety-list">
      <div class="safety-item">
        <div class="safety-name">988 Suicide &amp; Crisis Lifeline <span class="safety-country">US</span></div>
        <div class="safety-detail">Call or text <strong>988</strong>. Chat at <strong>chat.988lifeline.org</strong>.</div>
      </div>
      <div class="safety-item">
        <div class="safety-name">9-8-8: Suicide Crisis Helpline <span class="safety-country">Canada</span></div>
        <div class="safety-detail">Call or text <strong>988</strong>, in English or French.</div>
      </div>
      <div class="safety-item">
        <div class="safety-name">Text lines</div>
        <div class="safety-detail">US: <strong>HOME</strong> to <strong>741741</strong>. UK: <strong>SHOUT</strong> to <strong>85258</strong>. Ireland: text <strong>50808</strong>. Canada, young people: <strong>CONNECT</strong> to <strong>686868</strong>.</div>
      </div>
      <div class="safety-item">
        <div class="safety-name">Samaritans <span class="safety-country">UK / Ireland</span></div>
        <div class="safety-detail">Call <strong>116 123</strong>. Free, day or night.</div>
      </div>
      <div class="safety-item">
        <div class="safety-name">Other countries</div>
        <div class="safety-detail"><strong>findahelpline.com</strong> lists free, confidential helplines by country.</div>
      </div>
      <div class="safety-item">
        <div class="safety-name">Emergency</div>
        <div class="safety-detail">If you or someone near you is in immediate danger, call your local emergency number (<strong>911</strong> US and Canada, <strong>112</strong> EU and Ireland, <strong>999</strong> UK and Ireland).</div>
      </div>
    </div>
    <p class="modal-sub" style="margin-top: 16px;">Rephrame stores everything on this device — no clinician sees it. If you have one, exporting your journal as Markdown for a session is a good use of the data.</p>
    <div class="modal-actions">
      <button class="btn-modal btn-modal-primary" data-action="close-modal">Got it</button>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════

// Pre-edit text of an inline pivot reflection, keyed by entry id — see the
// edit-reflection binding below. Entries only exist while an edit is in
// flight (set on first keystroke, cleared on blur).
const _reflectionBaseline = new Map();

function bindJournal() {
  document.querySelectorAll('[data-action="toggle-expand"]').forEach(el => {
    const toggle = () => {
      const id = el.dataset.id;
      const card = document.getElementById("entry-" + id);
      const wasExpanded = state.expandedIds.has(id);
      if (wasExpanded) state.expandedIds.delete(id);
      else            state.expandedIds.add(id);
      // Toggle in place rather than calling render(). Body content is
      // already in the DOM; the .expanded class drives the grid-row
      // reveal via CSS. Avoids a full view re-render flash on what's
      // the single most-tapped interaction in the app.
      if (card) card.classList.toggle("expanded", !wasExpanded);
      el.setAttribute("aria-expanded", wasExpanded ? "false" : "true");
      const body = card && card.querySelector(".entry-body-wrap");
      if (body) {
        body.setAttribute("aria-hidden", wasExpanded ? "true" : "false");
        // `inert` keeps the Edit/Copy/Delete buttons inside a collapsed body
        // out of the tab order — focusable content under aria-hidden is an
        // ARIA violation and a keyboard trap.
        if (wasExpanded) body.setAttribute("inert", "");
        else body.removeAttribute("inert");
      }
      // Opening a card near the bottom of the screen unfolds its body under
      // the bottom nav. Scroll it into view while it opens, as one motion,
      // instead of opening it and then jolting the page once it had: work out
      // where its bottom edge is going to land and reveal that now.
      if (!wasExpanded && card) {
        const r = card.getBoundingClientRect();
        const clip = card.querySelector(".entry-body-clip");
        const bottom = r.bottom + (clip ? clip.scrollHeight : 0);
        revealInView(card, { rect: { top: r.top, bottom, width: r.width, height: bottom - r.top } });
      }
    };
    el.addEventListener("click", toggle);
    // The card head is a div acting as a button; give keyboard users the
    // same expand/collapse the pointer gets. Nested real buttons (favorite,
    // flag pills) handle their own keys — ignore bubbled presses from them.
    el.addEventListener("keydown", e => {
      if (e.target !== el) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  });
  document.querySelectorAll('[data-action="toggle-pivot"]').forEach(el => {
    el.addEventListener("click", e => e.stopPropagation());
    el.addEventListener("change", () => {
      const entry = state.entries.find(x => x.id === el.dataset.id);
      if (entry) {
        // Trust the checkbox's actual checked state rather than inverting our
        // stored value — the browser has already applied the change by the
        // time `change` fires, and the previous "!entry.pivotDone" pattern
        // only worked by coincidence.
        entry.pivotDone = el.checked;
        // Stamp a timestamp the first time it's marked done so the entry
        // can show "marked done {when}" next to the reflection prompt.
        if (entry.pivotDone && !entry.pivotDoneAt) entry.pivotDoneAt = new Date().toISOString();
        // Unticking the checkbox clears the done-state but preserves any
        // reflection text the user already wrote — accidentally untoggling
        // shouldn't delete a paragraph of "what happened" notes. If they
        // really want to discard, they can edit the field directly.
        if (!entry.pivotDone) {
          entry.pivotDoneAt = "";
          entry.outcomeRecorded = false;
        }
        // Keep the entry expanded so the reflection field is immediately visible.
        state.expandedIds.add(entry.id);
        touchEntry(entry);
        persist();
        // The "Pivoted" pill and "Step 8 open" flag can wrap the card's
        // meta row, so hold the checkbox still; the reflection field that
        // appears under it opens its slot rather than popping in.
        renderAnchored(el);
        if (entry.pivotDone) {
          const card = document.getElementById("entry-" + entry.id);
          growIn(card && card.querySelector(".pivot-followup"));
        }
        toast(entry.pivotDone ? "Pivot marked done — add a note on what happened" : "Pivot unmarked");
      }
    });
  });
  // Star/coping-card toggle. stopPropagation so tapping the star doesn't
  // also toggle the card's expand/collapse.
  document.querySelectorAll('[data-action="toggle-favorite"]').forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      const entry = state.entries.find(x => x.id === el.dataset.id);
      if (!entry) return;
      entry.isFavorite = !entry.isFavorite;
      touchEntry(entry);
      persist();
      const hadStrip = !!document.querySelector(".coping-strip");
      // The coping strip above the list appears with the first pin and goes
      // with the last unpin; hold the tapped card where it is regardless.
      renderAnchored(document.getElementById("entry-" + entry.id));
      if (entry.isFavorite) {
        const card = document.getElementById("entry-" + entry.id);
        markArrival(card && card.querySelector(".entry-fav-btn"));
        markArrival(hadStrip
          ? Array.from(document.querySelectorAll(".coping-card")).find(c => c.dataset.id === entry.id)
          : document.querySelector(".coping-strip"));
      }
      toast(entry.isFavorite ? "Pinned as a coping card" : "Unpinned");
    });
  });
  // Pivot reflection — save on blur, no explicit save button. Persisting on
  // every keystroke would be noisy; blur is the natural commit boundary.
  // Any non-empty reflection also marks outcomeRecorded so the "Step 8
  // open" flag clears — without this, users who write inline still see
  // the open-step pill until they go through the dedicated outcome page.
  document.querySelectorAll('[data-action="edit-reflection"]').forEach(el => {
    el.addEventListener("click", e => e.stopPropagation());
    // Value at render time == the last persisted reflection (the textarea is
    // rendered from entry.pivotReflection). The blur commit must diff against
    // THIS, not the live entry.pivotReflection, because the input listener
    // below mutates that field on every keystroke — diffing against it would
    // always read "unchanged" and skip persist()/outcomeRecorded/the toast.
    const committed = el.value;
    // Mirror keystrokes into in-memory state so a background render (a P2P
    // merge or a cross-tab storage write, both of which rebuild #view via
    // innerHTML) rebuilds the textarea from the just-typed text instead of
    // discarding it — Chrome doesn't fire `blur` when innerHTML removes the
    // focused node, so blur-only commit would lose the paragraph. The blur
    // handler still owns persistence + the outcomeRecorded transition.
    //
    // After such a re-render the fresh binding's `committed` would be the
    // half-typed text, so blur would read "unchanged" and never record the
    // outcome. Remember the pre-edit baseline on the FIRST keystroke, keyed
    // by entry id, so it survives the rebind.
    el.addEventListener("input", () => {
      const entry = state.entries.find(x => x.id === el.dataset.id);
      if (!entry) return;
      if (!_reflectionBaseline.has(entry.id)) _reflectionBaseline.set(entry.id, committed);
      entry.pivotReflection = el.value;
    });
    el.addEventListener("blur", () => {
      const entry = state.entries.find(x => x.id === el.dataset.id);
      if (!entry) return;
      const v = el.value;
      const base = _reflectionBaseline.has(entry.id) ? _reflectionBaseline.get(entry.id) : committed;
      _reflectionBaseline.delete(entry.id);
      const changed = base !== v;
      const hasText = !!v.trim();
      const wasRecorded = entry.outcomeRecorded;
      // No edit → no state change. (Step 8 can legitimately record an outcome
      // with an empty reflection; a focus-then-blur on the empty inline
      // textarea must not un-record it.)
      if (!changed) return;
      entry.pivotReflection = v;
      entry.outcomeRecorded = hasText;
      touchEntry(entry);
      persist();
      if (hasText && !wasRecorded) {
        render();
        toast("Outcome saved. The loop is closed.");
      } else if (changed) {
        if (!hasText && wasRecorded) render();
        if (hasText) toast("Reflection updated");
      }
    });
  });
  // View-scope chips (All / Favorites / Unfinished / This week / Pivoted / Pivot due).
  document.querySelectorAll('[data-action="set-view-filter"]').forEach(el => {
    // Clear the distortion filter when the scope changes. The distortion
    // chip row is derived from the scoped entries, so switching to a scope
    // with no distortion-bearing entries (e.g. free writes) would hide the
    // row — and with it the active chip and the "All distortions" clear
    // button — leaving an invisible, unclearable filter that also made the
    // empty state claim the scope itself was empty.
    el.addEventListener("click", () => {
      state.viewFilter = el.dataset.value;
      state.filter = "";
      crossFadeJournalList();
    });
  });
  document.querySelectorAll('[data-action="reset-filters"]').forEach(el => {
    el.addEventListener("click", () => {
      state.search = "";
      state.filter = "";
      state.viewFilter = "all";
      crossFadeJournalList();
    });
  });
  // "From a parked worry → / Worked through here →" cross-link buttons
  // that surface on bidirectionally-linked entries. Scroll the target
  // into view and expand its detail body so the user lands on context.
  document.querySelectorAll('[data-action="open-linked"]').forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      const id = el.dataset.id;
      const target = state.entries.find(x => x.id === id);
      if (!target) return;
      state.expandedIds.add(id);
      // The linked entry may be hidden by the active scope chip (e.g. user is
      // on "Worries" and the target is a thought record — or on "Coping" and
      // the target isn't pinned), by the distortion chip, or by a search.
      // Evaluate the real filters against the target instead of guessing
      // from its kind, and clear whichever would hide it.
      ensureEntryVisible(target);
      render();
      // Defer the scroll until after the new DOM lands.
      requestAnimationFrame(() => {
        const node = document.getElementById("entry-" + id);
        if (node) smoothScrollIntoView(node, { block: "start" });
        spotlight(node);
      });
    });
  });
  // "Start a worry / activity / free write" from a kind-filtered empty
  // state. Swap the draft to the right factory and jump into Capture.
  document.querySelectorAll('[data-action="start-kind"]').forEach(el => {
    el.addEventListener("click", () => {
      const kind = el.dataset.kind;
      startFreshDraft(() => {
        const factory =
          kind === "freeform" ? emptyFreeform :
          kind === "activity" ? emptyActivity :
          kind === "worry"    ? emptyWorry    :
                                emptyEntry;
        state.draft = factory();
        state.editingId = null;
        state.captureStep = 1;
        saveDraft(state.draft);
        setView("capture");
      });
    });
  });
  // "Not today" snooze — suppress the nudge banner for 18 hours so the user
  // can dismiss without permanently turning the feature off.
  document.querySelectorAll('[data-action="snooze-nudge"]').forEach(el => {
    el.addEventListener("click", () => {
      const banner = el.closest(".nudge-banner");
      if (banner && banner.classList.contains("is-moving")) return; // already leaving
      state.settings.nudgeSnoozedUntil = Date.now() + 18 * 3600 * 1000;
      saveSettings(state.settings);
      // Close the banner's slot first so the journal slides up into it,
      // then render without it.
      const done = () => { render(); toast("Snoozed for today"); };
      if (banner) animateSlot(banner, "out", done);
      else done();
    });
  });
  // Coping card → jump to underlying entry and expand it.
  document.querySelectorAll('[data-action="jump-to-entry"]').forEach(el => {
    const open = () => {
      const id = el.dataset.id;
      state.expandedIds.add(id);
      // If the entry is filtered out by the current scope / distortion chip /
      // search, clear those so the user actually sees what they tapped.
      ensureEntryVisible(state.entries.find(x => x.id === id));
      render();
      // Defer scroll until after the re-render so getBoundingClientRect lands
      // on the freshly-rendered card.
      requestAnimationFrame(() => {
        const node = document.getElementById("entry-" + id);
        smoothScrollIntoView(node, { behavior: "smooth", block: "start" });
        spotlight(node);
      });
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
  document.querySelectorAll('[data-action="edit"]').forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      const entry = state.entries.find(x => x.id === el.dataset.id);
      if (entry) {
        // Deep-clone: a shallow spread would share the thoughts/moods arrays
        // (and their objects) with the live entry, so edits would corrupt the
        // saved entry even if the user taps Discard.
        state.draft = normalizeEntry(JSON.parse(JSON.stringify(entry)));
        state.editingId = entry.id;
        state.captureStep = 7;
        setView("capture");
      }
    });
  });
  document.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      setState({ modal: { type: "delete", id: el.dataset.id } });
    });
  });
  // Copy a single entry as Markdown — practical for sharing one record with
  // a clinician without exporting the whole journal. Falls back to a hidden
  // textarea + execCommand for older WebKit / non-HTTPS contexts where
  // navigator.clipboard isn't available.
  document.querySelectorAll('[data-action="copy-entry"]').forEach(el => {
    el.addEventListener("click", async e => {
      e.stopPropagation();
      const entry = state.entries.find(x => x.id === el.dataset.id);
      if (!entry) return;
      // Per-kind index so the heading reads "Nth entry of this kind" (e.g.
      // "### Worry 1" for the only worry), matching the full export — not the
      // entry's global position, which numbered a lone worry "### Worry 7".
      const idx = state.entries.filter(x => (x.kind || "thought-record") === (entry.kind || "thought-record")).indexOf(entry);
      const md = entryToMd(entry, idx);
      const tryFallback = () => {
        const ta = document.createElement("textarea");
        ta.value = md;
        ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;";
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch(_) {}
        document.body.removeChild(ta);
        return ok;
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(md);
          toast("Copied as Markdown");
        } else if (tryFallback()) {
          toast("Copied as Markdown");
        } else {
          toast("Couldn't copy — try the Markdown export instead");
        }
      } catch(_) {
        if (tryFallback()) toast("Copied as Markdown");
        else toast("Couldn't copy — try the Markdown export instead");
      }
    });
  });
  document.querySelectorAll('[data-action="filter"]').forEach(el => {
    el.addEventListener("click", () => {
      state.filter = el.dataset.value;
      crossFadeJournalList();
    });
  });
  const search = document.querySelector('[data-action="search"]');
  if (search) search.addEventListener("input", () => {
    // Update state synchronously so the input stays in sync with the
    // value the user is seeing — but defer the re-render through a
    // 150 ms debounce so typing a 6-char word doesn't fire 6 full
    // journal renders (matters when entries.length is large).
    state.search = search.value;
    clearTimeout(state._searchTimer);
    state._searchTimer = setTimeout(() => renderJournalListOnly(), 150);
  });

  document.querySelectorAll('[data-action="resume-draft"]').forEach(el => {
    el.addEventListener("click", () => {
      state.captureStep = 1;
      setView("capture");
    });
  });
  document.querySelectorAll('[data-action="discard-draft"]').forEach(el => {
    el.addEventListener("click", () => setState({ modal: "discard-draft" }));
  });
  document.querySelectorAll('[data-action="goto-capture"]').forEach(el => {
    el.addEventListener("click", () => startFreshDraft(() => {
      state.draft = emptyEntry();
      state.editingId = null;
      state.captureStep = 1;
      // Clear any stale draft from a previous session — without this, closing
      // the tab before typing would resurface the old draft on next launch.
      clearDraft();
      setView("capture");
    }));
  });
  // open-safety and load-sample can appear inside the rendered view (empty
  // state); scope to #view so we don't double-bind the same modal buttons
  // (bindModal handles those). Bindings on re-rendered elements are fresh,
  // so duplicate-listener risk is bounded to one #view subtree.
  document.querySelectorAll('#view [data-action="open-safety"]').forEach(el => {
    el.addEventListener("click", e => { e.preventDefault(); setState({ modal: "safety" }); });
  });
  document.querySelectorAll('#view [data-action="load-sample"]').forEach(el => {
    el.addEventListener("click", () => {
      const exists = state.entries.some(x => x.isSample);
      if (!exists) {
        state.entries = [...makeSampleEntries(), ...state.entries];
        // makeSampleEntries() is oldest-first; restore the newest-first
        // invariant the journal grouping, "No. NN" numbering and Patterns
        // sparkline all assume, instead of leaving inverted date groups.
        state.entries.sort((a, b) =>
          (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
        persist();
      }
      markOnboarded();
      if (exists) render();
      else crossFade(() => { render(); if (!_crossFading) fadeViewIn(); });
      toast(exists ? "Sample entries already loaded" : "Sample entries loaded — tap any to expand");
    });
  });
  // Empty-state "Import backup" button. Scoped to #view to avoid colliding
  // with the same action inside the Settings modal (handled by bindModal).
  document.querySelectorAll('#view [data-action="open-import"]').forEach(el => {
    el.addEventListener("click", () => setState({ modal: "import" }));
  });
  // "Finish this entry" picks up a quick-capture row and drops the user into
  // the full 7-step flow. Trigger is seeded from the hot thought when bare;
  // if thoughts already exist, land on Step 2 (Initial Reaction).
  document.querySelectorAll('[data-action="finish-quick"]').forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      const entry = state.entries.find(x => x.id === el.dataset.id);
      if (!entry) return;
      // Deep-clone for the same reason as the edit handler above: the draft
      // must not alias the live entry's nested arrays.
      state.draft = normalizeEntry(JSON.parse(JSON.stringify(entry)));
      state.editingId = entry.id;
      state.draft.isQuick = false;
      const h = hotThought(state.draft);
      if (!(state.draft.trigger || "").trim() && h && (h.text || "").trim()) {
        state.draft.trigger = String(h.text).slice(0, 500);
      }
      const hasThoughtBody = (state.draft.thoughts || []).some(t => (t.text || "").trim().length > 0);
      state.captureStep = hasThoughtBody ? 2 : 1;
      setView("capture");
    });
  });

  // Tap any "Sample" badge to clear the whole sample set — matches the
  // onboarding promise ("Tap the Sample badge to remove it"). Removed as
  // a bundle (load-sample adds them as a bundle), with undo and tombstones
  // so a paired device doesn't resurrect them.
  document.querySelectorAll('[data-action="remove-samples"]').forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      const removed = state.entries
        .map((entry, idx) => ({ entry, idx }))
        .filter(x => x.entry.isSample);
      if (!removed.length) return;
      const removedIds = new Set(removed.map(x => x.entry.id));
      state.entries = state.entries.filter(x => !removedIds.has(x.id));
      if (typeof syncRecordEntryDeletion === "function") {
        removed.forEach(x => syncRecordEntryDeletion(x.entry.id));
      }
      persist();
      crossFade(() => { render(); if (!_crossFading) fadeViewIn(); });
      toast("Sample entries removed", {
        ms: 6000,
        countdown: true,
        action: {
          label: "Undo",
          onClick: () => {
            // Restore each sample at its chronologically-correct slot
            // (newest-first by createdAt), same approach as single-entry undo.
            removed.forEach(({ entry }) => {
              // Already back (re-saved from an open editor, restored by an
              // import or a peer merge)? Splicing a second copy would give two
              // cards one id — and deleting either would remove both.
              if (state.entries.some(e => e.id === entry.id)) return;
              const t = new Date(entry.createdAt).getTime();
              let insertAt = state.entries.findIndex(
                e => new Date(e.createdAt).getTime() < t
              );
              if (insertAt === -1) insertAt = state.entries.length;
              // Fresh updatedAt so the restore wins over the deletion
              // tombstone a paired device still holds (see single-entry undo).
              touchEntry(entry);
              state.entries.splice(insertAt, 0, entry);
              if (typeof syncClearEntryDeletion === "function") {
                syncClearEntryDeletion(entry.id);
              }
            });
            persist();
            crossFade(() => { render(); if (!_crossFading) fadeViewIn(); });
            toast("Restored");
          },
        },
      });
    });
  });

  // Step 8 entry point — opens the outcome screen for this entry.
  document.querySelectorAll('[data-action="open-outcome"]').forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      state.outcomeEntryId = el.dataset.id;
      setView("outcome");
    });
  });

  // Activity log-completion: opens the log-activity modal pre-loaded with
  // the planned entry so the user fills in actual P/M.
  document.querySelectorAll('[data-action="open-log-activity"]').forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      const entry = state.entries.find(x => x.id === el.dataset.id);
      if (!entry) return;
      state.logActivityDraft = {
        entryId: entry.id,
        actualP: typeof entry.actualP === "number" ? entry.actualP : (entry.predictedP ?? 5),
        actualM: typeof entry.actualM === "number" ? entry.actualM : (entry.predictedM ?? 5),
        notes: entry.activityNotes || "",
      };
      setState({ modal: "log-activity" });
    });
  });

  // Worry resolutions — three terminal actions on a parked worry. Each
  // sets the resolution + resolvedAt and re-renders so the chip updates.
  document.querySelectorAll('[data-action="worry-dissolve"]').forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      const entry = state.entries.find(x => x.id === el.dataset.id);
      if (!entry) return;
      entry.resolution = "dissolved";
      entry.resolvedAt = new Date().toISOString();
      touchEntry(entry);
      persist();
      // Resolving the last due worry removes the worry-time banner above
      // the list; keep the card the user is looking at in place.
      renderAnchored(document.getElementById("entry-" + entry.id));
      toast("Worry let go.");
    });
  });
  document.querySelectorAll('[data-action="worry-postpone"]').forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      const entry = state.entries.find(x => x.id === el.dataset.id);
      if (!entry) return;
      // Bump scheduledFor to the next window. The worry stays parked
      // (resolution stays null) so it reappears in the next worry-window
      // banner — that's the whole point of postponement.
      entry.scheduledFor = computeNextWorryWindow();
      entry.postponeCount = (entry.postponeCount || 0) + 1;
      touchEntry(entry);
      persist();
      renderAnchored(document.getElementById("entry-" + entry.id));
      toast("Postponed to the next worry window.");
    });
  });
  // Escalate: convert a worry into a fresh thought-record draft, pre-filling
  // the trigger + a thought from the worry text. Original worry is marked
  // "escalated" and linked to the new entry.
  document.querySelectorAll('[data-action="worry-escalate"]').forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      const entry = state.entries.find(x => x.id === el.dataset.id);
      if (!entry) return;
      startFreshDraft(() => {
        // Pre-mint the new thought-record's id so the draft can carry a
        // back-link from the start. The worry itself stays parked — we
        // finalize its resolution only when the new entry actually saves
        // (handled in save-entry below), so backing out leaves the worry
        // untouched instead of orphan-linked to a never-saved draft.
        const newEntryId = newId();
        const draft = emptyEntry();
        draft.id = newEntryId;
        const w = ((entry.worryText || "").trim());
        draft.trigger = w.length ? ("Worry: " + (w.length > 400 ? w.slice(0, 397) + "…" : w)) : "Worry (from parked worry)";
        draft.thoughts = [normalizeThought({ text: entry.worryText, isHot: true })];
        draft.linkedEntryId = entry.id;
        state.draft = draft;
        state.editingId = null;
        state.captureStep = 1;
        state.pendingEscalateFromWorryId = entry.id;
        saveDraft(state.draft);
        setView("capture");
      });
    });
  });
}

// A scope or distortion filter swapped the list: cross-fade old list to new,
// or where that isn't available, fade the new list in.
function crossFadeJournalList() {
  crossFade(() => {
    render();
    if (!_crossFading) markArrival(document.querySelector(".journal-list"));
  });
}

function renderJournalListOnly() {
  // Called from the 150ms search-input debounce — the user may have navigated
  // away before the timer fires, and painting journal HTML over another view
  // would desync nav state and drop that view's bindings.
  if (state.view !== "journal") return;
  const view = document.getElementById("view");
  const focused = document.activeElement;
  const isSearch = focused && focused.classList.contains("search-input");
  const cursorPos = isSearch ? focused.selectionStart : null;
  view.innerHTML = renderJournal();
  bindJournal();
  if (isSearch) {
    const newInput = document.querySelector(".search-input");
    if (newInput) {
      newInput.focus();
      if (cursorPos !== null) newInput.setSelectionRange(cursorPos, cursorPos);
    }
  }
}

// Swap the in-flight draft for an empty template of the chosen kind.
// Used by both the immediate "no content yet" path and the post-confirm
// path from the switch-kind modal.
function applyCaptureModeSwitch(kind) {
  const factory =
    kind === "freeform" ? emptyFreeform :
    kind === "activity" ? emptyActivity :
    kind === "worry"    ? emptyWorry    :
                          emptyEntry;
  state.draft = factory();
  state.captureStep = 1;
  state.pendingEscalateFromWorryId = null;
  saveDraft(state.draft);
  crossFade(render);
}

// Guard every "start a brand-new capture" entry point so it can't silently
// wipe a half-written draft. When editing, or when the current draft has no
// content, the action runs immediately; otherwise we stash it and ask first
// via the confirm-new-draft modal (mirrors the switch-kind confirmation).
function startFreshDraft(action) {
  // While editing, state.draft is the edit copy (never autosaved) and an
  // abandoned edit is meant to evaporate silently — but the user's stashed
  // unfinished NEW entry still lives in DRAFT_KEY, and every action passed
  // here goes on to clearDraft() / saveDraft(empty) over it. Check the stash
  // in that case so a half-written entry can't be wiped without the prompt.
  const pending = state.editingId ? loadDraft() : state.draft;
  if (!hasDraftContent(pending)) { action(); return; }
  state.pendingDraftAction = action;
  setState({ modal: "confirm-new-draft" });
}

function finalizeWorryEntry(entry, now) {
  if (entry.kind !== "worry") return entry;
  const out = { ...entry };
  if (typeof out.urgency !== "number") out.urgency = 5;
  if (!out.parkedAt) out.parkedAt = now;
  if (!out.scheduledFor) out.scheduledFor = computeNextWorryWindow();
  return out;
}

// The activity capture renders the predicted P/M sliders at 5/10, but the
// underlying values stay null until dragged. A user who accepts the shown
// default would otherwise save an activity with no prediction — the card
// shows no predicted pills and the predicted-vs-actual lesson has no
// baseline. Persist what the UI displayed (same rationale as
// persistDefaultBeliefsForFilledThoughts).
function finalizeActivityEntry(entry) {
  if (entry.kind !== "activity") return entry;
  const out = { ...entry };
  if (typeof out.predictedP !== "number") out.predictedP = 5;
  if (typeof out.predictedM !== "number") out.predictedM = 5;
  return out;
}

function bindCapture() {
  // The Step 4 grounding note (shown when any mood is ≥80) links to crisis
  // support. It renders inside #view during capture, where neither
  // bindJournal (#view, journal only) nor bindModal (modal-root only) runs —
  // without this binding the link a user in high distress taps does nothing.
  document.querySelectorAll('#view [data-action="open-safety"]').forEach(el => {
    el.addEventListener("click", e => { e.preventDefault(); setState({ modal: "safety" }); });
  });
  // Tap starters on trigger / pivot / parked worry — same append behavior as quick modal.
  document.querySelectorAll('[data-action="insert-capture-starter"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.insertField || btn.dataset.field;
      const seed = btn.dataset.seed || "";
      const el = field
        ? document.querySelector(
          `textarea[data-field="${field}"],select[data-field="${field}"],` +
          `input[data-field="${field}"]:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="button"])`
        )
        : null;
      if (!el || el.type === "checkbox") return;
      const cur = el.value;
      const next = cur.trim()
        ? (cur.replace(/\s+$/, "") + "\n\n" + seed)
        : seed;
      el.value = next;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      focusForUser(el);
      el.setSelectionRange(next.length, next.length);
      refreshNextButton();
    });
  });

  document.querySelectorAll('[data-action="seed-freeform-mood"]').forEach(btn => {
    btn.addEventListener("click", () => {
      if (state.draft.kind !== "freeform") return;
      const family = btn.dataset.family;
      const variants = family ? (EMOTION_FAMILIES[family] || []) : [];
      const variant = variants[0] || "";
      state.draft.moods = state.draft.moods || [];
      const added = normalizeMood({
        family,
        variant,
        intensity: 45,
      });
      state.draft.moods.push(added);
      saveDraft(state.draft);
      render();
      growIn(document.querySelector(`[data-row-id="${added.id}"]`));
    });
  });

  // Entry-kind mode switcher: tap a chip to swap state.draft to the
  // empty-template of that kind. Only enabled when not editing — see
  // renderCapture for the guard.
  document.querySelectorAll('[data-action="set-capture-mode"]').forEach(el => {
    el.addEventListener("click", () => {
      const kind = el.dataset.kind;
      if (state.draft.kind === kind) return;
      // Discard the current empty / scratch draft for a fresh template.
      // The editingId guard in renderCapture hides this chip row entirely
      // for saved entries; for a draft-with-content we ask first so a
      // half-filled new entry isn't silently destroyed.
      if (hasDraftContent(state.draft)) {
        state.pendingModeSwitch = kind;
        setState({ modal: "switch-kind" });
        return;
      }
      applyCaptureModeSwitch(kind);
    });
  });

  // Activity category picker.
  document.querySelectorAll('[data-action="set-activity-category"]').forEach(el => {
    el.addEventListener("click", () => {
      state.draft.category = el.dataset.value || "";
      saveDraft(state.draft);
      render();
    });
  });

  // Generic data-field handler — handles whole-entry scalar fields
  // (trigger, body, bodyCheck, evidence, socratic, reframe, pivot,
  // worryText, urgency, plannedFor, predictedP, predictedM, etc.).
  document.querySelectorAll('[data-field]').forEach(el => {
    const field = el.dataset.field;
    const handler = () => {
      let v;
      if (el.type === "checkbox") v = el.checked;
      else if (el.type === "range") v = parseInt(el.value, 10);
      else if (el.type === "number") v = parseInt(el.value, 10);
      else v = el.value;

      // Socratic type + reframe method: swapping the dropdown updates the help
      // text ("when" / "does") on render, and replaces the prefilled textarea
      // whenever the box is empty OR still exactly matches the *previous*
      // selection's contextual template — customized wording is never smashed.
      if (field === "socraticType") {
        const prevType = state.draft.socraticType;
        state.draft.socraticType = v;
        const qTrim = String(state.draft.socraticQuestion || "").trim();
        const prevMeta = prevType ? SOCRATIC_TYPES.find(s => s.type === prevType) : null;
        const stillPrevStarter =
          !!(prevMeta && prevMeta.template && applyTemplate(prevMeta.template, state.draft).trim() === qTrim);
        if (!v) {
          if (!qTrim || stillPrevStarter) state.draft.socraticQuestion = "";
        }
        else if (!qTrim || stillPrevStarter) {
          const tNew = SOCRATIC_TYPES.find(s => s.type === v);
          if (tNew && tNew.template) state.draft.socraticQuestion = applyTemplate(tNew.template, state.draft);
        }
      }
      else if (field === "reframeMethod") {
        const prevMethod = state.draft.reframeMethod;
        state.draft.reframeMethod = v;
        const ntTrim = String(state.draft.newThought || "").trim();
        const prevMeta = prevMethod ? REFRAME_METHODS.find(r => r.method === prevMethod) : null;
        const stillPrevStarter =
          !!(prevMeta && prevMeta.template && applyTemplate(prevMeta.template, state.draft).trim() === ntTrim);
        // The new method's template shows as the placeholder on the render
        // below. Only clear text that is still an old starter (drafts saved
        // before starters stopped being written in); never write one.
        if (stillPrevStarter) state.draft.newThought = "";
      }
      else {
        state.draft[field] = v;
      }
      saveDraft(state.draft);

      // Inline-update live readouts for the new sliders so we don't
      // re-render mid-drag and lose the user's grab.
      const liveTargets = {
        predictedP:       '[data-slider-display="predP"]',
        predictedM:       '[data-slider-display="predM"]',
        urgency:          '[data-slider-display="urgency"]',
        newThoughtBelief: '[data-slider-display="newThoughtBelief"]',
      };
      if (liveTargets[field]) {
        const node = document.querySelector(liveTargets[field]);
        if (node) node.textContent = String(v);
      }

      if (["socraticType", "reframeMethod"].includes(field)) render();

      // Next-step button reflects validity in the structured flow only.
      const cont = document.querySelector('[data-action="next-step"]');
      if (cont) {
        if (canAdvance(state.captureStep, state.draft)) cont.removeAttribute("disabled");
        else cont.setAttribute("disabled", "");
      }
      // Save button enable/disable for the single-screen kinds.
      const save = document.querySelector('[data-action="save-entry"]');
      if (save && state.draft.kind !== "thought-record") {
        const d = state.draft;
        let ok = false;
        if (d.kind === "freeform") ok = (d.body || "").trim().length > 0;
        else if (d.kind === "activity") ok = (d.body || "").trim().length > 0 && !!d.category && !!d.plannedFor;
        else if (d.kind === "worry") ok = (d.worryText || "").trim().length > 0;
        if (ok) save.removeAttribute("disabled");
        else save.setAttribute("disabled", "");
      }
    };
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
  });

  // ── Step 2 multi-thought handlers ───────────────────────────────────
  // Each thought row carries its own textarea, belief slider, hot radio,
  // and remove button. We mutate state.draft.thoughts in place and avoid
  // re-rendering for text/slider inputs so the user's cursor / drag stays
  // smooth. Hot-radio and add/remove require a render because they change
  // structure.
  function thoughtById(id) {
    return (state.draft.thoughts || []).find(t => t.id === id);
  }
  function moodById(id) {
    return (state.draft.moods || []).find(m => m.id === id);
  }
  function refreshNextButton() {
    const cont = document.querySelector('[data-action="next-step"]');
    if (!cont) return;
    if (canAdvance(state.captureStep, state.draft)) cont.removeAttribute("disabled");
    else cont.setAttribute("disabled", "");
  }

  document.querySelectorAll('[data-action="edit-thought-text"]').forEach(el => {
    el.addEventListener("input", () => {
      const t = thoughtById(el.dataset.id);
      if (!t) return;
      t.text = el.value;
      saveDraft(state.draft);
      refreshNextButton();
    });
  });
  document.querySelectorAll('[data-action="edit-thought-belief"]').forEach(el => {
    el.addEventListener("input", () => {
      const t = thoughtById(el.dataset.id);
      if (!t) return;
      t.beliefBefore = parseInt(el.value, 10);
      const target = document.querySelector('[data-slider-display="belief-' + el.dataset.id + '"]');
      if (target) target.textContent = el.value;
      saveDraft(state.draft);
    });
  });
  document.querySelectorAll('[data-action="set-hot"]').forEach(el => {
    el.addEventListener("change", () => {
      const id = el.dataset.id;
      (state.draft.thoughts || []).forEach(t => { t.isHot = (t.id === id); });
      saveDraft(state.draft);
      // No render — the browser already moved the radio's checked
      // state. Steps 4 and 5 (which derive the hot-thought card from
      // state.draft via hotThought()) aren't on-screen during step 2;
      // they'll render fresh when the user advances. Avoids a step-2
      // view flash on every radio change.
    });
  });
  document.querySelectorAll('[data-action="add-thought"]').forEach(el => {
    el.addEventListener("click", () => {
      state.draft.thoughts = state.draft.thoughts || [];
      const added = normalizeThought({});
      state.draft.thoughts.push(added);
      saveDraft(state.draft);
      render();
      growIn(document.querySelector(`[data-list="thoughts"] [data-row-id="${added.id}"]`));
      // The new row lands where the button was, often right at the sticky
      // footer. Put the caret in it; focusForUser also lifts it into view.
      const ta = document.querySelector(`[data-action="edit-thought-text"][data-id="${added.id}"]`);
      if (ta) focusForUser(ta);
    });
  });
  document.querySelectorAll('[data-action="remove-thought"]').forEach(el => {
    el.addEventListener("click", () => {
      const id = el.dataset.id;
      const list = state.draft.thoughts || [];
      const wasHot = (list.find(t => t.id === id) || {}).isHot;
      state.draft.thoughts = list.filter(t => t.id !== id);
      // Re-assign hot if we removed the hot thought.
      if (wasHot && state.draft.thoughts.length) state.draft.thoughts[0].isHot = true;
      saveDraft(state.draft);
      const gap = measureForGap(el.closest(".row-card"));
      render();
      closeGapAfterRender(gap);
    });
  });

  // ── Step 2 multi-mood handlers ─────────────────────────────────────
  document.querySelectorAll('[data-action="edit-mood-family"]').forEach(el => {
    el.addEventListener("change", () => {
      const m = moodById(el.dataset.id);
      if (!m) return;
      m.family = el.value;
      m.variant = ""; // family change resets variant
      saveDraft(state.draft);
      render();
    });
  });
  document.querySelectorAll('[data-action="edit-mood-variant"]').forEach(el => {
    el.addEventListener("change", () => {
      const m = moodById(el.dataset.id);
      if (!m) return;
      m.variant = el.value;
      saveDraft(state.draft);
    });
  });
  document.querySelectorAll('[data-action="edit-mood-intensity"]').forEach(el => {
    el.addEventListener("input", () => {
      const m = moodById(el.dataset.id);
      if (!m) return;
      const v = parseInt(el.value, 10);
      m.intensity = v;
      const id = el.dataset.id;
      const numEl = document.querySelector('[data-slider-display="mood-' + id + '"]');
      if (numEl) numEl.textContent = v;
      const b = band(v);
      const bn = document.querySelector('[data-slider-band-name="mood-' + id + '"]');
      if (bn) bn.textContent = b.label;
      const bs = document.querySelector('[data-slider-band-sig="mood-' + id + '"]');
      if (bs) bs.textContent = b.signals;
      saveDraft(state.draft);
    });
  });
  document.querySelectorAll('[data-action="edit-mood-estimated"]').forEach(el => {
    el.addEventListener("change", () => {
      const m = moodById(el.dataset.id);
      if (!m) return;
      m.estimated = el.checked;
      saveDraft(state.draft);
    });
  });
  document.querySelectorAll('[data-action="add-mood"]').forEach(el => {
    el.addEventListener("click", () => {
      state.draft.moods = state.draft.moods || [];
      const added = normalizeMood({});
      state.draft.moods.push(added);
      saveDraft(state.draft);
      render();
      // Nothing to type into (the row opens on a select), so just make sure
      // the new row isn't sitting under the sticky footer — once it has
      // finished growing open, so the measurement sees its full height.
      const row = document.querySelector(`[data-list="moods"] [data-row-id="${added.id}"]`);
      growIn(row);
      if (row) setTimeout(() => revealInView(row), motionMs("--dur-medium") + 20);
    });
  });
  document.querySelectorAll('[data-action="remove-mood"]').forEach(el => {
    el.addEventListener("click", () => {
      state.draft.moods = (state.draft.moods || []).filter(m => m.id !== el.dataset.id);
      saveDraft(state.draft);
      const gap = measureForGap(el.closest(".row-card"));
      render();
      closeGapAfterRender(gap);
    });
  });

  // ── Step 5 per-mood / hot-belief re-rate sliders ────────────────────
  document.querySelectorAll('[data-action="edit-hot-belief-after"]').forEach(el => {
    el.addEventListener("input", () => {
      const hot = hotThought(state.draft);
      if (!hot) return;
      hot.beliefAfter = parseInt(el.value, 10);
      const target = document.querySelector('[data-slider-display="hotBeliefAfter"]');
      if (target) target.textContent = el.value;
      saveDraft(state.draft);
    });
  });
  document.querySelectorAll('[data-action="edit-mood-after-reframe"]').forEach(el => {
    el.addEventListener("input", () => {
      const m = moodById(el.dataset.id);
      if (!m) return;
      m.intensityAfterReframe = parseInt(el.value, 10);
      const target = document.querySelector('[data-slider-display="mood-after-' + el.dataset.id + '"]');
      if (target) target.textContent = el.value;
      const bandTarget = document.querySelector('[data-slider-band-name="mood-after-' + el.dataset.id + '"]');
      if (bandTarget) bandTarget.textContent = band(parseInt(el.value, 10)).label;
      saveDraft(state.draft);
    });
  });

  // Update (or insert / remove) the "You picked X" footnote under the
  // distortion grid in place, without going through a full render. Used
  // by the toggle-distortion handler below — calling render() per chip
  // tap was destroying and rebuilding the whole view's DOM and showing
  // as a visible flash on every click.
  function _updateAutoSuggestFootnote() {
    if (state.view !== "capture" || state.captureStep !== 3) return;
    const grid = document.querySelector('.distortion-grid');
    if (!grid) return;
    const fieldGroup = grid.closest('.field-group');
    if (!fieldGroup) return;
    const d = state.draft;
    const primary = (d.distortions || [])[0];
    const sugg = primary ? DISTORTION_DEFAULTS[primary] : null;
    let note = fieldGroup.querySelector('.auto-suggest-note');
    if (!primary || !sugg) {
      if (note) note.remove();
      return;
    }
    if (!note) {
      note = document.createElement('div');
      note.className = 'auto-suggest-note';
      note.setAttribute('role', 'note');
      const hint = fieldGroup.querySelector('.step-hint');
      if (hint && hint.parentNode) hint.parentNode.insertBefore(note, hint.nextSibling);
      else fieldGroup.appendChild(note);
    }
    note.innerHTML =
      '<strong>You picked ' + esc(primary) + '.</strong> ' +
      'The next steps come pre-set with a question type and a reframe style that usually fit — adapt or swap if a different angle lands better for you.';
  }

  document.querySelectorAll('[data-action="toggle-distortion"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.name;
      const prev = state.draft.distortions || [];
      const prevPrimary = prev[0] || "";
      const has = prev.includes(name);
      const next = has ? prev.filter(d => d !== name) : [...prev, name];
      state.draft.distortions = next;
      const nextPrimary = (next[0] || "");
      const primarySwappedOrSet = !!(nextPrimary && nextPrimary !== prevPrimary);

      if (primarySwappedOrSet) {
        const seeded = seedDraftFromPrimaryDistortion(state.draft);
        if (seeded && state.captureStep <= 3) {
          toast("Challenge and Reframe are pre-set to fit this pattern. Change either anytime.");
        } else if (seeded) {
          toast("Challenge and Reframe are pre-set to fit this pattern. Change either anytime.");
        }
      }
      saveDraft(state.draft);
      // No full render — just flip the chip's active class and patch the
      // auto-suggest footnote in place. Challenge / Reframe aren't visible on
      // the Distortion step; their dropdowns and "Suggested for X" pills render
      // fresh from state.draft when the user advances. Avoids the per-click
      // flash that a full re-render was producing.
      btn.classList.toggle("active");
      _updateAutoSuggestFootnote();
    });
  });
  // "Thoughts feel accurate" — opt out of the distortion frame entirely so
  // valid grief / anger / accurate self-criticism aren't pushed through a
  // pathology lens. Re-render so the grid collapses and we don't keep
  // collecting distortions for an entry the user has explicitly marked as
  // non-distorted.
  document.querySelectorAll('[data-action="toggle-accurate"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const turningOn = !state.draft.thoughtsAccurate;
      // Before we drop the distortions list, capture which auto-fill
      // suggestions came from it. We only clear those Socratic/reframe
      // fields if they still exactly match the suggestion (meaning the
      // user never customized them). A user-typed value survives.
      const formerDistortions = turningOn ? [...(state.draft.distortions || [])] : [];
      state.draft.thoughtsAccurate = turningOn;
      if (turningOn) {
        state.draft.distortions = [];
        for (const name of formerDistortions) {
          const def = DISTORTION_DEFAULTS[name];
          if (!def) continue;
          if (state.draft.socraticType === def.socratic) state.draft.socraticType = "";
          if (state.draft.reframeMethod === def.reframe) state.draft.reframeMethod = "";
          const t = SOCRATIC_TYPES.find(s => s.type === def.socratic);
          if (t && t.template && String(state.draft.socraticQuestion || "").trim() === applyTemplate(t.template, state.draft).trim()) state.draft.socraticQuestion = "";
          const r = REFRAME_METHODS.find(m => m.method === def.reframe);
          if (r && r.template && String(state.draft.newThought || "").trim() === applyTemplate(r.template, state.draft).trim()) state.draft.newThought = "";
        }
      }
      saveDraft(state.draft);
      // On Step 3 the distortion grid (~600px) sits right under this tile
      // and comes or goes with it: open or close its space rather than
      // snapping everything below by that much.
      const gridGroup = () => {
        const g = document.querySelector(".capture-screen .distortion-grid");
        return g && g.closest(".field-group");
      };
      const before = gridGroup();
      const gridH = before ? before.getBoundingClientRect().height + (parseFloat(getComputedStyle(before).marginBottom) || 0) : 0;
      render();
      const tile = document.querySelector('.capture-screen [data-action="toggle-accurate"]');
      const tileBox = tile && tile.parentElement;
      if (turningOn && gridH && tileBox) closeGap(tileBox.parentElement, tileBox.nextElementSibling, gridH);
      else if (!turningOn) growIn(gridGroup());
    });
  });

  document.querySelectorAll('[data-action="goto-step"]').forEach(el => {
    el.addEventListener("click", () => {
      const step = parseInt(el.dataset.step, 10);
      if (step > state.captureStep) persistDefaultBeliefsForFilledThoughts(state.draft);
      if (step > state.captureStep) {
        for (let s = state.captureStep; s < step; s++) {
          if (!canAdvance(s, state.draft)) { toast("Complete step " + s + " first"); return; }
        }
      }
      state.captureStep = step;
      flushDraft();
      crossFade(render);
    });
  });

  const next = document.querySelector('[data-action="next-step"]');
  if (next) next.addEventListener("click", () => {
    // Challenge is step 4 (Distortion now precedes it at step 3) — keep the
    // empty-only Socratic pre-fill so leaving the step without typing a
    // question still seeds the chosen type's template into the saved entry.
    if (state.captureStep === 4 && state.draft.socraticType && !String(state.draft.socraticQuestion || "").trim()) {
      const t = SOCRATIC_TYPES.find(s => s.type === state.draft.socraticType);
      if (t && t.template) state.draft.socraticQuestion = applyTemplate(t.template, state.draft);
    }
    if (state.captureStep === 2) persistDefaultBeliefsForFilledThoughts(state.draft);
    state.captureStep++;
    saveDraft(state.draft);
    flushDraft();
    crossFade(render);
  });

  const prev = document.querySelector('[data-action="prev-step"]');
  if (prev) prev.addEventListener("click", () => {
    state.captureStep--;
    flushDraft();
    crossFade(render);
  });

  const save = document.querySelector('[data-action="save-entry"]');
  if (save) save.addEventListener("click", () => {
    persistDefaultBeliefsForFilledThoughts(state.draft);
    const now = new Date().toISOString();
    const entriesBefore = state.entries;
    let savedToast;
    let savedId;
    if (state.editingId) {
      savedId = state.editingId;
      let updated = { ...state.draft, id: state.editingId, updatedAt: now };
      updated = finalizeWorryEntry(updated, now);
      updated = finalizeActivityEntry(updated);
      // If the entry vanished mid-edit (a "Replace everything" import, or a
      // delete in another tab that the storage listener pulled in), .map()
      // would match nothing and silently drop the edit under a success toast.
      // Re-insert it instead so the user's writing is never lost.
      if (state.entries.some(e => e.id === state.editingId)) {
        state.entries = state.entries.map(e => e.id === state.editingId ? updated : e);
      } else {
        state.entries = [updated, ...state.entries];
        state.entries.sort((a, b) =>
          (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
      }
      savedToast = "Entry updated";
    } else {
      // Honor a pre-assigned draft.id (used by worry-escalate to set up
      // bidirectional linking before the new entry exists). Otherwise mint
      // a fresh id — including when the draft's id already exists in the
      // journal, which happens when an edit-in-progress draft from an older
      // session is resumed as a new capture; reusing it would create two
      // entries with one id, and deleting either would destroy both.
      savedId = (state.draft.id && !state.entries.some(e => e.id === state.draft.id))
        ? state.draft.id : newId();
      let entry = { ...state.draft, id: savedId, createdAt: clampDate(now) };
      entry = finalizeWorryEntry(entry, now);
      entry = finalizeActivityEntry(entry);
      state.entries = [entry, ...state.entries];
      savedToast = "Entry saved";
    }
    // Finalize a deferred worry-escalation: now that the thought-record
    // is real, point the original worry at it and mark it resolved. The
    // in-memory pendingEscalateFromWorryId is lost across a reload, so for a
    // NEW entry fall back to the draft's own linkedEntryId (set when the
    // escalation started) — otherwise a resumed escalation draft saved in a
    // later session would leave the worry stuck "Parked" while the new record
    // still shows a "From a parked worry" link to it. If the worry was
    // deleted in the meantime, save still succeeds but we flag the broken link.
    //
    // Trust only the draft that is actually being saved: it carries the
    // back-link from the moment the escalation started. The transient
    // pendingEscalateFromWorryId flag survives "Journal → Edit some other
    // entry → Save" (edit/finish-quick/goto-capture never clear it), and
    // honoring it there stamped the worry as "worked through" and linked it
    // to whatever unrelated entry happened to be saved next.
    const escalateWorryId = (!state.editingId && state.draft.linkedEntryId) || null;
    let worryNote = null;
    let worryRollback = null;
    if (escalateWorryId) {
      const w = state.entries.find(x => x.id === escalateWorryId && x.kind === "worry");
      if (w && !w.resolution) {
        worryRollback = { w, resolution: w.resolution, resolvedAt: w.resolvedAt, linkedEntryId: w.linkedEntryId, updatedAt: w.updatedAt };
        w.resolution = "escalated";
        w.resolvedAt = now;
        w.linkedEntryId = savedId;
        // Stamp the change or it never reaches a paired device: the merge is
        // last-write-wins on updatedAt, and the peer's copy carried the same
        // stamp, so it kept showing the worry as parked forever.
        touchEntry(w);
      } else if (!w) {
        worryNote = "Original worry was deleted — thought record saved separately.";
      }
    }
    state.pendingEscalateFromWorryId = null;
    // Only claim success, clear the autosaved draft and leave Capture once
    // the write reached disk. On a quota failure persist() has shown the
    // blocking quota-error modal; wiping the draft at that point would have
    // left the entry in memory only — gone on the next reload.
    if (!persist()) {
      state.entries = entriesBefore;
      if (worryRollback) {
        const r = worryRollback;
        r.w.resolution = r.resolution; r.w.resolvedAt = r.resolvedAt;
        r.w.linkedEntryId = r.linkedEntryId; r.w.updatedAt = r.updatedAt;
      }
      return;
    }
    toast(savedToast);
    if (worryNote) toast(worryNote);
    // Saving an EDIT must not clear the stashed new-entry draft (edits are
    // never autosaved to DRAFT_KEY); reload it so its resume banner returns.
    const wasEditing = !!state.editingId;
    if (!wasEditing) clearDraft();
    state.draft = wasEditing ? (loadDraft() || emptyEntry()) : emptyEntry();
    state.editingId = null;
    state.captureStep = 1;
    setView("journal");
  });

  const discard = document.querySelector('[data-action="discard-capture"]');
  if (discard) discard.addEventListener("click", () => {
    if (hasDraftContent(state.draft)) setState({ modal: "discard-draft" });
    else {
      const wasEditing = !!state.editingId;
      if (!wasEditing) clearDraft();
      state.draft = wasEditing ? (loadDraft() || emptyEntry()) : emptyEntry();
      state.editingId = null;
      state.captureStep = 1;
      state.pendingEscalateFromWorryId = null;
      setView("journal");
    }
  });
}

// User-triggered close: X / Cancel / Done, a backdrop tap, Escape. The exit
// animation and the return of focus to the opener happen in renderModal(),
// which every close goes through, including the ones that follow an action.
function closeModal() {
  if (!state.modal) return;
  // Dismissing the Import dialog without importing must also forget a file
  // the OS handed us at launch — otherwise a Settings → Import tap hours
  // later would silently import that old file with no picker shown.
  if (state.modal === "import") window._reframeLaunchedFile = null;
  // Any in-flight kind-switch request is implicitly cancelled when the
  // modal closes (via Escape, overlay click, or the X button). The
  // explicit Cancel button already clears this; doing it here too
  // keeps the state clean for every close path.
  state.pendingModeSwitch = null;
  setState({ modal: null });
}

function bindModal() {
  const modalRoot = document.getElementById("modal-root");
  const mq = (sel) => modalRoot ? modalRoot.querySelector(sel) : null;
  const mqa = (sel) => modalRoot ? modalRoot.querySelectorAll(sel) : [];

  // Populate the P2P sync panel inside the Settings modal. renderSyncPanel
  // (js/sync.js) builds its own markup and wires its own listeners against
  // the live sync state, so it survives Rephrame's full-modal re-renders.
  if (state.modal === "settings" && typeof renderSyncPanel === "function") renderSyncPanel();

  // Scoped to #modal-root: the journal empty state renders its own
  // open-import / open-safety buttons inside #view, which bindJournal wires.
  // Document-wide queries here would double-bind those while a modal is open.
  mqa('[data-action="close-modal"]').forEach(el => {
    // The overlay carries data-action="close-modal" and now outlives an
    // in-place re-render of the dialog, so binding has to be idempotent —
    // otherwise every click inside Settings would stack another close
    // handler on it. Buttons inside the dialog are rebuilt each time and
    // never carry the flag.
    if (el.dataset.closeBound === "1") return;
    el.dataset.closeBound = "1";
    el.addEventListener("click", e => {
      if (e.currentTarget === e.target || el.tagName === "BUTTON") {
        closeModal();
      }
    });
  });
  mqa('[data-action="open-safety"]').forEach(el => {
    el.addEventListener("click", e => { e.preventDefault(); setState({ modal: "safety" }); });
  });

  // Reachable from inside the Settings modal. Switching state.modal
  // closes Settings and opens the targeted modal — Single-step nav, no
  // nested-modal stacking.
  mqa('[data-action="open-export"]').forEach(el => {
    el.addEventListener("click", () => setState({ modal: "export" }));
  });
  mqa('[data-action="open-import"]').forEach(el => {
    el.addEventListener("click", () => setState({ modal: "import" }));
  });

  // ── PIN / privacy lock controls ────────────────────────────────────
  document.querySelectorAll('[data-action="open-set-pin"]').forEach(el => {
    el.addEventListener("click", () => {
      state.pinForm = { current: "", next: "", confirm: "", error: "" };
      setState({ modal: "set-pin" });
    });
  });
  document.querySelectorAll('[data-action="open-remove-pin"]').forEach(el => {
    el.addEventListener("click", () => {
      state.pinForm = { current: "", next: "", confirm: "", error: "" };
      setState({ modal: "remove-pin" });
    });
  });
  document.querySelectorAll('[data-action="lock-now"]').forEach(el => {
    el.addEventListener("click", () => {
      markLocked();
      state.locked = true;
      state.modal = null;
      state.lockError = "";
      render();
      // Take sync down with the lock: nothing is sent or accepted while the
      // lock screen is up. js/sync.js restarts it on "rephrame:unlocked".
      try { window.dispatchEvent(new CustomEvent("rephrame:locked")); } catch (_) {}
    });
  });

  // Keep state.pinForm synced so a validation-error re-render restores every
  // field instead of blanking them (forcing the user to retype a correct
  // current PIN just to fix a mismatch typo). No render() on input.
  const _syncPin = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => { state.pinForm[key] = el.value; });
  };
  _syncPin("pinCurrent", "current");
  _syncPin("pinNew", "next");
  _syncPin("pinConfirm", "confirm");
  _syncPin("pinCurrentRemove", "current");

  // Surface a wait message when locked out instead of the misleading
  // "Current PIN is incorrect" (verifyPin refuses unconditionally while
  // locked out, so a correct PIN would otherwise read as wrong).
  const _lockoutMsg = () => {
    const wait = pinLockoutMsLeft();
    return wait > 0 ? "Too many tries. Wait " + Math.ceil(wait / 1000) + "s before another attempt." : "";
  };

  const setPinForm = document.getElementById("pinSetForm");
  if (setPinForm) setPinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const isChanging = hasPin();
    const next = (document.getElementById("pinNew").value || "").trim();
    const confirm = (document.getElementById("pinConfirm").value || "").trim();
    const current = isChanging ? (document.getElementById("pinCurrent").value || "").trim() : "";
    if (isChanging && !current) { state.pinForm.error = "Enter your current PIN first."; render(); return; }
    if (!/^[0-9]{4,8}$/.test(next))   { state.pinForm.error = "PIN must be 4–8 digits."; render(); return; }
    if (next !== confirm)             { state.pinForm.error = "The two PINs don't match."; render(); return; }
    if (isChanging) {
      const locked = _lockoutMsg();
      if (locked) { state.pinForm.error = locked; render(); return; }
      const ok = await verifyPin(current);
      if (!ok) { state.pinForm.error = _lockoutMsg() || "Current PIN is incorrect."; render(); return; }
    }
    await setStoredPin(next);
    state.pinForm = { current: "", next: "", confirm: "", error: "" };
    setState({ modal: "settings" });
    toast(isChanging ? "PIN updated" : "PIN set");
  });

  const removePinForm = document.getElementById("pinRemoveForm");
  if (removePinForm) removePinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const current = (document.getElementById("pinCurrentRemove").value || "").trim();
    if (!current) { state.pinForm.error = "Enter your current PIN to remove it."; render(); return; }
    const locked = _lockoutMsg();
    if (locked) { state.pinForm.error = locked; render(); return; }
    const ok = await verifyPin(current);
    if (!ok) { state.pinForm.error = _lockoutMsg() || "Current PIN is incorrect."; render(); return; }
    clearStoredPin();
    state.pinForm = { current: "", next: "", confirm: "", error: "" };
    setState({ modal: "settings" });
    toast("PIN removed");
  });

  // Theme + reminder choice cards — radiogroup pattern. Re-render so the
  // active styling moves to the newly picked card and the theme applies
  // immediately.
  document.querySelectorAll('[data-action="set-theme"]').forEach(el => {
    el.addEventListener("click", () => {
      state.settings.theme = el.dataset.value;
      saveSettings(state.settings);
      switchThemeSmoothly(() => { applyTheme(); render(); });
    });
  });
  document.querySelectorAll('[data-action="set-reminder"]').forEach(el => {
    el.addEventListener("click", () => {
      state.settings.reminderInterval = el.dataset.value;
      // Clear the snooze whenever the user changes interval; otherwise an
      // old snooze could silently suppress a freshly-enabled reminder.
      state.settings.nudgeSnoozedUntil = 0;
      saveSettings(state.settings);
      render();
    });
  });
  document.querySelectorAll('[data-action="set-worry-window-time"]').forEach(el => {
    el.addEventListener("change", () => {
      const v = el.value;
      // input[type=time] always returns HH:MM in 24-hour form (or empty).
      // Fall back to the default if the user somehow clears it.
      state.settings.worryWindowTime = v || "18:00";
      saveSettings(state.settings);
      // Existing parked worries were scheduled against the old window
      // time; without rescheduling they'd surface at the old time (or
      // not at all). Recompute scheduledFor for every unresolved worry
      // so the new setting takes effect immediately.
      let rescheduled = 0;
      state.entries.forEach(e => {
        if (e.kind === "worry" && !e.resolution) {
          e.scheduledFor = computeNextWorryWindow();
          touchEntry(e);
          rescheduled++;
        }
      });
      // Persist only — no render(). Chromium fires `change` on a time input
      // every time a segment edit yields a valid value (typing "1","7" into
      // the hours is already "17:00"), and a full render rebuilds #modal-root,
      // destroying the focused input mid-edit. Nothing in Settings displays
      // the rescheduled values; the journal picks them up on its next render.
      if (rescheduled > 0) persist();
    });
  });

  // Print export. Expanding all entries gives the print dialog a full
  // transcript; printMode tells renderEntryCard to render expanded regardless
  // of state.expandedIds. We restore on afterprint.
  const printBtn = document.querySelector('[data-action="export-print"]');
  if (printBtn) printBtn.addEventListener("click", () => {
    state.printMode = true;
    // Settings (and so Export) opens from the topbar on every view. The
    // option promises "every entry expanded", so print the journal itself,
    // not whichever of Patterns / Reference / Capture happened to be open,
    // and put the user back where they were afterwards.
    const prevView = state.view;
    state.view = "journal";
    setState({ modal: null });
    // Defer to the next frame so the re-render lands before the print dialog
    // captures the document.
    requestAnimationFrame(() => {
      const restore = () => {
        state.printMode = false;
        state.view = prevView;
        window.removeEventListener("afterprint", restore);
        render();
      };
      window.addEventListener("afterprint", restore);
      window.print();
      // Safari iOS doesn't fire afterprint reliably — fall back on a timeout.
      setTimeout(() => { if (state.printMode) restore(); }, 2000);
    });
  });

  // Quick-capture modal — live wire the textarea + slider to a working draft,
  // then create a real entry on save. isQuick=true surfaces a "Finish this
  // entry" CTA in the journal; ventOnly=true means the user explicitly chose
  // not to do further work, so we skip the CTA and treat the entry as final.
  const qt = document.getElementById("quickThought");
  const qi = document.getElementById("quickIntensity");
  const qid = document.getElementById("quickIntensityDisplay");
  const qib = document.getElementById("quickIntensityBand");
  const qv = document.getElementById("quickVentOnly");
  if (qt) qt.addEventListener("input", () => {
    state.quickDraft = state.quickDraft || { thought: "", intensity: 60, ventOnly: false };
    state.quickDraft.thought = qt.value;
  });

  // Tap-to-insert starter prompts. Seeds the textarea (or appends if the
  // user has already written something) and refocuses + moves the caret
  // to the end so they can keep typing.
  document.querySelectorAll('[data-action="insert-quick-prompt"]').forEach(btn => {
    btn.addEventListener("click", () => {
      if (!qt) return;
      const seed = btn.dataset.seed || "";
      const cur = qt.value;
      const next = cur.trim()
        ? (cur.replace(/\s+$/, "") + "\n\n" + seed)
        : seed;
      qt.value = next;
      state.quickDraft = state.quickDraft || { thought: "", intensity: 60, ventOnly: false };
      state.quickDraft.thought = next;
      focusForUser(qt);
      qt.setSelectionRange(next.length, next.length);
    });
  });
  if (qi) qi.addEventListener("input", () => {
    state.quickDraft = state.quickDraft || { thought: "", intensity: 60, ventOnly: false };
    const v = parseInt(qi.value, 10);
    const wasHigh = state.quickDraft.intensity >= 80;
    state.quickDraft.intensity = v;
    if (qid) qid.textContent = v;
    if (qib) qib.textContent = band(v).label;
    // Show / hide the grounding note as the user crosses the threshold. Swap
    // it in place rather than calling renderModal() — re-rendering mid-drag
    // flashed the modal and dropped the user's grip on the slider.
    if ((v >= 80) !== wasHigh) {
      const noteWrap = document.getElementById("quickIntensityNote");
      if (noteWrap) {
        noteWrap.innerHTML = quickIntensityNoteHTML(v);
        noteWrap.querySelectorAll('[data-action="open-safety"]').forEach(el => {
          el.addEventListener("click", e => { e.preventDefault(); setState({ modal: "safety" }); });
        });
      }
    }
  });
  if (qv) qv.addEventListener("change", () => {
    state.quickDraft = state.quickDraft || { thought: "", intensity: 60, ventOnly: false };
    state.quickDraft.ventOnly = qv.checked;
  });
  const saveQuick = document.querySelector('[data-action="save-quick"]');
  if (saveQuick) saveQuick.addEventListener("click", () => {
    const q = state.quickDraft || { thought: "", intensity: 60, ventOnly: false };
    const thought = (q.thought || "").trim();
    if (!thought) { toast("Write something first — even one word"); return; }
    const now = new Date().toISOString();
    // Park the thought as the (hot) first thought and the intensity as the
    // single mood — the user can flesh out family/variant later if they
    // pick the entry up via "Finish this entry".
    const entry = {
      ...emptyEntry(),
      id: newId(),
      createdAt: clampDate(now),
      thoughts: [normalizeThought({ text: thought, isHot: true })],
      moods: [normalizeMood({ intensity: q.intensity, estimated: true })],
      isQuick: !q.ventOnly,
      // Vent-only captures are deliberately complete as-is — they must not be
      // counted as full thought records in Patterns (they'd inflate the
      // record count and permanently drag down the pivot follow-through ring).
      isVent: !!q.ventOnly,
    };
    state.entries = [entry, ...state.entries];
    // Keep the modal (and the typed text) if the write failed on quota,
    // rather than closing with a false "Captured" toast.
    if (!persist()) { state.entries = state.entries.filter(e => e !== entry); return; }
    state.quickDraft = null;
    setState({ modal: null });
    toast(q.ventOnly ? "Named. That's enough." : "Captured. No need to finish — only if you want.");
  });

  // ── Log-activity modal handlers ────────────────────────────────────
  // Live readout for the two sliders, persist user-typed notes, save
  // back to the entry on submit.
  const aP = document.getElementById("actualP");
  const aM = document.getElementById("actualM");
  const aN = document.getElementById("actualNotes");
  if (aP) aP.addEventListener("input", () => {
    state.logActivityDraft = state.logActivityDraft || {};
    state.logActivityDraft.actualP = parseInt(aP.value, 10);
    const d = document.getElementById("actualPDisplay");
    if (d) d.textContent = aP.value;
  });
  if (aM) aM.addEventListener("input", () => {
    state.logActivityDraft = state.logActivityDraft || {};
    state.logActivityDraft.actualM = parseInt(aM.value, 10);
    const d = document.getElementById("actualMDisplay");
    if (d) d.textContent = aM.value;
  });
  if (aN) aN.addEventListener("input", () => {
    state.logActivityDraft = state.logActivityDraft || {};
    state.logActivityDraft.notes = aN.value;
  });
  const saveLog = document.querySelector('[data-action="save-log-activity"]');
  if (saveLog) saveLog.addEventListener("click", () => {
    const d = state.logActivityDraft;
    if (!d) return;
    const entry = state.entries.find(x => x.id === d.entryId);
    if (!entry) return;
    entry.actualP = d.actualP;
    entry.actualM = d.actualM;
    entry.activityNotes = d.notes;
    entry.completedAt = new Date().toISOString();
    touchEntry(entry);
    // Only close the modal + claim success if the write reached disk; on a
    // quota failure persist() has already surfaced the quota-error modal.
    if (!persist()) return;
    state.logActivityDraft = null;
    state.expandedIds.add(entry.id);
    setState({ modal: null });
    toast("Logged. Compare the predicted vs actual to learn.");
  });

  // Onboarding modal handlers — scoped to #modal-root so we don't
  // accidentally bind the journal empty-state "Load an example" button
  // sitting underneath the welcome dialog.
  const loadSample = mq('[data-action="load-sample"]');
  if (loadSample) loadSample.addEventListener("click", () => {
    const exists = state.entries.some(e => e.isSample);
    if (!exists) {
      state.entries = [...makeSampleEntries(), ...state.entries];
      // See the other load-sample handler: keep entries newest-first.
      state.entries.sort((a, b) =>
        (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
      persist();
    }
    markOnboarded();
    setState({ modal: null });
    if (!exists) fadeViewIn();
    toast(exists ? "Sample entries already loaded" : "Sample entries loaded — tap any to expand");
  });
  const onboardBegin = mq('[data-action="onboard-begin"]');
  if (onboardBegin) onboardBegin.addEventListener("click", () => {
    markOnboarded();
    state.modal = null;
    startFreshDraft(() => {
      state.draft = emptyEntry();
      state.editingId = null;
      state.captureStep = 1;
      setView("capture");
    });
  });
  const onboardSkip = mq('[data-action="onboard-skip"]');
  if (onboardSkip) onboardSkip.addEventListener("click", () => {
    markOnboarded();
    setState({ modal: null });
  });

  const md = document.querySelector('[data-action="export-md"]');
  if (md) md.addEventListener("click", async () => {
    // Prepend a short header so the file isn't anonymous and so a reader
    // (often a clinician, the user reviewing on a hard day, or future-self)
    // knows what they're looking at and how to read it.
    const header = [
      "# Rephrame — thought records",
      "",
      "*Exported " + new Date().toISOString().slice(0, 10) + " from Rephrame (a private CBT journal). ",
      "Patterns here are most useful when reviewed with a clinician, not interpreted alone. ",
      "Single entries are snapshots of one moment — the work is across many of them.*",
      "",
    ].join("\n");
    // Yield to the event loop every 50 entries so the UI stays responsive
    // on large journals — entryToMd is non-trivial and a synchronous map
    // over 500+ entries would jank the modal close + toast animations.
    let body;
    if (state.entries.length === 0) {
      body = "*No entries yet.*";
    } else {
      // Snapshot the list so the awaited yields below can't let a background
      // mutation (undo timer firing persist, a storage/sync merge) shift
      // indices mid-loop and skip or duplicate entries in the output. Number
      // each heading per-kind ("### Worry N" = the Nth worry), not by global
      // position, so a lone worry isn't labelled by where it sits overall.
      const snapshot = state.entries.slice();
      const perKind = Object.create(null);
      const parts = [];
      for (let i = 0; i < snapshot.length; i++) {
        const e = snapshot[i];
        const k = e.kind || "thought-record";
        perKind[k] = (perKind[k] || 0) + 1;
        parts.push(entryToMd(e, perKind[k] - 1));
        if (i > 0 && i % 50 === 0) await new Promise(r => setTimeout(r, 0));
      }
      body = parts.join("\n");
    }
    download(header + "\n" + body, "reframes-" + new Date().toISOString().slice(0, 10) + ".md", "text/markdown");
    setState({ modal: null });
    toast("Markdown exported");
  });
  const json = document.querySelector('[data-action="export-json"]');
  if (json) json.addEventListener("click", () => {
    download(JSON.stringify(state.entries, null, 2), "reframes-" + new Date().toISOString().slice(0, 10) + ".json", "application/json");
    setState({ modal: null });
    toast("JSON exported");
  });
  const mergeBtn = document.querySelector('[data-action="import-merge"]');
  if (mergeBtn) mergeBtn.addEventListener("click", () => triggerImport("merge"));
  const replaceBtn = document.querySelector('[data-action="import-replace"]');
  if (replaceBtn) replaceBtn.addEventListener("click", () => triggerImport("replace"));

  const del = document.querySelector('[data-action="confirm-delete"]');
  if (del) del.addEventListener("click", () => {
    const id = del.dataset.id;
    // Remember the entry and its position so Undo can put it back exactly
    // where it was, not pinned to the top of the list.
    const idx = state.entries.findIndex(e => e.id === id);
    const removed = idx >= 0 ? state.entries[idx] : null;
    if (idx < 0) { setState({ modal: null }); return; }
    state.entries = state.entries.filter(e => e.id !== id);
    // Drop a dangling log-activity draft if it referenced the deleted
    // entry. The modal handles missing entries gracefully but it's
    // cleaner to clear the state.
    if (state.logActivityDraft?.entryId === id) state.logActivityDraft = null;
    // Clear any worry that pointed at this entry via escalation, so the
    // worry detail view doesn't render a dead "open the thought record"
    // link. Remember which worries we cleared so Undo can restore them.
    const relinkOnUndo = [];
    state.entries.forEach(e => {
      if (e.kind === "worry" && e.linkedEntryId === id) {
        relinkOnUndo.push(e.id);
        e.linkedEntryId = "";
        touchEntry(e);
      }
    });
    // Record a deletion tombstone so a paired device can't resurrect this
    // entry on the next P2P merge.
    if (typeof syncRecordEntryDeletion === "function") syncRecordEntryDeletion(id);
    persist();
    // Measure the card before the render drops it (or its whole date group,
    // when it was that day's only entry) so its space closes smoothly.
    const goneCard = document.getElementById("entry-" + id);
    const goneGroup = goneCard && goneCard.closest(".date-group");
    const goneWhole = !!(goneGroup && goneGroup.querySelectorAll(".entry-card").length === 1);
    const gap = measureForGap(goneWhole ? goneGroup : goneCard);
    setState({ modal: null });
    closeGapAfterRender(gap, goneWhole ? "" : "gap-closer--card");
    toast("Entry deleted", {
      ms: 6000,
      countdown: true,
      action: {
        label: "Undo",
        onClick: () => {
          // The entry may already be back: an editor still open on it saved
          // (the save path re-inserts a vanished entry), or an import / peer
          // merge restored it while the toast was up. A second splice would
          // leave two cards sharing one id, and deleting either removes both.
          if (state.entries.some(e => e.id === removed.id)) {
            toast("That entry is already back in the journal");
            return;
          }
          // Restore at the chronologically-correct slot rather than the
          // pre-delete index. Entries are newest-first by createdAt, so
          // find the first entry older than `removed` and splice before
          // it. Handles the case where the user added entries while the
          // toast was up (which would otherwise misplace the restored
          // entry).
          const removedTime = new Date(removed.createdAt).getTime();
          let insertAt = state.entries.findIndex(
            e => new Date(e.createdAt).getTime() < removedTime
          );
          if (insertAt === -1) insertAt = state.entries.length;
          // Stamp updatedAt so the restore beats the deletion tombstone in
          // last-write-wins merges. Clearing our local tombstone below isn't
          // enough on its own: a paired device still holds the tombstone
          // (tombstone merges are union-only), and without a fresh timestamp
          // its next patch would re-delete the restored entry.
          touchEntry(removed);
          state.entries.splice(insertAt, 0, removed);
          if (typeof syncClearEntryDeletion === "function") syncClearEntryDeletion(removed.id);
          // Restore any worry back-references we cleared on delete.
          if (relinkOnUndo.length) {
            const ids = new Set(relinkOnUndo);
            state.entries.forEach(e => {
              if (ids.has(e.id) && e.kind === "worry") e.linkedEntryId = removed.id;
            });
          }
          persist();
          render();
          growEntry(removed.id);
          toast("Restored");
        },
      },
    });
  });

  const discardDraft = document.querySelector('[data-action="confirm-discard-draft"]');
  if (discardDraft) discardDraft.addEventListener("click", () => {
    // Discarding an EDIT must not clear the stashed new-entry draft (edits
    // are never autosaved to DRAFT_KEY); restore it so its resume banner
    // comes back. Discarding a new-entry draft clears the stash as before.
    const wasEditing = !!state.editingId;
    if (!wasEditing) clearDraft();
    state.draft = wasEditing ? (loadDraft() || emptyEntry()) : emptyEntry();
    state.editingId = null;
    state.captureStep = 1;
    state.pendingEscalateFromWorryId = null;
    setState({ modal: null });
    setView("journal");
    toast("Draft discarded");
  });

  // Mode-switch confirmation (chip tapped while draft had content).
  const confirmSwitch = document.querySelector('[data-action="confirm-mode-switch"]');
  if (confirmSwitch) confirmSwitch.addEventListener("click", () => {
    const kind = state.pendingModeSwitch;
    state.pendingModeSwitch = null;
    state.modal = null;
    if (kind) applyCaptureModeSwitch(kind);
    else render();
  });
  const cancelSwitch = document.querySelector('[data-action="cancel-mode-switch"]');
  if (cancelSwitch) cancelSwitch.addEventListener("click", () => {
    state.pendingModeSwitch = null;
    setState({ modal: null });
  });

  // Confirm/cancel for "start a new entry" over a draft with content.
  const confirmNewDraft = document.querySelector('[data-action="confirm-new-draft"]');
  if (confirmNewDraft) confirmNewDraft.addEventListener("click", () => {
    const action = state.pendingDraftAction;
    state.pendingDraftAction = null;
    state.modal = null;
    if (typeof action === "function") action();
    else render();
  });
  const cancelNewDraft = document.querySelector('[data-action="cancel-new-draft"]');
  if (cancelNewDraft) cancelNewDraft.addEventListener("click", () => {
    state.pendingDraftAction = null;
    setState({ modal: null });
  });
}

// Process a JSON backup file (from the file picker OR a manifest
// file_handler launch) into state.entries. Both code paths go through
// here so import behavior stays consistent.
// localStorage tops out around 5 MB, so a backup an order of magnitude past
// that can never be stored and would only burn memory/time in JSON.parse on a
// low-end phone. Reject early with the same styled error toast the parse-failure
// path uses, before reading the file into memory.
const IMPORT_MAX_BYTES = 25 * 1024 * 1024;

function processImportFile(file, mode) {
  if (file && typeof file.size === "number" && file.size > IMPORT_MAX_BYTES) {
    toast("That backup is too large to import (over 25 MB). It may be the wrong file.",
          { variant: "error", persist: true });
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error("Not a valid backup");
      // Normalize every record through the schema migrator so old / hand-
      // edited backups don't crash renderers, and dedupe by id so the same
      // backup re-imported in replace mode doesn't double up entries.
      const normalized = imported
        .filter(x => x && typeof x === "object")
        .map(normalizeEntry);
      const dedupedById = [...new Map(normalized.map(e => [e.id, e])).values()];
      let importedCount;
      if (mode === "replace") {
        // Record tombstones for every entry being wiped, so a paired device
        // doesn't union its still-live copies straight back on the next merge
        // (a bare replace with no tombstones silently resurrects everything).
        if (typeof syncRecordEntryDeletion === "function") {
          const keep = new Set(dedupedById.map(e => e.id));
          state.entries.forEach(e => { if (!keep.has(e.id)) syncRecordEntryDeletion(e.id); });
        }
        state.entries = dedupedById;
        importedCount = dedupedById.length;
      } else {
        const existing = new Set(state.entries.map(x => x.id));
        const adds = dedupedById.filter(x => !existing.has(x.id));
        state.entries = [...adds, ...state.entries];
        importedCount = adds.length;
      }
      // Clear any deletion tombstone for an imported id: restoring a
      // previously-deleted entry from a backup must not be re-killed by its
      // stale tombstone on the next sync merge.
      if (typeof syncClearEntryDeletion === "function") {
        dedupedById.forEach(e => {
          // The paired device still holds the tombstone, and tombstone merges
          // are union-only: an entry restored with its backup-era updatedAt
          // loses to it and vanishes again on the next exchange. Re-stamp the
          // ones we are resurrecting (same as undo-delete does).
          if (typeof syncHasEntryDeletion === "function" && syncHasEntryDeletion(e.id)) touchEntry(e);
          syncClearEntryDeletion(e.id);
        });
      }
      // Restore the newest-first invariant the journal grouping, sparkline
      // slice and undo-splice logic all rely on — a merged backup's entries
      // land at the top regardless of age otherwise.
      state.entries.sort((a, b) =>
        (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
      // Only claim success + close if the write reached disk; on a quota
      // failure persist() has already surfaced the blocking quota-error modal.
      if (!persist()) return;
      setState({ modal: null });
      if (importedCount > 0) fadeViewIn();
      toast(importedCount === 0
        ? "Nothing new to import — every entry was already in the journal"
        : "Imported " + importedCount + (importedCount === 1 ? " entry" : " entries"));
    } catch (err) {
      // Replace native alert() — out of design and unstylable — with a
      // persistent error toast carrying the same information.
      toast("Couldn't read that backup — " + (err && err.message ? err.message : "invalid file"),
            { variant: "error", persist: true });
    }
  };
  reader.onerror = () => {
    toast("Couldn't read that file — the browser reported a read error.",
          { variant: "error", persist: true });
  };
  reader.readAsText(file);
}

function triggerImport(mode) {
  // If a file came in via the manifest file_handler (Window Launch Queue
  // API), use it directly instead of prompting for another picker — the
  // user already picked the file at the OS level.
  if (window._reframeLaunchedFile) {
    const f = window._reframeLaunchedFile;
    window._reframeLaunchedFile = null;
    processImportFile(f, mode);
    return;
  }
  const input = document.getElementById("import-file");
  input.dataset.mode = mode;
  input.click();
}

document.getElementById("import-file").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const mode = e.target.dataset.mode;
  processImportFile(file, mode);
  e.target.value = "";
});

document.querySelectorAll(".nav-item").forEach(b => {
  b.addEventListener("click", () => {
    const v = b.dataset.nav;
    if (v === "capture") {
      if (!state.editingId && !hasDraftContent(state.draft)) {
        const d = loadDraft();
        if (d) state.draft = d;
        state.captureStep = 1;
      }
    }
    // A different view jumps to the top as it renders (see render()). The
    // tab already showing scrolls back up smoothly instead: there's nothing
    // new arriving, so the motion is the whole feedback for the tap.
    const sameView = state.view === v;
    setView(v);
    if (sameView) smoothScrollTo({ top: 0, behavior: "smooth" });
  });
});
// Static-topbar buttons. Bound once at startup so we don't stack listeners
// on every journal re-render. (open-import / open-export used to live in
// the topbar too; they're now reached through the Settings modal and the
// empty state, so their bindings have moved into bindModal and bindJournal
// where the buttons actually render.)
document.querySelectorAll('[data-action="open-quick"]').forEach(b =>
  b.addEventListener("click", () => {
    // Resume an unsaved quick draft: closing the modal (Escape / backdrop)
    // doesn't discard the text — a successful save nulls quickDraft, so a
    // lingering one with content means the user backed out mid-thought.
    if (!(state.quickDraft && (state.quickDraft.thought || "").trim())) {
      state.quickDraft = { thought: "", intensity: 60, ventOnly: false };
    }
    setState({ modal: "quick" });
  }));
document.querySelectorAll('[data-action="open-settings"]').forEach(b =>
  b.addEventListener("click", () => setState({ modal: "settings" })));

document.addEventListener("keydown", e => {
  // The lock screen owns the keyboard: no modal is rendered behind it, and
  // closeModal() on a stray state.modal would re-render the lock form and
  // wipe a half-typed PIN.
  if (state.locked) return;
  if (e.key === "Escape") {
    if (state.modal) closeModal();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    // A modal owns the shortcut while it's open. The capture view's Next /
    // Save buttons are still in the DOM underneath, and firing them from
    // inside the quick-capture (or a confirm) dialog advanced the step or
    // saved the edit behind the user's back, then rebuilt the modal.
    if (state.modal) {
      if (state.modal === "quick") {
        const saveQuick = document.querySelector('[data-action="save-quick"]');
        if (saveQuick) { e.preventDefault(); saveQuick.click(); }
      }
      return;
    }
    if (state.view === "capture") {
      // Structured flow: advance a step. Single-screen kinds (freeform /
      // activity / worry) never render a next-step button — fall through to
      // Save so the shortcut works for them too.
      const next = state.captureStep < 7
        ? document.querySelector('[data-action="next-step"]') : null;
      if (next) {
        if (!next.hasAttribute("disabled")) next.click();
      } else {
        const save = document.querySelector('[data-action="save-entry"]');
        if (save) save.click();
      }
    }
  }
});

// Honor ?nav=<view> from PWA shortcuts (e.g. "Capture" tile on the home
// screen passes ?nav=capture). Whitelist views so a bad value can't push us
// into an unknown render branch. Also honor ?openfile=1 from the manifest's
// file_handlers — opens the Import modal so the user picks the backup
// deliberately (the URL alone doesn't carry the chosen file's contents).
(function applyLaunchNav(){
  try {
    const params = new URLSearchParams(location.search || '');
    const v = params.get('nav');
    if (v && ['journal','capture','patterns','reference'].includes(v)) {
      state.view = v;
    }
    if (params.get('openfile') === '1') {
      state.pendingOpenImport = true;
    }
  } catch(_) {}
})();

// Boot-time lock check. If a PIN is set and this tab session hasn't unlocked
// it, the lock screen takes over from the first render. We don't show
// onboarding behind the lock screen because the gate is more important than
// a welcome card.
(function initLock(){
  try {
    if (hasPin() && !isUnlocked()) {
      state.locked = true;
    }
  } catch(_) {}
})();

// First-launch onboarding: only fires when there are zero entries, the
// "onboarded" flag isn't set, AND the app isn't currently locked. All three
// gates matter — someone with a backup or a dismissed onboarding shouldn't
// see it, and the lock screen takes precedence.
(function maybeShowOnboarding(){
  try {
    if (state.locked) return;
    const onboarded = localStorage.getItem(ONBOARDED_KEY) === "1";
    if (!onboarded && state.entries.length === 0) {
      state.modal = "onboarding";
    }
  } catch(_) {}
})();

// Keyboard avoidance: a three-layer fix. The viewport meta tag handles
// Chromium/Firefox by shrinking the layout viewport when the VK rises;
// the .kb-open CSS slides bottom-nav off so it can't occlude focused
// fields; this IIFE detects the keyboard on both platforms and lifts a
// field the user tapped clear of the keyboard and the sticky chrome.
//
// The scrolling here is deliberately conservative. An earlier version
// re-centred the focused field on *every* visualViewport event, including
// the `scroll` events the user's own panning produces — so scrolling away
// from a textarea you hadn't blurred yanked the page straight back to it,
// over and over. Three rules prevent that now:
//   1. Only focus the user caused (a tap on the field or its label, a Tab,
//      focusForUser()) may scroll. Code that restores or seeds focus does
//      it with preventScroll on purpose.
//   2. After that first reveal, only a keyboard-height *change* (a resize)
//      may scroll. Panning the visual viewport updates the CSS and nothing
//      else.
//   3. A hand-driven scroll (touch or wheel) switches auto-scrolling off
//      until the next tap on a field, so the app never fights the user for
//      the scroll position.
// A field that's already fully visible is never scrolled at all.
(function initKeyboardAvoidance(){
  const vv = window.visualViewport;
  // Fields that raise a soft keyboard. Checkboxes, radios and sliders take
  // focus too, but revealing a slider as it's grabbed would scroll the page
  // out from under the finger dragging it.
  const TEXT_FIELD = 'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"])' +
    ':not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"])' +
    ':not([type="file"]):not([type="color"]):not([type="image"])';
  const isTextField = el => !!(el && el.matches && el.matches(TEXT_FIELD));
  let lastFocused = null;
  // Permission to move the page on the user's behalf. Granted when they
  // tap a field, revoked the moment they scroll by hand or leave it.
  let mayAutoScroll = false;
  let lastKbH = 0;

  // What the user last pressed, and when: tells a tap on the field apart
  // from code focusing it (a step's first field, a dialog re-rendered in
  // place, a sync merge restoring the caret).
  let pressTarget = null, pressAt = 0, tabAt = 0;
  document.addEventListener('pointerdown', e => { pressTarget = e.target; pressAt = Date.now(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Tab') tabAt = Date.now(); }, true);
  const userCausedFocus = el => {
    if (el === _focusRequestedFor) return true;
    const now = Date.now();
    if (now - tabAt < 600) return true;
    if (!pressTarget || now - pressAt > 1200) return false;
    if (el === pressTarget || el.contains(pressTarget)) return true;
    const label = pressTarget.closest && pressTarget.closest('label');
    return !!(label && label.control === el);
  };

  // Keyboard height. iOS lays the keyboard over the page, so the visual
  // viewport shrinks and the window doesn't. Android with
  // interactive-widget=resizes-content shrinks both, so innerHeight minus
  // vv.height read ~0 there: .kb-open never switched on, and the bottom nav
  // plus the Continue bar stayed parked above the keyboard with the field
  // behind them. Measure against the tallest height seen at this width
  // instead, and only while a text field has focus — nothing else raises a
  // keyboard, and a desktop window resized mid-typing shouldn't count.
  let fullW = window.innerWidth;
  let fullH = window.innerHeight;
  const kbHeight = () => {
    if (!vv) return 0;
    const typing = isTextField(document.activeElement);
    if (window.innerWidth !== fullW) { fullW = window.innerWidth; fullH = window.innerHeight; }
    else if (!typing) fullH = window.innerHeight;
    else fullH = Math.max(fullH, window.innerHeight);
    return typing ? Math.max(0, fullH - vv.height) : 0;
  };

  const reveal = () => {
    if (mayAutoScroll && lastFocused && document.activeElement === lastFocused) {
      revealInView(lastFocused, { block: 'center' });
    }
  };
  // Look twice: once the focus ring has painted, and again after the
  // keyboard and the chrome sliding out of its way (--dur-short transitions)
  // have settled. The second look is free when the first one sufficed.
  let settleTimer = 0;
  const scheduleReveal = settleMs => {
    requestAnimationFrame(() => requestAnimationFrame(reveal));
    clearTimeout(settleTimer);
    settleTimer = setTimeout(reveal, settleMs);
  };

  document.addEventListener('focusin', e => {
    const t = e.target;
    if (!isTextField(t)) return;
    lastFocused = t;
    mayAutoScroll = userCausedFocus(t);
    if (mayAutoScroll) scheduleReveal(450);
  });
  // A tap on the field that already has focus: on Android the back button
  // hides the keyboard without blurring, and tapping the field again brings
  // the keyboard back with no focusin to react to. Capture phase: dialogs
  // stop click propagation at .modal, so a bubbling listener never hears
  // taps inside Settings or quick capture.
  document.addEventListener('click', e => {
    const t = e.target;
    if (!isTextField(t) || document.activeElement !== t) return;
    lastFocused = t;
    mayAutoScroll = true;
    scheduleReveal(450);
  }, true);
  document.addEventListener('focusout', e => {
    if (e.target === lastFocused) { lastFocused = null; mayAutoScroll = false; }
  });

  // Hand-driven scrolling wins, permanently, until the next tap on a field.
  // Listening for touchmove/wheel rather than `scroll` keeps this
  // unambiguous: our own programmatic scrolls fire `scroll`, never these.
  const yieldToUser = () => { mayAutoScroll = false; };
  window.addEventListener('touchmove', yieldToUser, { passive: true });
  window.addEventListener('wheel', yieldToUser, { passive: true });

  if (vv) {
    const syncKbCss = () => {
      // 150px threshold to ignore URL-bar chrome shifts. A real keyboard is
      // always at least ~250px tall.
      const h = kbHeight();
      const kbUp = h > 150;
      document.body.classList.toggle('kb-open', kbUp);
      document.documentElement.style.setProperty('--keyboard-h', kbUp ? h + 'px' : '0px');
      return { h, kbUp };
    };
    // resize = the keyboard opened, closed, or changed height (a predictive
    // bar appearing, say). That's the only event that can strand a field
    // behind the VK, so it's the only one allowed to scroll.
    vv.addEventListener('resize', () => {
      const { h, kbUp } = syncKbCss();
      const changed = Math.abs(h - lastKbH) > 24;
      lastKbH = h;
      if (changed && kbUp) scheduleReveal(300);
    });
    // scroll = the viewport was panned. Keep the CSS in sync; never scroll.
    vv.addEventListener('scroll', syncKbCss);
  }
})();

// Something the user opened that grows downward: a <details> expander (the
// body region reference, "All question types") or a journal entry. Near the
// bottom of the screen its new content unfolds straight under the sticky
// Continue bar or the bottom nav, and the user had to scroll to find what
// they'd just opened. Bring it into view, keeping its heading on screen.
(function initRevealOnExpand(){
  // `toggle` also fires for a <details> rendered already open, so only react
  // to one the user just clicked open.
  let opening = null;
  document.addEventListener('click', e => {
    const s = e.target.closest && e.target.closest('summary');
    const d = s && s.parentElement;
    opening = (d && d.tagName === 'DETAILS' && !d.open) ? d : null;
  }, true);
  document.addEventListener('toggle', e => {
    const d = e.target;
    if (d !== opening) return;
    opening = null;
    if (d.open) requestAnimationFrame(() => revealInView(d));
  }, true);
})();

// Last-resort safety net. The app swallows expected failures locally (best-
// effort storage writes, sync send errors), but a genuinely unexpected throw
// or rejected promise would otherwise vanish silently — leaving the user
// staring at a half-rendered screen with no idea anything broke. Surface one
// quiet error toast and keep logging to the console for diagnosis. A short
// dedupe window stops a tight error loop from stacking dozens of toasts.
(function initGlobalErrorNet(){
  let lastShown = 0;
  const notify = (label, detail) => {
    console.warn('[rephrame] ' + label, detail);
    const now = Date.now();
    if (now - lastShown < 4000) return;   // don't spam on repeated throws
    lastShown = now;
    if (typeof toast === 'function') {
      toast('Something went wrong — your entries are safe. Reload if the app looks stuck.',
            { variant: 'error' });
    }
  };
  window.addEventListener('error', e => {
    // Ignore resource-load errors (e.g. a font 404) — those are handled by the
    // SW fallback and aren't app-logic failures worth alarming the user over.
    if (e && e.target && e.target !== window && e.target.tagName) return;
    notify('uncaught error', (e && (e.error || e.message)) || e);
  });
  window.addEventListener('unhandledrejection', e => {
    notify('unhandled rejection', e && e.reason);
  });
})();

applyTheme();
render();

// If launched via the manifest's file_handler (?openfile=1), open the
// Import modal once the first render is done so the user can pick the
// JSON backup they want to restore. Behind a PIN lock this waits for the
// unlock (see the lock form's success branch) — setting state.modal while
// locked left a phantom modal behind the lock screen.
function _openPendingImport() {
  if (!state.pendingOpenImport || state.locked) return;
  state.pendingOpenImport = false;
  setState({ modal: "import" });
}
_openPendingImport();

// A shortcut or file launch that reaches an ALREADY-OPEN window (manifest
// launch_handler "focus-existing") arrives via js/pwa.js as this event, not
// as a navigation — apply it the same way applyLaunchNav() does at boot.
window.addEventListener("rephrame:launch", (e) => {
  let params;
  try { params = new URL(String(e.detail), location.href).searchParams; } catch (_) { return; }
  const v = params.get("nav");
  if (v && ["journal", "capture", "patterns", "reference"].includes(v) && !state.locked) {
    if (state.modal) state.modal = null;
    setView(v);
  }
  if (params.get("openfile") === "1") {
    state.pendingOpenImport = true;
    _openPendingImport();
  }
});

// Hold the boot fade-in until web fonts (Fraunces + Manrope + JetBrains
// Mono) have actually loaded. Otherwise the display=swap reflow happens
// *after* the app is visible — every line shifts vertically when the
// custom fonts replace the system fallbacks, which is the "down to up"
// glitch users were seeing. Cap the wait at 1500 ms so a flaky network
// can never strand the screen on the parchment background.
const _unfreezeBoot = () => requestAnimationFrame(() =>
  document.body.classList.remove("is-booting"));
if (document.fonts && document.fonts.ready) {
  Promise.race([
    document.fonts.ready,
    new Promise(r => setTimeout(r, 1500)),
  // Two-arg .then — if document.fonts.ready ever rejects (rare:
  // network error, browser bug), the race rejects and a bare .then()
  // would never fire, leaving the parchment background up forever.
  // Calling _unfreezeBoot on either outcome guarantees we always
  // un-freeze within at most 1500 ms.
  ]).then(_unfreezeBoot, _unfreezeBoot);
} else {
  // Very old engines without the CSS Font Loading API — fall back to
  // the original two-rAF gate so the fade still plays.
  requestAnimationFrame(() => requestAnimationFrame(_unfreezeBoot));
}

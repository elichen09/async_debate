// Reading-time math + calibration data shared by the Read-doc bar (ReadTimer) and
// the Read-doc view (ReadDocView). Kept in one place so the per-block chips and the
// whole-doc estimate use the exact same model.

export const RATES_KEY = "flow.readRates.v1";
export interface Settings { cardWpm: number; tagWpm: number; fatiguePct: number }
// Reading aloud for delivery: card text flows faster than tags/cites, which you
// slow down on for clarity. fatiguePct = how much slower the card text reads by
// the 4-min mark (PF's longest speech). Used until you calibrate / edit.
export const DEFAULT_SETTINGS: Settings = { cardWpm: 160, tagWpm: 110, fatiguePct: 12 };
export const FATIGUE_MAX_PCT = 30; // slider ceiling

// The speech length the read-doc estimate is measured against. Persisted so it
// survives reloads and follows you across flows; editable from the Read-doc bar
// and seeded into the speech timer. Not every speech is 4:00, so it's adjustable.
export const SPEECH_KEY = "flow.speechSec.v1";
export const DEFAULT_SPEECH_SEC = 240; // PF's longest speech — a sensible default
// Quick-pick lengths spanning the common speech times.
export const SPEECH_PRESETS: readonly number[] = [120, 180, 240, 300, 360, 420, 480];
export function clampSpeechSec(sec: number): number {
  if (!isFinite(sec)) return DEFAULT_SPEECH_SEC;
  return Math.min(3600, Math.max(15, Math.round(sec)));
}
export function loadSpeechSec(): number {
  if (typeof window === "undefined") return DEFAULT_SPEECH_SEC;
  try {
    const raw = localStorage.getItem(SPEECH_KEY);
    if (raw != null) { const n = parseInt(raw, 10); if (isFinite(n)) return clampSpeechSec(n); }
  } catch { /* ignore */ }
  return DEFAULT_SPEECH_SEC;
}
export function saveSpeechSec(sec: number): number {
  const clean = clampSpeechSec(sec);
  try { localStorage.setItem(SPEECH_KEY, String(clean)); } catch { /* ignore */ }
  return clean;
}

function shuffle<T>(arr: readonly T[]): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// Reading-test material: real highlighted card reads (CARD_POOL) and real
// tag + author/date lines (TAG_POOL) pulled from a 1NC. The test pulls a random
// few of these in random order each time, so each run (and retest) differs.
const CARD_POOL: readonly string[] = [
  "a strategy of reengagement the new free world must be forged through selective engagement and disciplined ambition a world shaped by the hard realities of coalition-building the goal is not a rules-based order that pleases everyone",
  "Some contend that the United States could preserve peace by stepping back from Ukraine Taiwan or both even if that means risking the expansion of authoritarian spheres China might expand in East Asia and Russia might solidify control over parts of Ukraine proponents often invoke the Cold War as precedent but the analogy is dangerously inapt the former Soviet Union also had incentives to maintain the status quo because it was defending borders of victory",
  "Russia and China are animated by the opposite impulse not to defend borders of victory but to erase borders of defeat Putin and Xi are not trying to preserve the status quo they are trying to reverse their nations historical defeats Ukraine and Taiwan aren't end points they're starting lines",
  "Granting China or Russia small parts of these spheres might not satisfy them but rather empower them to expand further control of Taiwan would expand China's ability to project military power into the Western Pacific the PLA could deploy submarines aircraft and surveillance assets that would threaten U.S. forces forcing the United States to either escalate into space-based warfare or retreat Taiwan's fall would undermine the credibility of U.S. alliances",
  "the danger for China lies not in immediate scarcity but in disorder a United States that is simply weaker is manageable one that is unpredictable violent and unconstrained is far more perilous what Beijing fears is not that Washington will lose power but that it will wield its remaining power in ways that make the world harder to navigate the greatest threat to China's ambitions may not be American strength but American instability",
  "it is useful to have the ability to conduct war in the hands of a single person because of the relative speed with which one actor can mobilize national security decisions like mobilizing for war could suffer through leaks and lengthy discussion if they must occur within the halls of Congress changes to the existing system that could undermine deterrence should be avoided",
  "the nuclear arsenal must always work as intended adversaries must believe this to be the case such doubts could cause an adversary to launch a preemptive attack if the president orders a nuclear launch but congressional dawdling fails to authorize the command then the always is undermined adversaries will begin to doubt the readiness of the United States and might seek to capitalize on this vulnerability",
  "the spread of nuclear weapons in Asia poses two kinds of threats the first is that of a deliberate decision taken for nuclear first strike either in mistaken fear of imminent attack or as a preventive war to destroy a rising opponent the second is that of inadvertent escalation growing out of a conventional war the possibility of accidental use of nuclear forces due to military usurpation or technical malfunction",
  "Trump attacked the Supreme Court majority that ruled against him with a venom he has never directed against America's foreign enemies his feelings were hurt someone told him no and he was going to lash out he tried to deflect attention from Epstein with a wag the dog foray into Venezuela wounded he will be more dangerous unable to play within the rules he will work harder to cheat come election time Trump is now likely to effectively end free and fair elections in America",
  "three of the conflict-related risks were judged to be both highly threatening to U.S. interests and highly likely to occur the leading concern is a homegrown one potential domestic terrorism and political violence especially around the presidential election America's ability to promote democracy abroad will take an immediate hit adversaries will take advantage of America's internal divisions to pursue their regional aims",
  "the ongoing war in Ukraine could escalate tensions between Taiwan and China could easily morph into open conflict North Korea shows no sign of becoming any less belligerent the United States should try to avert the worst this will become nigh on impossible if America succumbs to further political polarization conflict prevention must now begin at home",
];
const TAG_POOL: readonly string[] = [
  "The US weathers the storm now, but Russia and China are revisionist. History proves that ceding power causes aggression, extinction. Beckley 25.",
  "Specifically, US volatility deters China now. Conversely, a more stable US causes escalation. Liu 26.",
  "The aff decks US readiness through slow and corrupt Congressional approval, emboldening perceptual adversary escalation and global nuclear proliferation. Whitlark 19.",
  "Global proliferation opens up multiple vectors to nuclear escalation. Cimbala and Lowther 23.",
  "Constraining Trump causes lashes out, that causes diversionary wars and election fraud. Rothkopf 26.",
  "Civil unrest escalates every conflict. Stares 24.",
];
// Pull a random subset, in random order, and join into one passage.
export const pickCardSample = () => shuffle(CARD_POOL).slice(0, 2).join(" ");
export const pickTagSample = () => shuffle(TAG_POOL).slice(0, 3).join(" ");

export function countWords(s: string): number {
  return (s.trim().match(/\S+/g) ?? []).length;
}
export function fmt(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function clampWpm(w: number): number {
  if (!isFinite(w) || w <= 0) return 0;
  return Math.min(600, Math.max(40, Math.round(w)));
}
export function avgWordLen(s: string): number {
  const words = s.trim().match(/\S+/g) ?? [];
  if (!words.length) return 0;
  return words.reduce((n, w) => n + w.length, 0) / words.length;
}
// Baseline word length of the calibration material. The rates were measured on
// it, so a doc with longer words than this reads slower (and shorter, faster).
const CARD_CAL_LEN = avgWordLen(CARD_POOL.join(" "));
const TAG_CAL_LEN = avgWordLen(TAG_POOL.join(" "));

// Reading slows on (a) longer words and (b) long stretches (fatigue).
const WORDLEN_ALPHA = 0.6;  // how strongly word length matters (0 = not at all)
const FRESH_SEC = 20;       // the first seconds read at the fresh, calibrated pace
const FATIGUE_SCALE = 35;   // seconds; how quickly the log curve ramps in
const FOUR_MIN = 240;       // PF's longest speech — fatiguePct is the slowdown by here

// WPM multiplier for word length: <1 when the doc's words run longer than the
// calibration words. Dampened (^alpha) and clamped so it can't run away.
function lenFactor(docLen: number, calLen: number): number {
  if (!docLen || !calLen) return 1;
  return Math.min(1.2, Math.max(0.6, Math.pow(calLen / docLen, WORDLEN_ALPHA)));
}
// Solve the log coefficient so the penalty hits exactly fatiguePct at 4:00.
function fatigueCoef(pct: number): number {
  const denom = Math.log(1 + Math.max(0, FOUR_MIN - FRESH_SEC) / FATIGUE_SCALE);
  return denom > 0 ? (pct / 100) / denom : 0;
}

// Estimated read time (seconds): apply each rate, adjusted for word length.
// Fatigue (driven by total time on feet, log growth) then inflates ONLY the card
// text — tags/cites are read deliberately for clarity and don't fatigue.
export function estimateSeconds(bodyWords: number, tagWords: number, bodyLen: number, tagLen: number, s: Settings): number {
  const cardRate = s.cardWpm * lenFactor(bodyLen, CARD_CAL_LEN);
  const tagRate = s.tagWpm * lenFactor(tagLen, TAG_CAL_LEN);
  const baseCard = cardRate ? bodyWords / cardRate * 60 : 0;
  const baseTag = tagRate ? tagWords / tagRate * 60 : 0;
  const raw = 1 + fatigueCoef(s.fatiguePct) * Math.log(1 + Math.max(0, baseCard + baseTag - FRESH_SEC) / FATIGUE_SCALE);
  const fatigue = Math.min(1 + s.fatiguePct / 100, raw); // can't exceed the 4-min penalty
  return baseCard * fatigue + baseTag;
}

// One card (or block title) of the read doc: a heading/cite read at tag pace, body
// read at card pace. Carries word counts + lengths so each part can be estimated.
export interface ReadSeg {
  key: string;
  heading: { level: number; text: string } | null;
  cite: string;            // author/date line, "" if none
  body: string;            // merged highlighted body, "" if a cut/title-only card
  bodyWords: number; tagWords: number; bodyLen: number; tagLen: number;
}

// Break read-doc HTML into segments: a heading starts a new one; the cite and body
// paragraphs that follow belong to it. Leading content before any heading forms a
// headingless segment. Used for the per-card time chips.
export function segmentRead(html: string): ReadSeg[] {
  if (typeof DOMParser === "undefined") return [];
  const dom = new DOMParser().parseFromString(html || "", "text/html");
  const segs: ReadSeg[] = [];
  let cur: { level: number; text: string } | null = null;
  let cites: string[] = [];
  let bodies: string[] = [];
  let i = 0;
  const flush = () => {
    if (!cur && !cites.length && !bodies.length) return;
    const cite = cites.join(" ").trim();
    const body = bodies.join(" ").trim();
    const tagText = `${cur?.text ?? ""} ${cite}`.trim();
    segs.push({
      key: `s${i++}`,
      heading: cur,
      cite,
      body,
      bodyWords: countWords(body),
      tagWords: countWords(tagText),
      bodyLen: avgWordLen(body),
      tagLen: avgWordLen(tagText),
    });
    cur = null; cites = []; bodies = [];
  };
  Array.from(dom.body.children).forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent ?? "").trim();
    if (/^h[1-6]$/.test(tag)) {
      flush();
      cur = { level: parseInt(tag[1], 10), text };
    } else if (el.classList.contains("rd-cite")) {
      if (text) cites.push(text);
    } else if (text) {
      bodies.push(text);
    }
  });
  flush();
  return segs;
}

// Whole-doc word/length split (body vs tags+cites) for the total estimate.
export function analyze(readHtml: string) {
  const segs = segmentRead(readHtml);
  const body = segs.map((s) => s.body).filter(Boolean).join(" ");
  const tag = segs.map((s) => `${s.heading?.text ?? ""} ${s.cite}`.trim()).filter(Boolean).join(" ");
  return {
    bodyWords: countWords(body), tagWords: countWords(tag),
    bodyLen: avgWordLen(body), tagLen: avgWordLen(tag),
    bodyText: body, tagText: tag,
  };
}

export function loadSettings(): Settings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(RATES_KEY);
    const r = raw ? JSON.parse(raw) : null;
    if (r && r.cardWpm && r.tagWpm) {
      return { cardWpm: r.cardWpm, tagWpm: r.tagWpm, fatiguePct: typeof r.fatiguePct === "number" ? r.fatiguePct : DEFAULT_SETTINGS.fatiguePct };
    }
  } catch { /* ignore */ }
  return null;
}

// Clamp to sane bounds and persist; returns the cleaned settings.
export function saveSettings(s: Settings): Settings {
  const clean: Settings = {
    cardWpm: clampWpm(s.cardWpm),
    tagWpm: clampWpm(s.tagWpm),
    fatiguePct: Math.min(FATIGUE_MAX_PCT, Math.max(0, Math.round(s.fatiguePct))),
  };
  try { localStorage.setItem(RATES_KEY, JSON.stringify(clean)); } catch { /* ignore */ }
  return clean;
}

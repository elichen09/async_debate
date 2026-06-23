"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Date.now()/Math.random() live at module scope so the purity lint stays happy
// (they only fire from event handlers / intervals, never during render).
const nowMs = () => Date.now();
function shuffle<T>(arr: readonly T[]): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

const RATES_KEY = "flow.readRates.v1";
interface Settings { cardWpm: number; tagWpm: number; fatiguePct: number }
// Reading aloud for delivery: card text flows faster than tags/cites, which you
// slow down on for clarity. fatiguePct = how much slower the card text reads by
// the 4-min mark (PF's longest speech). Used until you calibrate / edit.
const DEFAULT_SETTINGS: Settings = { cardWpm: 160, tagWpm: 110, fatiguePct: 12 };
const FATIGUE_MAX_PCT = 30; // slider ceiling

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
const pickCardSample = () => shuffle(CARD_POOL).slice(0, 2).join(" ");
const pickTagSample = () => shuffle(TAG_POOL).slice(0, 3).join(" ");

function countWords(s: string): number {
  return (s.trim().match(/\S+/g) ?? []).length;
}
function fmt(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function clampWpm(w: number): number {
  if (!isFinite(w) || w <= 0) return 0;
  return Math.min(600, Math.max(40, Math.round(w)));
}
function avgWordLen(s: string): number {
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
function estimateSeconds(bodyWords: number, tagWords: number, bodyLen: number, tagLen: number, s: Settings): number {
  const cardRate = s.cardWpm * lenFactor(bodyLen, CARD_CAL_LEN);
  const tagRate = s.tagWpm * lenFactor(tagLen, TAG_CAL_LEN);
  const baseCard = cardRate ? bodyWords / cardRate * 60 : 0;
  const baseTag = tagRate ? tagWords / tagRate * 60 : 0;
  const raw = 1 + fatigueCoef(s.fatiguePct) * Math.log(1 + Math.max(0, baseCard + baseTag - FRESH_SEC) / FATIGUE_SCALE);
  const fatigue = Math.min(1 + s.fatiguePct / 100, raw); // can't exceed the 4-min penalty
  return baseCard * fatigue + baseTag;
}

// Count the read-doc words you read slowly (tags + cites) vs at card pace (body),
// plus each group's average word length, so the estimate can adjust per group.
function analyze(readHtml: string) {
  if (typeof DOMParser === "undefined") return { bodyWords: 0, tagWords: 0, bodyLen: 0, tagLen: 0, bodyText: "", tagText: "" };
  const dom = new DOMParser().parseFromString(readHtml || "", "text/html");
  const body: string[] = [];
  const tags: string[] = [];
  Array.from(dom.body.children).forEach((el) => {
    const text = (el.textContent ?? "").trim();
    if (!text) return;
    const isTag = /^h[1-6]$/.test(el.tagName.toLowerCase()) || el.classList.contains("rd-cite");
    (isTag ? tags : body).push(text);
  });
  const b = body.join(" ");
  const t = tags.join(" ");
  return { bodyWords: countWords(b), tagWords: countWords(t), bodyLen: avgWordLen(b), tagLen: avgWordLen(t), bodyText: b, tagText: t };
}

export default function ReadTimer({ readHtml }: { readHtml: string }) {
  const { bodyWords, tagWords, bodyLen, tagLen, bodyText, tagText } = useMemo(() => analyze(readHtml), [readHtml]);
  const totalWords = bodyWords + tagWords;
  // Read the saved settings once, on first (client) render — this view only
  // mounts client-side, so localStorage is available and there's no SSR mismatch.
  const [settings, setSettings] = useState<Settings | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(RATES_KEY);
      const r = raw ? JSON.parse(raw) : null;
      if (r && r.cardWpm && r.tagWpm) {
        return { cardWpm: r.cardWpm, tagWpm: r.tagWpm, fatiguePct: typeof r.fatiguePct === "number" ? r.fatiguePct : DEFAULT_SETTINGS.fatiguePct };
      }
    } catch { /* ignore */ }
    return null;
  });
  const [open, setOpen] = useState(false);

  const eff = settings ?? DEFAULT_SETTINGS;
  const estSec = estimateSeconds(bodyWords, tagWords, bodyLen, tagLen, eff);

  function save(s: Settings) {
    const clean: Settings = { cardWpm: clampWpm(s.cardWpm), tagWpm: clampWpm(s.tagWpm), fatiguePct: Math.min(FATIGUE_MAX_PCT, Math.max(0, Math.round(s.fatiguePct))) };
    setSettings(clean);
    try { localStorage.setItem(RATES_KEY, JSON.stringify(clean)); } catch { /* ignore */ }
  }

  return (
    <>
      <span className="flow-readstat" title={`${bodyWords} card-text + ${tagWords} tag/cite words`}>
        <b>{totalWords}</b> words
      </span>
      <span
        className="flow-readstat"
        title={settings
          ? `${eff.cardWpm} wpm card · ${eff.tagWpm} wpm tags · +${eff.fatiguePct}% fatigue by 4:00 — also adjusted for word length`
          : "Estimate at a default pace, adjusted for word length and fatigue — calibrate for your own speed"}
      >
        ~<b>{fmt(estSec)}</b> to read{settings ? "" : " (est.)"}
      </span>
      <button className="db-btn db-btn--glass db-btn--sm" onClick={() => setOpen(true)}>
        {settings ? "Calibrate" : "Calibrate read speed"}
      </button>
      {open && <CalModal settings={eff} docCard={bodyText} docTag={tagText} onSave={save} onClose={() => setOpen(false)} />}
    </>
  );
}

type Phase = "menu" | "card" | "tag" | "done" | "edit";
const isReadingPhase = (p: Phase) => p === "card" || p === "tag";

function CalModal({ settings, docCard, docTag, onSave, onClose }: {
  settings: Settings;
  docCard: string;   // the read doc's own card text
  docTag: string;    // the read doc's own tags + cites
  onSave: (s: Settings) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("menu");
  // Where the two-step test reads from: random practice sections or this read doc.
  const [source, setSource] = useState<"pool" | "doc">("pool");
  const [reading, setReading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [sample, setSample] = useState("");
  const startRef = useRef(0);
  const cardWpmRef = useRef(0);
  const [cardWpm, setCardWpm] = useState(0);
  const [tagWpm, setTagWpm] = useState(0);
  // Manual-edit working copy.
  const [eCard, setECard] = useState(settings.cardWpm);
  const [eTag, setETag] = useState(settings.tagWpm);
  const [eFat, setEFat] = useState(settings.fatiguePct);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!reading) return;
    const id = setInterval(() => setTick(nowMs() - startRef.current), 100);
    return () => clearInterval(id);
  }, [reading]);

  // 3-2-1 countdown, then reveal the passage and start timing. State changes live
  // in the timeout callback (not the effect body) to avoid cascading-render lint.
  useEffect(() => {
    if (countdown === null) return;
    const id = setTimeout(() => {
      if (countdown <= 1) {
        startRef.current = nowMs();
        setTick(0);
        setReading(true);
        setCountdown(null);
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  function startReading() {
    const card = source === "doc" ? docCard : pickCardSample();
    const tag = source === "doc" ? docTag : pickTagSample();
    setSample(phase === "card" ? card : tag);
    setCountdown(3);
  }
  function done() {
    const wpm = clampWpm(countWords(sample) / ((nowMs() - startRef.current) / 60000));
    setReading(false);
    if (phase === "card") {
      cardWpmRef.current = wpm; setCardWpm(wpm); setPhase("tag");
    } else {
      setTagWpm(wpm); onSave({ cardWpm: cardWpmRef.current, tagWpm: wpm, fatiguePct: settings.fatiguePct }); setPhase("done");
    }
  }
  function toMenu() { setReading(false); setCountdown(null); setSample(""); setCardWpm(0); setTagWpm(0); cardWpmRef.current = 0; setPhase("menu"); }

  const canDoc = countWords(docCard) >= 20 && countWords(docTag) >= 3;
  const onDoc = source === "doc";
  const stepLabel = phase === "card" ? "Step 1 of 2" : "Step 2 of 2";
  const stepTitle = phase === "card" ? "Read the card text" : "Read the tags & cites";
  const stepSub = phase === "card"
    ? `Read ${onDoc ? "your read doc's card text" : "it"} aloud at the pace you'd actually deliver it.`
    : `Read ${onDoc ? "your read doc's tags & cites" : "these"} aloud — a touch slower, the way you would for clarity.`;

  return (
    <div className="flow-rtcal-backdrop" onClick={onClose} role="presentation">
      <div className="flow-rtcal" role="dialog" aria-modal="true" aria-label="Read speed" onClick={(e) => e.stopPropagation()}>
        {phase === "menu" && (
          <>
            <span className="flow-rtcal__step">Read speed</span>
            <h3>Calibrate or edit</h3>
            <p className="flow-rtcal__sub">
              Now: <b>{settings.cardWpm}</b> wpm card · <b>{settings.tagWpm}</b> wpm tags · <b>+{settings.fatiguePct}%</b> fatigue.
            </p>
            <div className="flow-rtcal__menu">
              <button className="flow-rtcal__opt" onClick={() => { setSource("pool"); setPhase("card"); }}>
                <b>Timed practice test</b>
                <span>Read two random card sections + a set of tags. Good when the read doc is empty.</span>
              </button>
              <button className="flow-rtcal__opt" onClick={() => { if (canDoc) { setSource("doc"); setPhase("card"); } }} disabled={!canDoc}>
                <b>Read this read doc</b>
                <span>{canDoc ? "Time yourself on your own read doc — card text, then tags & cites." : "Highlight some cards in the Send doc first."}</span>
              </button>
              <button className="flow-rtcal__opt" onClick={() => { setECard(settings.cardWpm); setETag(settings.tagWpm); setEFat(settings.fatiguePct); setPhase("edit"); }}>
                <b>Edit stats manually</b>
                <span>Type your WPM and set the fatigue slider yourself.</span>
              </button>
            </div>
            <div className="flow-rtcal__actions">
              <button className="db-btn db-btn--glass db-btn--sm" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {isReadingPhase(phase) && (
          <>
            <div className="flow-rtcal__head">
              <div>
                <span className="flow-rtcal__step">{stepLabel}</span>
                <h3>{stepTitle}</h3>
              </div>
              {(phase === "card" || phase === "tag") && (
                <div className="flow-rtcal__dots" aria-hidden>
                  <span className={`flow-rtcal__dot ${phase === "card" ? "is-on" : "is-done"}`} />
                  <span className={`flow-rtcal__dot ${phase === "tag" ? "is-on" : ""}`} />
                </div>
              )}
            </div>
            <p className="flow-rtcal__sub">{stepSub}</p>
            <div className="flow-rtcal__stage">
              {countdown !== null
                ? <div key={countdown} className="flow-rtcal__count" aria-live="assertive">{countdown}</div>
                : reading
                  ? <div className="flow-rtcal__sample">{sample}</div>
                  : <div className="flow-rtcal__ready"><span>Press <b>Start</b> when you&apos;re ready, then read aloud.</span></div>}
            </div>
            <div className="flow-rtcal__actions">
              {reading && <span className="flow-rtcal__timer">{fmt(tick / 1000)}</span>}
              {reading ? (
                <button className="db-btn db-btn--accent db-btn--sm" onClick={done}>Done reading</button>
              ) : countdown !== null ? (
                <button className="db-btn db-btn--glass db-btn--sm" onClick={toMenu}>Cancel</button>
              ) : (
                <>
                  <button className="db-btn db-btn--glass db-btn--sm" onClick={toMenu}>Back</button>
                  <button className="db-btn db-btn--accent db-btn--sm" onClick={startReading}>Start</button>
                </>
              )}
            </div>
          </>
        )}

        {phase === "edit" && (
          <>
            <span className="flow-rtcal__step">Edit stats</span>
            <h3>Your reading pace</h3>
            <div className="flow-rtcal__field">
              <label htmlFor="rt-card">Card text speed</label>
              <div className="flow-rtcal__numwrap">
                <input id="rt-card" className="flow-rtcal__num" type="number" min={40} max={600} value={eCard}
                  onChange={(e) => setECard(parseInt(e.target.value, 10) || 0)} />
                <span>wpm</span>
              </div>
            </div>
            <div className="flow-rtcal__field">
              <label htmlFor="rt-tag">Tags &amp; cites speed</label>
              <div className="flow-rtcal__numwrap">
                <input id="rt-tag" className="flow-rtcal__num" type="number" min={40} max={600} value={eTag}
                  onChange={(e) => setETag(parseInt(e.target.value, 10) || 0)} />
                <span>wpm</span>
              </div>
            </div>
            <div className="flow-rtcal__field flow-rtcal__field--col">
              <label htmlFor="rt-fat">Fatigue <span className="flow-rtcal__fatval">+{eFat}% slower by 4:00</span></label>
              <input id="rt-fat" className="flow-rtcal__range" type="range" min={0} max={FATIGUE_MAX_PCT} step={1} value={eFat}
                onChange={(e) => setEFat(parseInt(e.target.value, 10))} />
            </div>
            <div className="flow-rtcal__actions">
              <button className="db-btn db-btn--glass db-btn--sm" onClick={toMenu}>Back</button>
              <button className="db-btn db-btn--accent db-btn--sm" onClick={() => { onSave({ cardWpm: eCard, tagWpm: eTag, fatiguePct: eFat }); onClose(); }}>Save</button>
            </div>
          </>
        )}

        {phase === "done" && (
          <>
            <span className="flow-rtcal__step">All set</span>
            <h3>Your reading pace</h3>
            <div className="flow-rtcal__rates">
              <div className="flow-rtcal__rate">
                <span className="flow-rtcal__rateN">{cardWpm}</span>
                <span className="flow-rtcal__rateL">wpm · card text</span>
              </div>
              <div className="flow-rtcal__rate">
                <span className="flow-rtcal__rateN">{tagWpm}</span>
                <span className="flow-rtcal__rateL">wpm · tags &amp; cites</span>
              </div>
            </div>
            <p className="flow-rtcal__sub">Your read doc estimate now uses these rates.</p>
            <div className="flow-rtcal__actions">
              <button className="db-btn db-btn--glass db-btn--sm" onClick={toMenu}>Retest</button>
              <button className="db-btn db-btn--accent db-btn--sm" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

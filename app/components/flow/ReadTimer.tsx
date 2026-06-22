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
interface Rates { cardWpm: number; tagWpm: number; }
// Reading aloud for delivery: card text flows faster than tags/cites, which you
// slow down on for clarity. Used until you calibrate your own pace.
const DEFAULT_RATES: Rates = { cardWpm: 160, tagWpm: 110 };

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
const WORDLEN_ALPHA = 0.7;     // how strongly word length matters (0 = not at all)
const FRESH_SEC = 30;          // the first 30s read at the fresh, calibrated pace
const FATIGUE_STEP_SEC = 10;   // after that, every 10s of reading...
const FATIGUE_PER_STEP = 0.015; // ...adds 1% time
const MAX_FATIGUE = 1.5;       // cap the fatigue penalty at +50%

// WPM multiplier for word length: <1 when the doc's words run longer than the
// calibration words. Dampened (^alpha) and clamped so it can't run away.
function lenFactor(docLen: number, calLen: number): number {
  if (!docLen || !calLen) return 1;
  return Math.min(1.2, Math.max(0.6, Math.pow(calLen / docLen, WORDLEN_ALPHA)));
}

// Estimated read time (seconds): apply each calibrated rate, adjusted for the
// doc's word length, then inflate the whole thing for fatigue on long reads.
function estimateSeconds(bodyWords: number, tagWords: number, bodyLen: number, tagLen: number, rates: Rates): number {
  const cardRate = rates.cardWpm * lenFactor(bodyLen, CARD_CAL_LEN);
  const tagRate = rates.tagWpm * lenFactor(tagLen, TAG_CAL_LEN);
  const base = (cardRate ? bodyWords / cardRate : 0) * 60 + (tagRate ? tagWords / tagRate : 0) * 60;
  const fatigue = Math.min(MAX_FATIGUE, 1 + FATIGUE_PER_STEP * (Math.max(0, base - FRESH_SEC) / FATIGUE_STEP_SEC));
  return base * fatigue;
}

// Count the read-doc words you read slowly (tags + cites) vs at card pace (body),
// plus each group's average word length, so the estimate can adjust per group.
function analyze(readHtml: string) {
  if (typeof DOMParser === "undefined") return { bodyWords: 0, tagWords: 0, bodyLen: 0, tagLen: 0 };
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
  return { bodyWords: countWords(b), tagWords: countWords(t), bodyLen: avgWordLen(b), tagLen: avgWordLen(t) };
}

export default function ReadTimer({ readHtml }: { readHtml: string }) {
  const { bodyWords, tagWords, bodyLen, tagLen } = useMemo(() => analyze(readHtml), [readHtml]);
  const totalWords = bodyWords + tagWords;
  // Read the saved pace once, on first (client) render — this view only mounts
  // client-side, so localStorage is available and there's no SSR mismatch.
  const [rates, setRates] = useState<Rates | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(RATES_KEY);
      const r = raw ? JSON.parse(raw) : null;
      if (r && r.cardWpm && r.tagWpm) return { cardWpm: r.cardWpm, tagWpm: r.tagWpm };
    } catch { /* ignore */ }
    return null;
  });
  const [open, setOpen] = useState(false);

  const eff = rates ?? DEFAULT_RATES;
  const estSec = estimateSeconds(bodyWords, tagWords, bodyLen, tagLen, eff);

  function saveRates(r: Rates) {
    setRates(r);
    try { localStorage.setItem(RATES_KEY, JSON.stringify(r)); } catch { /* ignore */ }
  }

  return (
    <>
      <span className="flow-readstat" title={`${bodyWords} card-text + ${tagWords} tag/cite words`}>
        <b>{totalWords}</b> words
      </span>
      <span
        className="flow-readstat"
        title={rates
          ? `Calibrated: ${rates.cardWpm} wpm card text, ${rates.tagWpm} wpm tags/cites — adjusted for word length and fatigue on long reads`
          : "Estimate at a default pace, adjusted for word length and fatigue — calibrate for your own speed"}
      >
        ~<b>{fmt(estSec)}</b> to read{rates ? "" : " (est.)"}
      </span>
      <button className="db-btn db-btn--glass db-btn--sm" onClick={() => setOpen(true)}>
        {rates ? "Recalibrate" : "Calibrate read speed"}
      </button>
      {open && <CalModal onClose={() => setOpen(false)} onDone={saveRates} />}
    </>
  );
}

type Phase = "card" | "tag" | "done";

// Two-step timed reading test on random sections of a real 1NC: read the card
// text, then the tags & cites. Elapsed time per step becomes a words/min rate.
function CalModal({ onClose, onDone }: { onClose: () => void; onDone: (r: Rates) => void }) {
  const [phase, setPhase] = useState<Phase>("card");
  const [reading, setReading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [sample, setSample] = useState("");
  const startRef = useRef(0);
  const cardWpmRef = useRef(0);
  const [cardWpm, setCardWpm] = useState(0);
  const [tagWpm, setTagWpm] = useState(0);

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

  // 3-2-1 countdown: tick down once a second, then reveal the passage and start
  // timing. All state changes happen in the timeout callback (not synchronously
  // in the effect body) so they don't trigger cascading-render lint.
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

  const isCard = phase === "card";

  // Pick fresh random material, then run the countdown before timing begins.
  function startReading() {
    setSample(isCard ? pickCardSample() : pickTagSample());
    setCountdown(3);
  }
  function done() {
    const wpm = clampWpm(countWords(sample) / ((nowMs() - startRef.current) / 60000));
    setReading(false);
    if (isCard) {
      cardWpmRef.current = wpm; setCardWpm(wpm); setPhase("tag");
    } else {
      setTagWpm(wpm); setPhase("done");
      onDone({ cardWpm: cardWpmRef.current, tagWpm: wpm });
    }
  }
  function retest() { setReading(false); setCountdown(null); setSample(""); setCardWpm(0); setTagWpm(0); cardWpmRef.current = 0; setPhase("card"); }

  return (
    <div className="flow-rtcal-backdrop" onClick={onClose} role="presentation">
      <div className="flow-rtcal" role="dialog" aria-modal="true" aria-label="Calibrate read speed" onClick={(e) => e.stopPropagation()}>
        {phase !== "done" ? (
          <>
            <div className="flow-rtcal__head">
              <div>
                <span className="flow-rtcal__step">Step {isCard ? 1 : 2} of 2</span>
                <h3>{isCard ? "Read the card text" : "Read the tags & cites"}</h3>
              </div>
              <div className="flow-rtcal__dots" aria-hidden>
                <span className={`flow-rtcal__dot ${isCard ? "is-on" : "is-done"}`} />
                <span className={`flow-rtcal__dot ${!isCard ? "is-on" : ""}`} />
              </div>
            </div>
            <p className="flow-rtcal__sub">
              {isCard
                ? "Read it aloud at the pace you'd actually deliver it."
                : "Read these aloud — a touch slower, the way you would for clarity."}
            </p>
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
                <button className="db-btn db-btn--glass db-btn--sm" onClick={onClose}>Cancel</button>
              ) : (
                <>
                  <button className="db-btn db-btn--glass db-btn--sm" onClick={onClose}>Cancel</button>
                  <button className="db-btn db-btn--accent db-btn--sm" onClick={startReading}>Start</button>
                </>
              )}
            </div>
          </>
        ) : (
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
              <button className="db-btn db-btn--glass db-btn--sm" onClick={retest}>Retest</button>
              <button className="db-btn db-btn--accent db-btn--sm" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { createElement, Fragment, useMemo, useState } from "react";
import { Download, Scissors } from "lucide-react";
import { toReadDocHtml } from "@/lib/readDoc";
import { downloadHtmlAsDocx } from "@/lib/sendDocExport";
import ReadTimer from "@/app/components/flow/ReadTimer";
import type { TimerSnap } from "@/app/components/flow/FlowTimers";
import {
  type Settings,
  analyze, segmentRead, estimateSeconds, loadSettings, saveSettings, fmt, DEFAULT_SETTINGS,
  loadSpeechSec, saveSpeechSec,
} from "@/lib/readEstimate";

// Read-only "read doc" view: the speech-ready version of the Send doc — tags,
// cites (author + date), and highlighted text only. Derived live from the Send
// doc, so it updates as the Send doc changes; large, calm type to read off. Each
// card shows its own estimated read time so you can see what to cut to hit time.
export default function ReadDocView({ sendHtml, timer, onCutCard }: {
  sendHtml: string;
  timer: TimerSnap | null;
  // Double-click a card: "delete" (plan mode) removes it from the Send doc;
  // "red" (normal mode) marks it cut (red) so it drops from the read doc but stays
  // in the Send doc. Either way its flow point is removed. ho = the card's ordinal.
  onCutCard?: (ho: number, mode: "delete" | "red") => void;
}) {
  const read = useMemo(() => toReadDocHtml(sendHtml), [sendHtml]);
  const segs = useMemo(() => segmentRead(read), [read]);
  const analysis = useMemo(() => analyze(read), [read]);
  const empty = !read.trim();

  // Settings live here (not in ReadTimer) so the per-card chips and the total
  // estimate share one source and both update when you calibrate.
  const [settings, setSettings] = useState<Settings | null>(() => loadSettings());
  const eff = settings ?? DEFAULT_SETTINGS;
  const save = (s: Settings) => setSettings(saveSettings(s));

  // The speech length the estimate is paced against — editable, persisted here so
  // the per-card chips and the bar agree. The live countdown still comes from the
  // running speech timer (passed through as `timer`).
  const [targetSec, setTargetSec] = useState<number>(() => loadSpeechSec());
  const setTarget = (s: number) => setTargetSec(saveSpeechSec(s));

  // Pacing planner: the running read time down the doc. Computed over PREFIXES so
  // fatigue ramps progressively (later cards cost more) and the final cumulative
  // lands exactly on the whole-doc estimate. The cut line falls before the first
  // card whose cumulative time passes your speech length.
  const [plan, setPlan] = useState(false);
  const planData = useMemo(() => {
    let bw = 0, tw = 0, bLenW = 0, tLenW = 0;
    const cum: number[] = [];
    for (const s of segs) {
      bw += s.bodyWords; tw += s.tagWords;
      bLenW += s.bodyLen * s.bodyWords; tLenW += s.tagLen * s.tagWords;
      cum.push(estimateSeconds(bw, tw, bw ? bLenW / bw : 0, tw ? tLenW / tw : 0, eff));
    }
    const total = cum.length ? cum[cum.length - 1] : 0;
    const cutIndex = cum.findIndex((t) => t > targetSec);
    return { cum, total, cutIndex };
  }, [segs, eff, targetSec]);
  const belowCount = planData.cutIndex >= 0 ? segs.length - planData.cutIndex : 0;

  return (
    <div className="flow-readview">
      <div className="flow-readview__bar">
        <ReadTimer analysis={analysis} settings={settings} onSave={save} timer={timer} targetSec={targetSec} onTarget={setTarget} />
        <span className="flow-sendedit__spacer" />
        <button
          className={`db-btn db-btn--glass db-btn--sm ${plan ? "is-active" : ""}`}
          disabled={empty}
          onClick={() => setPlan((p) => !p)}
          title="Mark where the speech clock runs out, so you can see what to cut"
        >
          <Scissors size={14} /> Plan{plan && belowCount > 0 ? ` · ${belowCount} below` : ""}
        </button>
        <button
          className="db-btn db-btn--accent db-btn--sm"
          disabled={empty}
          onClick={() => downloadHtmlAsDocx(read, "read-doc.docx")}
        >
          <Download size={15} /> Download .docx
        </button>
      </div>
      {empty ? (
        <p className="flow-readview__empty">
          Nothing to read yet. Highlight the text you plan to read in the Send doc, then it appears here.
        </p>
      ) : (
        <div className="flow-readview__doc">
          {segs.map((seg, i) => {
            const showChip = seg.bodyWords > 0 || !!seg.cite;
            const sec = estimateSeconds(seg.bodyWords, seg.tagWords, seg.bodyLen, seg.tagLen, eff);
            const chip = showChip ? (
              <span className="rd-chip" title="Estimated read time for this card · running total at this point">
                ~{fmt(sec)}{plan && <span className="rd-cum"> · {fmt(planData.cum[i])}</span>}
              </span>
            ) : null;
            const level = Math.min(4, Math.max(1, seg.heading?.level ?? 4));
            const over = plan && planData.cutIndex >= 0 && i >= planData.cutIndex;
            const canCut = !!onCutCard && showChip && seg.ho != null;
            return (
              <Fragment key={seg.key}>
                {plan && planData.cutIndex === i && (
                  <div className="rd-cutline" aria-label={`Speech clock (${fmt(targetSec)}) runs out here`}>
                    <Scissors size={13} />
                    <span>{fmt(targetSec)} — read above, cut below</span>
                  </div>
                )}
                <div
                  className={`rd-seg ${over ? "rd-seg--over" : ""} ${canCut ? "rd-seg--cut" : ""}`}
                  onDoubleClick={canCut ? () => onCutCard!(seg.ho!, plan ? "delete" : "red") : undefined}
                  title={canCut ? (plan
                    ? "Double-click: delete this card from the Send doc and remove its flow point"
                    : "Double-click: cut this card (turns red in the Send doc) and remove its flow point") : undefined}
                >
                  {seg.heading && createElement(
                    `h${level}`,
                    { className: chip ? "rd-head" : undefined },
                    seg.heading.text, chip,
                  )}
                  {seg.cite && <p className="rd-cite"><b>{seg.cite}</b></p>}
                  {seg.body && (
                    <p>
                      {!seg.heading && chip}
                      {seg.body}
                    </p>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

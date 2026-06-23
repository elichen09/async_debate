"use client";

import { createElement, useMemo, useState } from "react";
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
export default function ReadDocView({ sendHtml, timer }: { sendHtml: string; timer: TimerSnap | null }) {
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

  return (
    <div className="flow-readview">
      <div className="flow-readview__bar">
        <ReadTimer analysis={analysis} settings={settings} onSave={save} timer={timer} targetSec={targetSec} onTarget={setTarget} />
        <span className="flow-sendedit__spacer" />
        <button
          className="db-btn db-btn--accent db-btn--sm"
          disabled={empty}
          onClick={() => downloadHtmlAsDocx(read, "read-doc.docx")}
        >
          ⬇ Download .docx
        </button>
      </div>
      {empty ? (
        <p className="flow-readview__empty">
          Nothing to read yet. Highlight the text you plan to read in the Send doc, then it appears here.
        </p>
      ) : (
        <div className="flow-readview__doc">
          {segs.map((seg) => {
            const showChip = seg.bodyWords > 0 || !!seg.cite;
            const sec = estimateSeconds(seg.bodyWords, seg.tagWords, seg.bodyLen, seg.tagLen, eff);
            const chip = showChip ? <span className="rd-chip" title="Estimated time to read this card">~{fmt(sec)}</span> : null;
            const level = Math.min(4, Math.max(1, seg.heading?.level ?? 4));
            return (
              <div className="rd-seg" key={seg.key}>
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
            );
          })}
        </div>
      )}
    </div>
  );
}

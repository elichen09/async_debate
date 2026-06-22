"use client";

import { useMemo } from "react";
import { toReadDocHtml } from "@/lib/readDoc";
import { downloadHtmlAsDocx } from "@/lib/sendDocExport";
import ReadTimer from "@/app/components/flow/ReadTimer";

// Read-only "read doc" view: the speech-ready version of the Send doc — tags,
// cites (author + date), and highlighted text only. Derived live from the Send
// doc, so it updates as the Send doc changes; large, calm type to read off.
export default function ReadDocView({ sendHtml }: { sendHtml: string }) {
  const read = useMemo(() => toReadDocHtml(sendHtml), [sendHtml]);
  const empty = !read.trim();

  return (
    <div className="flow-readview">
      <div className="flow-readview__bar">
        <ReadTimer readHtml={read} />
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
        <div className="flow-readview__doc" dangerouslySetInnerHTML={{ __html: read }} />
      )}
    </div>
  );
}

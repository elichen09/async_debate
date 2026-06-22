"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { blockToHtml, cardHtml } from "@/lib/richText";
import FlowGrid from "@/app/components/flow/FlowGrid";
import FlowSpeech from "@/app/components/flow/FlowSpeech";
import SnippetLibrary from "@/app/components/flow/SnippetLibrary";
import SendDoc from "@/app/components/flow/SendDoc";
import FlowTimers from "@/app/components/flow/FlowTimers";
import ShareDialog from "@/app/components/flow/ShareDialog";
import type { EditorInsert, Flow, FlowSnippet } from "@/app/flow/shared";

const SNIP_SEL = "id, owner_id, label, body, points, shortcut, parent_id, created_at";
type Sibling = { id: string; title: string; folder_id: string | null };
type ViewKind = "flow" | "speech" | "send";
type Pane = { key: string; view: ViewKind; flowId: string };

// Remove Send-doc cards tied to deleted flow points: drop each h4[data-cell] and
// its body (siblings up to the next heading), then any block title (h3[data-block])
// left with no cards.
function removeSendCards(html: string, ids: string[]): string {
  if (!html) return html;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    let changed = false;
    for (const id of ids) {
      const h = doc.querySelector(`[data-cell="${id}"]`);
      if (!h) continue;
      changed = true;
      let n = h.nextElementSibling;
      while (n && !/^H[1-6]$/.test(n.tagName)) { const x = n; n = n.nextElementSibling; x.remove(); }
      h.remove();
    }
    for (const t of Array.from(doc.querySelectorAll("h3[data-block]"))) {
      let n = t.nextElementSibling;
      let hasCard = false;
      while (n && n.tagName !== "H3") { if ((n as HTMLElement).hasAttribute("data-cell")) { hasCard = true; break; } n = n.nextElementSibling; }
      if (!hasCard) { t.remove(); changed = true; }
    }
    return changed ? doc.body.innerHTML : html;
  } catch {
    return html;
  }
}

// Insert a block's HTML into the Send doc before the card of the first following
// flow point that already has one (so doc order mirrors the outline). If none of
// them have a card yet, append at the end. We insert before that card's block
// title (h3[data-block]) when it's part of a block, else before the card itself.
function insertSendBlock(html: string, blockHtml: string, afterIds: string[]): string {
  if (!afterIds.length) return html + blockHtml;
  try {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    let anchor: Element | null = null;
    for (const id of afterIds) {
      anchor = doc.querySelector(`[data-block="${id}"]`) || doc.querySelector(`[data-cell="${id}"]`);
      if (anchor) break;
    }
    if (!anchor) return html + blockHtml;
    // If the anchor is a card inside a block, back up to that block's title.
    if (!anchor.hasAttribute("data-block")) {
      let p = anchor.previousElementSibling;
      while (p && !/^H[1-3]$/.test(p.tagName)) p = p.previousElementSibling;
      if (p && p.hasAttribute("data-block")) anchor = p;
    }
    const frag = new DOMParser().parseFromString(blockHtml, "text/html").body;
    while (frag.firstChild) anchor.parentNode!.insertBefore(frag.firstChild, anchor);
    return doc.body.innerHTML;
  } catch {
    return html + blockHtml;
  }
}

// Reorder the Send doc's card segments to match a new flow point order. The doc is
// a flat sequence of heading-led segments; each segment keyed by its heading's
// data-block/data-cell. We sort the KEYED segments by the flow order and slot them
// back into the positions keyed segments occupied, leaving free text in place.
function reorderSendDoc(html: string, orderedIds: string[]): string {
  if (!html) return html;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const children = Array.from(doc.body.children);
    if (!children.length) return html;
    type Seg = { nodes: Element[]; key: string | null };
    const segs: Seg[] = [];
    for (const el of children) {
      if (/^H[1-6]$/.test(el.tagName) || !segs.length) {
        const key = el.getAttribute("data-block") || el.getAttribute("data-cell");
        segs.push({ nodes: [el], key });
      } else {
        segs[segs.length - 1].nodes.push(el);
      }
    }
    const idx = new Map(orderedIds.map((id, i) => [id, i]));
    const keyed = segs.filter((s) => s.key && idx.has(s.key));
    if (keyed.length < 2) return html;
    const sorted = [...keyed].sort((a, b) => (idx.get(a.key!) ?? 0) - (idx.get(b.key!) ?? 0));
    let k = 0;
    const ordered = segs.map((s) => (s.key && idx.has(s.key) ? sorted[k++] : s));
    const out = ordered.flatMap((s) => s.nodes).map((n) => n.outerHTML).join("");
    return out || html;
  } catch {
    return html;
  }
}

export default function FlowWorkspace() {
  const router = useRouter();
  const { id } = useParams();
  const flowId = id as string;

  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("Partner");
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  // Split view: any number of side-by-side panes. Each is a view of a flow; the
  // Speech/Send panes always target the URL flow, Flow panes can be any sibling.
  const [panes, setPanes] = useState<Pane[]>([{ key: "p0", view: "flow", flowId }]);
  const [flexes, setFlexes] = useState<Record<string, number>>({});  // per-pane flex-grow weights (drag to resize)
  const [showSnippets, setShowSnippets] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showTimers, setShowTimers] = useState(false);
  const [snippets, setSnippets] = useState<FlowSnippet[]>([]);
  const [sendHtml, setSendHtml] = useState("");
  const [sendVersion, setSendVersion] = useState(0);
  const [siblings, setSiblings] = useState<Sibling[]>([]);

  // The App Router reuses this component when navigating between flows in the same
  // route, so reset the split back to a single pane for the new flow.
  const [prevFlowId, setPrevFlowId] = useState(flowId);
  if (prevFlowId !== flowId) {
    setPrevFlowId(flowId);
    setPanes([{ key: `main-${flowId}`, view: "flow", flowId }]);
    setFlexes({});
  }

  const activeInsert = useRef<EditorInsert | null>(null);
  const registerInsert = (fn: EditorInsert | null) => { activeInsert.current = fn; };
  const addPointsRef = useRef<((tags: string[]) => void) | null>(null);
  const snippetsRef = useRef<FlowSnippet[]>([]);
  const panesRef = useRef(panes);
  const paneSeq = useRef(1);
  const flexesRef = useRef(flexes);
  useEffect(() => { flexesRef.current = flexes; }, [flexes]);
  const savedFlowPanesRef = useRef<Pane[]>(panes);   // last flow-pane arrangement, restored by the Flow tab
  const sendHtmlRef = useRef("");
  const lastSendEdit = useRef(0);
  const sendSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { snippetsRef.current = snippets; }, [snippets]);
  useEffect(() => { panesRef.current = panes; }, [panes]);
  useEffect(() => { sendHtmlRef.current = sendHtml; }, [sendHtml]);
  // Remember the flow-pane layout (so the Flow tab can restore a 2-flow split after
  // you visit Speech/Send).
  useEffect(() => {
    const fp = panes.filter((p) => p.view === "flow");
    if (fp.length) savedFlowPanesRef.current = fp;
  }, [panes]);

  // Fullscreen workspace: hide the site nav/rail so panes fill the whole screen.
  useEffect(() => {
    document.body.classList.toggle("flow-work-full", fullscreen);
    return () => document.body.classList.remove("flow-work-full");
  }, [fullscreen]);

  // --- View / split controls ---
  // A tab SWITCHES the workspace's view (no automatic splitting). The Flow tab
  // restores your last flow arrangement — so a 2-flow split survives a trip to
  // Speech/Send and back. Speech/Send are always a single pane for the URL flow.
  function setView(view: ViewKind) {
    setFlexes({});
    if (view === "flow") {
      const restore = savedFlowPanesRef.current.length ? savedFlowPanesRef.current : [{ key: `p${paneSeq.current++}`, view: "flow" as ViewKind, flowId }];
      setPanes(restore);
    } else {
      setPanes([{ key: `p${paneSeq.current++}`, view, flowId }]);
    }
  }
  const showingFlow = panes.length > 0 && panes.every((p) => p.view === "flow");
  const isSoloView = (view: ViewKind) => (view === "flow" ? showingFlow : panes.length === 1 && panes[0].view === view);
  // Split EXPLICITLY: add a view (for the URL flow) or another flow as a new pane.
  function addPane(view: ViewKind, fid: string = flowId) {
    const key = `p${paneSeq.current++}`;
    setFlexes({});  // reset to equal widths when the set of panes changes
    setPanes((prev) => (prev.some((p) => p.view === view && p.flowId === fid) ? prev : [...prev, { key, view, flowId: fid }]));
  }
  function onSplit(value: string) {
    if (value.startsWith("view:")) addPane(value.slice(5) as ViewKind);
    else if (value.startsWith("flow:")) addPane("flow", value.slice(5));
  }
  function closePane(key: string) {
    setFlexes({});
    setPanes((prev) => (prev.length > 1 ? prev.filter((p) => p.key !== key) : prev));
  }
  // Drag a divider to stretch/shrink the two panes on either side. Conserves the
  // pair's combined width, so other panes stay put. flex-grow ratios = width ratios
  // (panes have flex-basis 0).
  function startResize(e: React.PointerEvent, leftKey: string, rightKey: string) {
    e.preventDefault();
    const resizer = e.currentTarget as HTMLElement;
    const leftEl = resizer.previousElementSibling as HTMLElement | null;
    const rightEl = resizer.nextElementSibling as HTMLElement | null;
    if (!leftEl || !rightEl) return;
    const leftW0 = leftEl.offsetWidth;
    const pairPx = leftW0 + rightEl.offsetWidth;
    const startX = e.clientX;
    const combined = (flexesRef.current[leftKey] ?? 1) + (flexesRef.current[rightKey] ?? 1);
    resizer.classList.add("is-active");
    const onMove = (ev: PointerEvent) => {
      const nl = leftW0 + (ev.clientX - startX);
      const ratio = Math.max(0.12, Math.min(0.88, nl / pairPx));
      setFlexes((prev) => ({ ...prev, [leftKey]: combined * ratio, [rightKey]: combined * (1 - ratio) }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      resizer.classList.remove("is-active");
      document.body.classList.remove("flow-resizing");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.classList.add("flow-resizing");
  }

  // --- Send doc persistence (shared across a folder's flows; per-flow if ungrouped) ---
  // The doc lives on the folder row when the flow is in one, else on the flow row,
  // so every flow in a folder opens the same Send doc. Typing autosaves; appends
  // from other flows stream back. Inbound events are ignored for ~1.5s after a
  // local change so the caret never jumps.
  function sendTarget(): [string, string] | null {
    if (!flow) return null;
    return flow.folder_id ? ["flow_folders", flow.folder_id] : ["flows", flowId];
  }
  async function saveSend(html: string) {
    const t = sendTarget();
    if (!t) return;
    // Must await: a PostgREST builder only sends its request when it's then()'d.
    const { error } = await supabase.from(t[0]).update({ send_html: html }).eq("id", t[1]);
    if (error) console.error("Send doc save failed:", error.message);
  }
  function scheduleSendSave() {
    // Throttle (not debounce) so collaborators see Send-doc edits stream in; the
    // timer saves the latest html (from the ref) when it fires.
    if (sendSaveTimer.current) return;
    sendSaveTimer.current = setTimeout(() => { sendSaveTimer.current = null; saveSend(sendHtmlRef.current); }, 600);
  }
  function applyRemoteSend(html: string) {
    sendHtmlRef.current = html;
    setSendHtml(html);
    setSendVersion((v) => v + 1);
  }
  // Local change → mirror + persist. bump=true re-syncs the editor DOM (programmatic
  // appends/removes); typing passes bump=false to preserve the caret.
  function commitSend(html: string, bump: boolean) {
    sendHtmlRef.current = html;
    setSendHtml(html);
    if (bump) setSendVersion((v) => v + 1);
    lastSendEdit.current = Date.now();
    scheduleSendSave();
  }
  const handleSendChange = (html: string) => commitSend(html, false);

  // Append an extension's block to the Send doc. cellIds (from a flow "/trigger")
  // tie each card to the flow point it created, so deleting that point removes it.
  function appendBlock(snip: FlowSnippet, cellIds?: string[]) {
    commitSend(sendHtmlRef.current + blockToHtml(snip.label, snip.points, snip.body, cellIds), true);
  }
  function onSlashBlock(trigger: string, cellIds: string[], afterIds: string[] = []) {
    const snip = findByTrigger(trigger);
    if (!snip) return;
    const blockHtml = blockToHtml(snip.label, snip.points, snip.body, cellIds);
    commitSend(insertSendBlock(sendHtmlRef.current, blockHtml, afterIds), true);
  }
  function onCellsDeleted(ids: string[]) {
    const next = removeSendCards(sendHtmlRef.current, ids);
    if (next !== sendHtmlRef.current) commitSend(next, true);
  }

  // Flow points were dragged into a new order — reflow the Send doc cards to match.
  function onReorder(orderedIds: string[]) {
    const next = reorderSendDoc(sendHtmlRef.current, orderedIds);
    if (next !== sendHtmlRef.current) commitSend(next, true);
  }

  // "/send" from the flow: append each point to the Send doc as a Heading-4 card,
  // tied to its cell id so deleting the point removes the card (and it isn't added
  // twice).
  function sendPointsToSend(cells: { id: string; content: string }[]) {
    let html = sendHtmlRef.current;
    let added = false;
    for (const c of cells) {
      if (html.includes(`data-cell="${c.id}"`)) continue;
      html += cardHtml(c.content.trim() || "(untitled point)", [], c.id);
      added = true;
    }
    if (added) commitSend(html, true);
  }

  // The "/trigger" options available for the flow's slash autocomplete.
  const slashOptions = snippets
    .filter((s) => (s.shortcut ?? "").trim())
    .map((s) => ({ trigger: (s.shortcut as string).trim().toLowerCase(), label: s.label }));

  // Extensions "use" button: add points to the flow (when flowing) + queue Send doc.
  function runExtension(snip: FlowSnippet) {
    const pts = snip.points ?? [];
    const tags = pts.length ? pts.map((p) => p.tag) : [snip.label];
    if (panesRef.current.some((p) => p.view === "flow")) addPointsRef.current?.(tags);
    appendBlock(snip);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const uid = session.user.id;
      if (active) { setUserId(uid); setUserName((session.user.email ?? "Partner").split("@")[0]); }
      const { data } = await supabase.from("flows").select("*").eq("id", flowId).single();
      if (!active) return;
      if (!data) { router.push("/flow"); return; }
      setFlow(data as Flow);
      setLoading(false);
      const { data: snips } = await supabase.from("flow_snippets").select(SNIP_SEL).eq("owner_id", uid).order("created_at", { ascending: false });
      if (active && snips) setSnippets(snips as FlowSnippet[]);
    }
    load();
    return () => { active = false; };
  }, [flowId, router]);

  useEffect(() => {
    if (!flow) return;
    let active = true;
    (async () => {
      const base = supabase.from("flows").select("id, title, folder_id").order("created_at", { ascending: true });
      const { data } = await (flow.folder_id ? base.eq("folder_id", flow.folder_id) : base.is("folder_id", null));
      if (active && data) setSiblings(data as Sibling[]);
    })();
    return () => { active = false; };
  }, [flow]);

  // Load + stream the shared Send doc for this flow's folder (or the flow itself).
  useEffect(() => {
    if (!flow) return;
    const t: [string, string] = flow.folder_id ? ["flow_folders", flow.folder_id] : ["flows", flowId];
    let active = true;
    supabase.from(t[0]).select("send_html").eq("id", t[1]).single().then(({ data }) => {
      if (!active || !data) return;
      if (Date.now() - lastSendEdit.current < 1500) return;
      applyRemoteSend((data as { send_html: string | null }).send_html ?? "");
    });
    const channel = supabase
      .channel(`flow_send:${t[0]}:${t[1]}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: t[0], filter: `id=eq.${t[1]}` },
        (payload) => {
          if (Date.now() - lastSendEdit.current < 1500) return;
          const next = (payload.new as { send_html?: string }).send_html ?? "";
          if (next !== sendHtmlRef.current) applyRemoteSend(next);
        }
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
      if (sendSaveTimer.current) clearTimeout(sendSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow?.folder_id, flowId]);

  const findByTrigger = (trigger: string) =>
    snippetsRef.current.find((s) => (s.shortcut ?? "").trim().toLowerCase() === trigger);

  // Flow slash: return the point tags (FlowGrid inserts them at the current indent;
  // it then calls onSlashBlock with the new cell ids to queue the Send doc).
  function resolveSlashPoints(trigger: string): string[] | null {
    const snip = findByTrigger(trigger);
    if (!snip) return null;
    const pts = snip.points ?? [];
    return pts.length ? pts.map((p) => p.tag) : [snip.label];
  }

  // Speech slash: just the Heading-4 tags as text (no Send doc queue).
  function resolveSlashText(trigger: string): string | null {
    const snip = findByTrigger(trigger);
    if (!snip) return null;
    const pts = snip.points ?? [];
    return pts.length ? pts.map((p) => p.tag).join("\n") : snip.label;
  }

  // Send doc slash: the block's HTML (centered H3 title + H4 points) spliced in place.
  function resolveSlashHtml(trigger: string): string | null {
    const snip = findByTrigger(trigger);
    return snip ? blockToHtml(snip.label, snip.points, snip.body) : null;
  }

  // Alt+←/→ switches between flows in the same folder.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && siblings.length > 1) {
        e.preventDefault();
        const i = siblings.findIndex((f) => f.id === flowId);
        const next = siblings[(i + (e.key === "ArrowRight" ? 1 : -1) + siblings.length) % siblings.length];
        if (next && next.id !== flowId) router.push(`/flow/${next.id}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [siblings, flowId, router]);

  if (loading || !flow) {
    return (
      <div className="flow-loading">
        <div className="gh-loading-dots"><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className={`flow-work ${fullscreen ? "flow-work--full" : ""}`}>
      <header className="flow-work__head">
        <h1 className="flow-work__title">{flow.title}</h1>
        {siblings.length > 1 && (
          <div className="flow-foldertabs" role="tablist" aria-label="Flows in this folder">
            {siblings.map((s) => (
              <button
                key={s.id}
                className={`flow-foldertab ${s.id === flowId ? "is-active" : ""}`}
                onClick={() => s.id !== flowId && router.push(`/flow/${s.id}`)}
                title={s.title}
              >
                {s.title}
              </button>
            ))}
          </div>
        )}
        <div className="flow-work__tabs" role="group" aria-label="View">
          <button className={`flow-tab ${isSoloView("flow") ? "is-active" : ""}`} onClick={() => setView("flow")}>Flow</button>
          <button className={`flow-tab ${isSoloView("speech") ? "is-active" : ""}`} onClick={() => setView("speech")}>Speech</button>
          <button className={`flow-tab ${isSoloView("send") ? "is-active" : ""}`} onClick={() => setView("send")}>Send doc</button>
        </div>
        <select
          className="flow-addflow"
          value=""
          title="Open another view or flow side-by-side"
          onChange={(e) => { onSplit(e.target.value); e.currentTarget.value = ""; }}
        >
          <option value="" disabled>＋ Split…</option>
          <optgroup label="Add view">
            <option value="view:flow">Flow</option>
            <option value="view:speech">Speech</option>
            <option value="view:send">Send doc</option>
          </optgroup>
          {siblings.filter((s) => !panes.some((p) => p.view === "flow" && p.flowId === s.id)).length > 0 && (
            <optgroup label="Add flow">
              {siblings.filter((s) => !panes.some((p) => p.view === "flow" && p.flowId === s.id)).map((s) => (
                <option key={s.id} value={`flow:${s.id}`}>{s.title}</option>
              ))}
            </optgroup>
          )}
        </select>
        <div className="flow-work__actions">
          <button className={`flow-pill ${showTimers ? "is-active" : ""}`} onClick={() => setShowTimers((s) => !s)} title="Toggle timers">⏱ Timers</button>
          <button className="flow-pill" onClick={() => setFullscreen((f) => !f)} title="Toggle fullscreen">{fullscreen ? "⤡ Exit" : "⤢ Fullscreen"}</button>
          <button className={`flow-pill ${showSnippets ? "is-active" : ""}`} onClick={() => setShowSnippets((s) => !s)}>Extensions</button>
          <button className="flow-pill" onClick={() => setShowShare(true)}>Share</button>
        </div>
      </header>

      {showTimers && <FlowTimers flowId={flowId} />}

      <div className="flow-work__body">
        <div className="flow-work__panes">
          {panes.map((pane, i) => {
            const title =
              pane.view === "speech" ? "Speech" :
              pane.view === "send" ? "Send doc" :
              (pane.flowId === flowId ? flow.title : siblings.find((s) => s.id === pane.flowId)?.title ?? "Flow");
            return (
              <Fragment key={pane.key}>
              {i > 0 && (
                <div
                  className="flow-pane__resizer"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize panes"
                  onPointerDown={(e) => startResize(e, panes[i - 1].key, pane.key)}
                />
              )}
              <section className={`flow-pane ${panes.length === 1 ? "flow-pane--solo" : ""}`} data-view={pane.view} style={{ flexGrow: panes.length === 1 ? undefined : (flexes[pane.key] ?? 1) }}>
                {panes.length > 1 && (
                  <div className="flow-pane__head">
                    <span className="flow-pane__title" title={title}>{title}</span>
                    <button className="flow-pane__close" onClick={() => closePane(pane.key)} aria-label="Close pane" title="Close pane">×</button>
                  </div>
                )}
                <div className="flow-pane__body">
                  {pane.view === "flow" && (
                    <FlowGrid flowId={pane.flowId} userId={userId} userName={userName} registerInsert={registerInsert} registerAddPoints={(fn) => { addPointsRef.current = fn; }} resolveSlashPoints={resolveSlashPoints} onSlashBlock={onSlashBlock} onCellsDeleted={onCellsDeleted} slashOptions={slashOptions} onSendPoints={sendPointsToSend} onReorder={onReorder} />
                  )}
                  {pane.view === "speech" && (
                    <FlowSpeech flowId={flowId} initialBody={flow.speech_body} registerInsert={registerInsert} resolveSlashText={resolveSlashText} slashOptions={slashOptions} userId={userId} userName={userName} />
                  )}
                  {pane.view === "send" && (
                    <SendDoc html={sendHtml} version={sendVersion} onChange={handleSendChange} resolveSlashHtml={resolveSlashHtml} flowId={flowId} userId={userId} userName={userName} />
                  )}
                </div>
              </section>
              </Fragment>
            );
          })}
        </div>

        {showSnippets && (
          <SnippetLibrary userId={userId} onClose={() => setShowSnippets(false)} onUse={runExtension} snippets={snippets} setSnippets={setSnippets} />
        )}
      </div>

      {showShare && (
        <ShareDialog flowId={flowId} ownerId={flow.owner_id} userId={userId} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}

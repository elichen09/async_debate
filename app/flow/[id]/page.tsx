"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { blockToHtml, cardHtml } from "@/lib/richText";
import FlowGrid from "@/app/components/flow/FlowGrid";
import FlowSpeech from "@/app/components/flow/FlowSpeech";
import SnippetLibrary from "@/app/components/flow/SnippetLibrary";
import SendDoc from "@/app/components/flow/SendDoc";
import ShareDialog from "@/app/components/flow/ShareDialog";
import type { EditorInsert, Flow, FlowSnippet } from "@/app/flow/shared";

const SNIP_SEL = "id, owner_id, label, body, points, shortcut, parent_id, created_at";
type Sibling = { id: string; title: string; folder_id: string | null };

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

export default function FlowWorkspace() {
  const router = useRouter();
  const { id } = useParams();
  const flowId = id as string;

  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("Partner");
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"flow" | "speech" | "send">("flow");
  const [showSnippets, setShowSnippets] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [snippets, setSnippets] = useState<FlowSnippet[]>([]);
  const [sendHtml, setSendHtml] = useState("");
  const [sendVersion, setSendVersion] = useState(0);
  const [siblings, setSiblings] = useState<Sibling[]>([]);

  const activeInsert = useRef<EditorInsert | null>(null);
  const registerInsert = (fn: EditorInsert | null) => { activeInsert.current = fn; };
  const addPointsRef = useRef<((tags: string[]) => void) | null>(null);
  const snippetsRef = useRef<FlowSnippet[]>([]);
  const tabRef = useRef(tab);
  const sendHtmlRef = useRef("");
  const lastSendEdit = useRef(0);
  const sendSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { snippetsRef.current = snippets; }, [snippets]);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => { sendHtmlRef.current = sendHtml; }, [sendHtml]);

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
  function scheduleSendSave(html: string) {
    if (sendSaveTimer.current) clearTimeout(sendSaveTimer.current);
    sendSaveTimer.current = setTimeout(() => { saveSend(html); }, 600);
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
    scheduleSendSave(html);
  }
  const handleSendChange = (html: string) => commitSend(html, false);

  // Append an extension's block to the Send doc. cellIds (from a flow "/trigger")
  // tie each card to the flow point it created, so deleting that point removes it.
  function appendBlock(snip: FlowSnippet, cellIds?: string[]) {
    commitSend(sendHtmlRef.current + blockToHtml(snip.label, snip.points, snip.body, cellIds), true);
  }
  function onSlashBlock(trigger: string, cellIds: string[]) {
    const snip = findByTrigger(trigger);
    if (snip) appendBlock(snip, cellIds);
  }
  function onCellsDeleted(ids: string[]) {
    const next = removeSendCards(sendHtmlRef.current, ids);
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
    if (tabRef.current === "flow") addPointsRef.current?.(tags);
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
    <div className="flow-work">
      <header className="flow-work__head">
        <h1 className="flow-work__title">{flow.title}</h1>
        <div className="flow-work__tabs">
          <button className={`flow-tab ${tab === "flow" ? "is-active" : ""}`} onClick={() => setTab("flow")}>Flow</button>
          <button className={`flow-tab ${tab === "speech" ? "is-active" : ""}`} onClick={() => setTab("speech")}>Speech</button>
          <button className={`flow-tab ${tab === "send" ? "is-active" : ""}`} onClick={() => setTab("send")}>Send doc</button>
        </div>
        <div className="flow-work__actions">
          <button className={`flow-pill ${showSnippets ? "is-active" : ""}`} onClick={() => setShowSnippets((s) => !s)}>Extensions</button>
          <button className="flow-pill" onClick={() => setShowShare(true)}>Share</button>
        </div>
      </header>

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

      <div className="flow-work__body">
        <div className="flow-work__main">
          {tab === "flow" && (
            <FlowGrid flowId={flowId} userId={userId} userName={userName} registerInsert={registerInsert} registerAddPoints={(fn) => { addPointsRef.current = fn; }} resolveSlashPoints={resolveSlashPoints} onSlashBlock={onSlashBlock} onCellsDeleted={onCellsDeleted} slashOptions={slashOptions} onSendPoints={sendPointsToSend} />
          )}
          {tab === "speech" && (
            <FlowSpeech flowId={flowId} initialBody={flow.speech_body} registerInsert={registerInsert} resolveSlashText={resolveSlashText} slashOptions={slashOptions} />
          )}
          {tab === "send" && (
            <SendDoc html={sendHtml} version={sendVersion} onChange={handleSendChange} resolveSlashHtml={resolveSlashHtml} />
          )}
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

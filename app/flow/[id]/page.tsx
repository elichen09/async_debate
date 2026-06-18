"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cardHtml, plainCardHtml } from "@/lib/richText";
import FlowGrid from "@/app/components/flow/FlowGrid";
import FlowSpeech from "@/app/components/flow/FlowSpeech";
import SnippetLibrary from "@/app/components/flow/SnippetLibrary";
import SendDoc from "@/app/components/flow/SendDoc";
import ShareDialog from "@/app/components/flow/ShareDialog";
import type { EditorInsert, Flow, FlowSnippet } from "@/app/flow/shared";

const SNIP_SEL = "id, owner_id, label, body, points, shortcut, created_at";
type Sibling = { id: string; title: string; folder_id: string | null };

export default function FlowWorkspace() {
  const router = useRouter();
  const { id } = useParams();
  const flowId = id as string;

  const [userId, setUserId] = useState("");
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
  useEffect(() => { snippetsRef.current = snippets; }, [snippets]);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  // Use an extension: break its Heading-4 points into new flow points (on the
  // Flow tab) and append its formatted cards to the Send doc.
  function runExtension(snip: FlowSnippet) {
    const pts = snip.points ?? [];
    const tags = pts.length ? pts.map((p) => p.tag) : [snip.label];
    if (tabRef.current === "flow") addPointsRef.current?.(tags);
    const html = pts.length
      ? pts.map((p) => cardHtml(p.tag, p.rich)).join("")
      : plainCardHtml(snip.label, snip.body);
    setSendHtml((prev) => prev + html);
    setSendVersion((v) => v + 1);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const uid = session.user.id;
      if (active) setUserId(uid);
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

  // Global keys: Alt+←/→ switches folder flows; extension shortcuts fire runExtension.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        if (siblings.length > 1) {
          e.preventDefault();
          const i = siblings.findIndex((f) => f.id === flowId);
          const next = siblings[(i + (e.key === "ArrowRight" ? 1 : -1) + siblings.length) % siblings.length];
          if (next && next.id !== flowId) router.push(`/flow/${next.id}`);
        }
        return;
      }
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      if (!(e.ctrlKey || e.altKey || e.metaKey)) return;
      const mods: string[] = [];
      if (e.ctrlKey) mods.push("ctrl");
      if (e.altKey) mods.push("alt");
      if (e.metaKey) mods.push("meta");
      if (e.shiftKey) mods.push("shift");
      const combo = [...mods, e.key.toLowerCase()].join("+");
      const snip = snippetsRef.current.find((s) => s.shortcut === combo);
      if (snip) { e.preventDefault(); runExtension(snip); }
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
            <FlowGrid flowId={flowId} userId={userId} registerInsert={registerInsert} registerAddPoints={(fn) => { addPointsRef.current = fn; }} />
          )}
          {tab === "speech" && (
            <FlowSpeech flowId={flowId} initialBody={flow.speech_body} registerInsert={registerInsert} />
          )}
          {tab === "send" && (
            <SendDoc html={sendHtml} version={sendVersion} onChange={setSendHtml} />
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

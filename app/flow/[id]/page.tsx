"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import FlowGrid from "@/app/components/flow/FlowGrid";
import FlowSpeech from "@/app/components/flow/FlowSpeech";
import SnippetLibrary from "@/app/components/flow/SnippetLibrary";
import ShareDialog from "@/app/components/flow/ShareDialog";
import type { EditorInsert, Flow } from "@/app/flow/shared";

export default function FlowWorkspace() {
  const router = useRouter();
  const { id } = useParams();
  const flowId = id as string;

  const [userId, setUserId] = useState("");
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"flow" | "speech">("flow");
  const [showSnippets, setShowSnippets] = useState(false);
  const [showShare, setShowShare] = useState(false);

  // The editor (grid cell or speech doc) last focused, for snippet insertion.
  const activeInsert = useRef<EditorInsert | null>(null);
  const registerInsert = (fn: EditorInsert | null) => { activeInsert.current = fn; };

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      if (active) setUserId(session.user.id);
      // RLS guarantees we only see flows we own or collaborate on.
      const { data } = await supabase.from("flows").select("*").eq("id", flowId).single();
      if (!active) return;
      if (!data) { router.push("/flow"); return; }
      setFlow(data as Flow);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [flowId, router]);

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
        </div>
        <div className="flow-work__actions">
          <button className={`flow-pill ${showSnippets ? "is-active" : ""}`} onClick={() => setShowSnippets((s) => !s)}>Extensions</button>
          <button className="flow-pill" onClick={() => setShowShare(true)}>Share</button>
        </div>
      </header>

      <div className="flow-work__body">
        <div className="flow-work__main">
          {tab === "flow" ? (
            <FlowGrid flowId={flowId} userId={userId} registerInsert={registerInsert} />
          ) : (
            <FlowSpeech flowId={flowId} initialBody={flow.speech_body} registerInsert={registerInsert} />
          )}
        </div>

        {showSnippets && (
          <SnippetLibrary
            userId={userId}
            onClose={() => setShowSnippets(false)}
            onInsert={(text) => activeInsert.current?.(text)}
          />
        )}
      </div>

      {showShare && (
        <ShareDialog flowId={flowId} ownerId={flow.owner_id} userId={userId} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}

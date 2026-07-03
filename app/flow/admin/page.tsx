"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { MASTER_EMAIL, isFlowMaster } from "@/lib/flowAccess";
import { ArrowLeft, AlertTriangle, ShieldCheck, Trash2, ChevronDown, ChevronRight } from "lucide-react";

type AccessRow = { email: string; created_at: string };
type AdminFlow = {
  id: string;
  title: string;
  side: "aff" | "neg" | null;
  owner_id: string;
  updated_at: string;
  owner: { username: string; display_name: string } | null;
};
type Account = { ownerId: string; username: string; flows: AdminFlow[] };

const fmtDay = (s: string) => new Date(s).toLocaleDateString([], { month: "short", day: "numeric" });

// Master-only console: manage the /flow allowlist (the flow_access table — no
// redeploy) and browse every account's flows. The client check here is cosmetic;
// the table and cross-account reads are enforced by RLS (supabase/flow_access.sql),
// so a non-master hitting this URL sees only their own data even if the redirect
// were bypassed.
export default function FlowAdminPage() {
  const router = useRouter();
  const [me, setMe] = useState("");
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [accessErr, setAccessErr] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [flows, setFlows] = useState<AdminFlow[]>([]);
  const [flowsErr, setFlowsErr] = useState("");
  const [q, setQ] = useState("");
  const [openAcct, setOpenAcct] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session) { router.push("/login"); return; }
      const em = session.user.email ?? "";
      if (!isFlowMaster(em)) { router.push("/flow"); return; }
      setMe(em);
      const [acc, fl] = await Promise.all([
        supabase.from("flow_access").select("email, created_at").order("created_at", { ascending: true }),
        supabase
          .from("flows")
          .select("id, title, side, owner_id, updated_at, owner:profiles!owner_id(username, display_name)")
          .order("updated_at", { ascending: false }),
      ]);
      if (!active) return;
      if (acc.error) setAccessErr(acc.error.message);
      else setRows((acc.data ?? []) as AccessRow[]);
      if (fl.error) setFlowsErr(fl.error.message);
      else setFlows((fl.data ?? []) as unknown as AdminFlow[]);
    })();
    return () => { active = false; };
  }, [router]);

  async function addEmail() {
    const e = email.trim().toLowerCase();
    if (!e || busy) return;
    if (!/^\S+@\S+\.\S+$/.test(e)) { setAccessErr("That doesn't look like an email address."); return; }
    setAccessErr("");
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("flow_access").insert({ email: e, added_by: user?.id ?? null });
    setBusy(false);
    if (error) { setAccessErr(error.code === "23505" ? "That email already has access." : error.message); return; }
    setRows((prev) => [...prev, { email: e, created_at: new Date().toISOString() }]);
    setEmail("");
  }

  async function removeEmail(e: string) {
    if (e === MASTER_EMAIL) return;   // the master row stays
    setRows((prev) => prev.filter((r) => r.email !== e));
    await supabase.from("flow_access").delete().eq("email", e);
  }

  // Group flows by owner. The query is sorted by updated_at desc, so the first
  // flow seen per owner is their latest — accounts come out most-active-first.
  const accounts = useMemo<Account[]>(() => {
    const map = new Map<string, Account>();
    for (const f of flows) {
      const a = map.get(f.owner_id) ?? { ownerId: f.owner_id, username: f.owner?.username ?? "unknown", flows: [] };
      a.flows.push(f);
      map.set(f.owner_id, a);
    }
    return [...map.values()];
  }, [flows]);

  const query = q.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!query) return accounts;
    return accounts
      .map((a) => a.username.toLowerCase().includes(query)
        ? a
        : { ...a, flows: a.flows.filter((f) => f.title.toLowerCase().includes(query)) })
      .filter((a) => a.flows.length > 0);
  }, [accounts, query]);

  function toggleAcct(id: string) {
    setOpenAcct((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  const missingTable = /relation|does not exist|schema cache/i.test(accessErr);

  if (!me) {
    return (
      <div className="flow-loading">
        <div className="gh-loading-dots"><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className="flowadmin">
      <header className="flowadmin__head">
        <div>
          <p className="flowadmin__eyebrow"><ShieldCheck size={13} /> Master account</p>
          <h1 className="flowadmin__title">Flow admin</h1>
          <p className="flowadmin__sub">Signed in as {me}. Access changes apply immediately — no redeploy.</p>
        </div>
        <button className="db-btn db-btn--glass db-btn--sm" onClick={() => router.push("/flow")}>
          <ArrowLeft size={14} /> Back to flows
        </button>
      </header>

      <section className="flowadmin__section" aria-labelledby="fa-access">
        <h2 className="flowadmin__h2" id="fa-access">Who can use /flow</h2>
        <div className="flowadmin__addrow">
          <input
            className="flowadmin__input"
            type="email"
            value={email}
            placeholder="name@school.org"
            aria-label="Email to grant access"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addEmail(); }}
          />
          <button className="db-btn db-btn--accent db-btn--sm" onClick={addEmail} disabled={busy || !email.trim()}>
            {busy ? "…" : "Grant access"}
          </button>
        </div>
        {accessErr && (
          <p className="flowadmin__err">
            <AlertTriangle size={13} /> {accessErr}
            {missingTable && " — run supabase/flow_access.sql in the Supabase SQL editor first."}
          </p>
        )}
        <div className="flowadmin__list">
          {rows.map((r) => (
            <div className="flowadmin__row" key={r.email}>
              <span className="flowadmin__email">{r.email}</span>
              <span className="flowadmin__date">{fmtDay(r.created_at)}</span>
              {r.email === MASTER_EMAIL ? (
                <span className="flowadmin__masterchip">master</span>
              ) : (
                <button className="flowadmin__del" onClick={() => removeEmail(r.email)} title="Revoke access" aria-label={`Revoke access for ${r.email}`}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
          {rows.length === 0 && !accessErr && (
            <p className="flowadmin__hint">No rows yet — run supabase/flow_access.sql to create and seed the table.</p>
          )}
        </div>
      </section>

      <section className="flowadmin__section" aria-labelledby="fa-accounts">
        <h2 className="flowadmin__h2" id="fa-accounts">Every account&apos;s flows</h2>
        <input
          className="flowadmin__input flowadmin__search"
          value={q}
          placeholder="Search accounts or flow titles"
          aria-label="Search accounts or flow titles"
          onChange={(e) => setQ(e.target.value)}
        />
        {flowsErr && <p className="flowadmin__err"><AlertTriangle size={13} /> {flowsErr}</p>}
        {!flowsErr && accounts.length <= 1 && (
          <p className="flowadmin__hint">
            Only your own flows are visible — run supabase/flow_access.sql to unlock read access to everyone&apos;s.
          </p>
        )}
        <div className="flowadmin__accts">
          {shown.map((a) => {
            const open = query !== "" || openAcct.has(a.ownerId);
            return (
              <div key={a.ownerId} className="flowadmin__acct">
                <button className="flowadmin__accthead" onClick={() => toggleAcct(a.ownerId)} aria-expanded={open}>
                  {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <span className="flowadmin__acctname">@{a.username}</span>
                  <span className="flowadmin__acctmeta">
                    {a.flows.length} {a.flows.length === 1 ? "flow" : "flows"} · active {fmtDay(a.flows[0].updated_at)}
                  </span>
                </button>
                {open && (
                  <div className="flowadmin__flows">
                    {a.flows.map((f) => (
                      <button key={f.id} className="flowadmin__flow" onClick={() => router.push(`/flow/${f.id}`)} title={`Open ${f.title}`}>
                        <span className={`flow-rail__dot flow-rail__dot--${f.side ?? "other"}`} />
                        <span className="flowadmin__flowtitle">{f.title}</span>
                        <span className="flowadmin__flowmeta">{fmtDay(f.updated_at)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {query !== "" && shown.length === 0 && <p className="flowadmin__hint">Nothing matches &ldquo;{q}&rdquo;.</p>}
        </div>
      </section>
    </div>
  );
}

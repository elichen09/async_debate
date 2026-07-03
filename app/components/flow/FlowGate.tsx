"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { checkFlowAccess } from "@/lib/flowAccess";

// Gates the whole /flow subtree to allow-listed emails during testing. The list
// lives in the flow_access table (managed from /flow/admin), with the static
// list in lib/flowAccess.ts as a fallback.
export default function FlowGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session) { router.push("/login"); return; }
      const ok = await checkFlowAccess(session.user.email);
      if (!active) return;
      if (ok) { setAllowed(true); return; }
      router.push("/dashboard");
    })();
    return () => { active = false; };
  }, [router]);

  if (!allowed) {
    return (
      <div className="flow-loading">
        <div className="gh-loading-dots"><span /><span /><span /></div>
      </div>
    );
  }
  return <>{children}</>;
}

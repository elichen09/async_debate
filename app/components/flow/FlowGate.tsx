"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isFlowAllowed } from "@/lib/flowAccess";

// Gates the whole /flow subtree to allow-listed emails during testing.
export default function FlowGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session) { router.push("/login"); return; }
      if (isFlowAllowed(session.user.email)) { setAllowed(true); return; }
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

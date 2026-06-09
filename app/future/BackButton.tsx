"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

export default function BackButton({ className, style }: { className?: string; style?: CSSProperties }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className={className}
      style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.65)", padding: "8px 0", textShadow: "0 1px 4px rgba(0,0,0,0.35)", ...style }}
    >
      ← Back
    </button>
  );
}

"use client";

import { useEffect } from "react";

// Registers the FishFlower service worker — the offline shell that makes the
// /flow section installable as a desktop app (see public/flow.webmanifest and
// public/sw.js). Production only: a service worker caching dev-server assets
// makes local development very confusing.
export default function FlowPwa() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      // updateViaCache "none" re-checks sw.js on the network each visit, so a
      // deployed worker update is picked up promptly.
      .register("/sw.js", { scope: "/flow", updateViaCache: "none" })
      .catch(() => { /* unsupported or blocked — the site works fine without it */ });
  }, []);
  return null;
}

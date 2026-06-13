"use client";

import { useEffect } from "react";

/* The About page is designed for white text over a dark photographic
   background. The global scene system can otherwise swap in a *light* paper
   background (grid / dots / quiet) with higher CSS specificity, which would
   leave the white text invisible. While About is mounted we strip every scene
   class so the base dark `.db-shell` (plus the page's own /2.png) shows, then
   restore the user's saved scene on the way out. Renders nothing. */
const SCENE_CLASSES = ["gh-bg-grid", "gh-bg-dots", "gh-bg-shadow", "gh-bg-off", "gh-light"];

export default function ForceDarkScene() {
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.className;
    el.classList.remove(...SCENE_CLASSES);
    return () => {
      el.className = prev;
    };
  }, []);

  return null;
}

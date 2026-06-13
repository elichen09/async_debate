"use client";

import { useEffect } from "react";

/* Pin the light "Grid" scene (graph paper + ink text) while an auth page is
   mounted, then restore whatever scene the user had saved when they leave.
   Renders nothing. */
const SCENE_CLASSES = ["gh-bg-grid", "gh-bg-dots", "gh-bg-shadow", "gh-bg-off"];

export default function ForceGridScene() {
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.className;
    el.classList.remove(...SCENE_CLASSES);
    el.classList.add("gh-bg-grid", "gh-light");
    return () => {
      el.className = prev;
    };
  }, []);

  return null;
}

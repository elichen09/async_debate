"use client";

import { useEffect, useRef } from "react";

// Custom cursor: an accent dot with a trailing glass ring (see globals.css
// CUSTOM CURSOR section). Fine pointers only — touch devices never see it,
// and the native caret cursor returns over text fields.

const INTERACTIVE = 'a, button, select, label, summary, [role="button"]';
const TEXT_FIELDS = 'textarea, [contenteditable="true"], [contenteditable=""]';
const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "password", "url", "number", "tel"]);

// Many clickable rows in the app are divs with inline cursor:pointer, so
// selector matching alone isn't enough — also walk up checking inline style.
function isInteractive(start: Element | null): boolean {
  for (let el = start; el && el !== document.body; el = el.parentElement) {
    if (el.matches(INTERACTIVE)) return true;
    if (el instanceof HTMLElement && el.style.cursor === "pointer") return true;
  }
  return false;
}

function isTextField(start: Element | null): boolean {
  for (let el = start; el && el !== document.body; el = el.parentElement) {
    if (el.matches(TEXT_FIELDS)) return true;
    if (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type)) return true;
  }
  return false;
}

export default function CustomCursor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // any-pointer (not pointer): touchscreen laptops often report a coarse
    // primary pointer even with a mouse attached.
    if (!window.matchMedia("(any-pointer: fine)").matches) return;
    const root = rootRef.current;
    const dot = dotRef.current;
    const ring = ringRef.current;
    const spin = spinRef.current;
    if (!root || !dot || !ring || !spin) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ease = reduced ? 1 : 0.32; // ring trail; snaps when motion is reduced
    document.documentElement.classList.add("gh-cursor");

    let x = -100, y = -100;   // pointer
    let rx = -100, ry = -100; // ring, lerped toward the pointer
    let seen = false;
    let raf: number;

    function frame() {
      rx += (x - rx) * ease;
      ry += (y - ry) * ease;
      dot!.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ring!.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function onMove(e: MouseEvent) {
      x = e.clientX; y = e.clientY;
      if (!seen) { seen = true; rx = x; ry = y; root!.classList.remove("is-hidden"); }
    }
    function onOver(e: MouseEvent) {
      const t = e.target as Element | null;
      const text = isTextField(t);
      document.documentElement.classList.toggle("gh-cursor-text", text);
      root!.classList.toggle("is-text", text);
      root!.classList.toggle("is-link", !text && isInteractive(t));
    }
    function onDown(e: MouseEvent) {
      root!.classList.add("is-down");
      // One-shot spin anchored at the click point; remove/reflow/add restarts
      // the animation even on rapid clicks.
      spin!.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      spin!.classList.remove("is-go");
      void spin!.offsetWidth;
      spin!.classList.add("is-go");
    }
    function onUp() { root!.classList.remove("is-down"); }
    function onLeave() { root!.classList.add("is-hidden"); }
    function onEnter() { root!.classList.remove("is-hidden"); }
    // Touch input on a hybrid device: hide until the mouse moves again.
    function onTouch() { seen = false; root!.classList.add("is-hidden"); }

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("blur", onLeave);
    window.addEventListener("touchstart", onTouch, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.documentElement.addEventListener("mouseenter", onEnter);

    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove("gh-cursor", "gh-cursor-text");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("touchstart", onTouch);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.documentElement.removeEventListener("mouseenter", onEnter);
    };
  }, []);

  return (
    <div ref={rootRef} className="gh-cursor-layer is-hidden" aria-hidden="true">
      <div ref={spinRef} className="gh-cursor-spin"><i /></div>
      <div ref={ringRef} className="gh-cursor-ring"><i /></div>
      <div ref={dotRef} className="gh-cursor-dot"><i /></div>
    </div>
  );
}

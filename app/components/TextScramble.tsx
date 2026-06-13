"use client";

import { createElement, useEffect, useRef, useState, type CSSProperties } from "react";

// Text scramble effect: characters resolve left-to-right out of static.
// Ported from the framer-motion version but dependency-free — the effect is
// just an interval, no motion features needed.

type TextScrambleProps = {
  children: string;
  duration?: number;       // seconds for the whole reveal
  speed?: number;          // seconds per frame
  characterSet?: string;
  as?: React.ElementType;
  className?: string;
  style?: CSSProperties;
  trigger?: boolean;
  rescrambleOnHover?: boolean;
  onScrambleComplete?: () => void;
};

const defaultChars =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function TextScramble({
  children,
  duration = 0.8,
  speed = 0.04,
  characterSet = defaultChars,
  className,
  style,
  as: Component = "p",
  trigger = true,
  rescrambleOnHover = false,
  onScrambleComplete,
}: TextScrambleProps) {
  const [displayText, setDisplayText] = useState(children);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const text = children;

  function scramble() {
    if (intervalRef.current) return; // already animating
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayText(text);
      onScrambleComplete?.();
      return;
    }

    const steps = duration / speed;
    let step = 0;

    intervalRef.current = setInterval(() => {
      let scrambled = "";
      const progress = step / steps;

      for (let i = 0; i < text.length; i++) {
        if (text[i] === " ") {
          scrambled += " ";
          continue;
        }
        if (progress * text.length > i) {
          scrambled += text[i];
        } else {
          scrambled +=
            characterSet[Math.floor(Math.random() * characterSet.length)];
        }
      }

      setDisplayText(scrambled);
      step++;

      if (step > steps) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setDisplayText(text);
        onScrambleComplete?.();
      }
    }, speed * 1000);
  }

  useEffect(() => {
    if (trigger) scramble();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  // createElement (not JSX) so the polymorphic `as` element keeps a normal
  // children type — three.js' global JSX augmentation otherwise collapses a
  // bare <Component> child prop to `never`.
  return createElement(
    Component,
    {
      className,
      style,
      onMouseEnter: rescrambleOnHover ? () => scramble() : undefined,
    },
    displayText,
  );
}

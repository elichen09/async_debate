"use client";

import { useEffect, useRef, useState } from "react";

/* =========================================================================
   AUTH CHARACTERS — a little ensemble of debaters that watch your cursor.
   Adapted from the "animated characters login" concept and re-themed to the
   Grasshopper forest palette. Driven entirely by props so each auth page can
   wire in its own form state:
     • eyes track the cursor and bodies lean toward it
     • they glance at each other the moment you focus a field   (`typing`)
     • they cover their eyes — with the odd sneaky peek — when you
       reveal your password                          (`revealPassword`)
   ========================================================================= */

// Forest-meshed body colors (was purple / black / orange / yellow)
const C = {
  tall: "#4FA463", // back rectangle — grasshopper green
  ink: "#26352C", // middle rectangle — deep forest
  warm: "#E2A45B", // front-left dome — wheat / amber
  sage: "#C9DA8C", // front-right — pale sage
  pupil: "#26352C", // deep forest ink for pupils
} as const;

interface PupilProps {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
}

const Pupil = ({
  size = 12,
  maxDistance = 5,
  pupilColor = C.pupil,
  forceLookX,
  forceLookY,
}: PupilProps) => {
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const pupilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const calculatePupilPosition = () => {
    if (!pupilRef.current) return { x: 0, y: 0 };
    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }
    const pupil = pupilRef.current.getBoundingClientRect();
    const pupilCenterX = pupil.left + pupil.width / 2;
    const pupilCenterY = pupil.top + pupil.height / 2;
    const deltaX = mouseX - pupilCenterX;
    const deltaY = mouseY - pupilCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  };

  const p = calculatePupilPosition();

  return (
    <div
      ref={pupilRef}
      className="rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        backgroundColor: pupilColor,
        transform: `translate(${p.x}px, ${p.y}px)`,
        transition: "transform 0.1s ease-out",
      }}
    />
  );
};

interface EyeBallProps {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
}

const EyeBall = ({
  size = 48,
  pupilSize = 16,
  maxDistance = 10,
  eyeColor = "white",
  pupilColor = C.pupil,
  isBlinking = false,
  forceLookX,
  forceLookY,
}: EyeBallProps) => {
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const eyeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const calculatePupilPosition = () => {
    if (!eyeRef.current) return { x: 0, y: 0 };
    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }
    const eye = eyeRef.current.getBoundingClientRect();
    const eyeCenterX = eye.left + eye.width / 2;
    const eyeCenterY = eye.top + eye.height / 2;
    const deltaX = mouseX - eyeCenterX;
    const deltaY = mouseY - eyeCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  };

  const p = calculatePupilPosition();

  return (
    <div
      style={{
        width: `${size}px`,
        height: isBlinking ? "2px" : `${size}px`,
        borderRadius: "50%",
        backgroundColor: eyeColor,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.15s ease",
      }}
      ref={eyeRef}
    >
      {!isBlinking && (
        <div
          style={{
            width: `${pupilSize}px`,
            height: `${pupilSize}px`,
            borderRadius: "50%",
            backgroundColor: pupilColor,
            transform: `translate(${p.x}px, ${p.y}px)`,
            transition: "transform 0.1s ease-out",
          }}
        />
      )}
    </div>
  );
};

type AuthCharactersProps = {
  /** A field is focused — the crew glances at each other, then back to you. */
  typing?: boolean;
  /** The password is shown — they avert their eyes (and occasionally peek). */
  revealPassword?: boolean;
  /** How many characters are in the password — drives the guarding stance. */
  passwordLength?: number;
};

export default function AuthCharacters({
  typing = false,
  revealPassword = false,
  passwordLength = 0,
}: AuthCharactersProps) {
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const [isGreenBlinking, setIsGreenBlinking] = useState(false);
  const [isInkBlinking, setIsInkBlinking] = useState(false);
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);

  const greenRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLDivElement>(null);
  const sageRef = useRef<HTMLDivElement>(null);
  const warmRef = useRef<HTMLDivElement>(null);

  const show = revealPassword;
  const pwLen = passwordLength;
  const hasHiddenPw = pwLen > 0 && !show;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Independent random blinks (3–7s) for the two characters with whites.
  useEffect(() => {
    let active = true;
    let id: ReturnType<typeof setTimeout> | undefined;
    function loop() {
      id = setTimeout(() => {
        if (!active) return;
        setIsGreenBlinking(true);
        id = setTimeout(() => {
          if (!active) return;
          setIsGreenBlinking(false);
          loop();
        }, 150);
      }, Math.random() * 4000 + 3000);
    }
    loop();
    return () => { active = false; if (id) clearTimeout(id); };
  }, []);

  useEffect(() => {
    let active = true;
    let id: ReturnType<typeof setTimeout> | undefined;
    function loop() {
      id = setTimeout(() => {
        if (!active) return;
        setIsInkBlinking(true);
        id = setTimeout(() => {
          if (!active) return;
          setIsInkBlinking(false);
          loop();
        }, 150);
      }, Math.random() * 4000 + 3000);
    }
    loop();
    return () => { active = false; if (id) clearTimeout(id); };
  }, []);

  // Glance at each other the moment a field gains focus, then resume tracking.
  useEffect(() => {
    if (!typing) {
      setIsLookingAtEachOther(false);
      return;
    }
    setIsLookingAtEachOther(true);
    const t = setTimeout(() => setIsLookingAtEachOther(false), 800);
    return () => clearTimeout(t);
  }, [typing]);

  // Sneaky peeks while the password is on display.
  useEffect(() => {
    if (!(pwLen > 0 && show)) {
      setIsPeeking(false);
      return;
    }
    const t = setTimeout(() => {
      setIsPeeking(true);
      setTimeout(() => setIsPeeking(false), 800);
    }, Math.random() * 3000 + 2000);
    return () => clearTimeout(t);
  }, [pwLen, show, isPeeking]);

  const calculatePosition = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return { faceX: 0, faceY: 0, bodySkew: 0 };
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 3;
    const deltaX = mouseX - centerX;
    const deltaY = mouseY - centerY;
    const faceX = Math.max(-15, Math.min(15, deltaX / 20));
    const faceY = Math.max(-10, Math.min(10, deltaY / 30));
    const bodySkew = Math.max(-6, Math.min(6, -deltaX / 120));
    return { faceX, faceY, bodySkew };
  };

  const greenPos = calculatePosition(greenRef);
  const inkPos = calculatePosition(inkRef);
  const sagePos = calculatePosition(sageRef);
  const warmPos = calculatePosition(warmRef);

  return (
    <div className="gh-auth-crew" aria-hidden="true">
      {/* Green tall rectangle — back layer */}
      <div
        ref={greenRef}
        style={{
          position: "absolute",
          bottom: 0,
          left: "70px",
          width: "180px",
          height: typing || hasHiddenPw ? "440px" : "400px",
          backgroundColor: C.tall,
          borderRadius: "10px 10px 0 0",
          zIndex: 1,
          transform: show
            ? "skewX(0deg)"
            : typing || hasHiddenPw
              ? `skewX(${greenPos.bodySkew - 12}deg) translateX(40px)`
              : `skewX(${greenPos.bodySkew}deg)`,
          transformOrigin: "bottom center",
          transition: "all 0.7s ease-in-out",
        }}
      >
        <div
          style={{
            position: "absolute",
            display: "flex",
            gap: "32px",
            left: show ? "20px" : isLookingAtEachOther ? "55px" : `${45 + greenPos.faceX}px`,
            top: show ? "35px" : isLookingAtEachOther ? "65px" : `${40 + greenPos.faceY}px`,
            transition: "all 0.7s ease-in-out",
          }}
        >
          {[0, 1].map((i) => (
            <EyeBall
              key={i}
              size={18}
              pupilSize={7}
              maxDistance={5}
              isBlinking={isGreenBlinking}
              forceLookX={show ? (isPeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined}
              forceLookY={show ? (isPeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined}
            />
          ))}
        </div>
      </div>

      {/* Ink tall rectangle — middle layer */}
      <div
        ref={inkRef}
        style={{
          position: "absolute",
          bottom: 0,
          left: "240px",
          width: "120px",
          height: "310px",
          backgroundColor: C.ink,
          borderRadius: "8px 8px 0 0",
          zIndex: 2,
          transform: show
            ? "skewX(0deg)"
            : isLookingAtEachOther
              ? `skewX(${inkPos.bodySkew * 1.5 + 10}deg) translateX(20px)`
              : typing || hasHiddenPw
                ? `skewX(${inkPos.bodySkew * 1.5}deg)`
                : `skewX(${inkPos.bodySkew}deg)`,
          transformOrigin: "bottom center",
          transition: "all 0.7s ease-in-out",
        }}
      >
        <div
          style={{
            position: "absolute",
            display: "flex",
            gap: "24px",
            left: show ? "10px" : isLookingAtEachOther ? "32px" : `${26 + inkPos.faceX}px`,
            top: show ? "28px" : isLookingAtEachOther ? "12px" : `${32 + inkPos.faceY}px`,
            transition: "all 0.7s ease-in-out",
          }}
        >
          {[0, 1].map((i) => (
            <EyeBall
              key={i}
              size={16}
              pupilSize={6}
              maxDistance={4}
              isBlinking={isInkBlinking}
              forceLookX={show ? -4 : isLookingAtEachOther ? 0 : undefined}
              forceLookY={show ? -4 : isLookingAtEachOther ? -4 : undefined}
            />
          ))}
        </div>
      </div>

      {/* Warm dome — front left */}
      <div
        ref={warmRef}
        style={{
          position: "absolute",
          bottom: 0,
          left: "0px",
          width: "240px",
          height: "200px",
          backgroundColor: C.warm,
          borderRadius: "120px 120px 0 0",
          zIndex: 3,
          transform: show ? "skewX(0deg)" : `skewX(${warmPos.bodySkew}deg)`,
          transformOrigin: "bottom center",
          transition: "all 0.7s ease-in-out",
        }}
      >
        <div
          style={{
            position: "absolute",
            display: "flex",
            gap: "32px",
            left: show ? "50px" : `${82 + warmPos.faceX}px`,
            top: show ? "85px" : `${90 + warmPos.faceY}px`,
            transition: "all 0.2s ease-out",
          }}
        >
          <Pupil size={12} maxDistance={5} forceLookX={show ? -5 : undefined} forceLookY={show ? -4 : undefined} />
          <Pupil size={12} maxDistance={5} forceLookX={show ? -5 : undefined} forceLookY={show ? -4 : undefined} />
        </div>
      </div>

      {/* Sage rectangle — front right */}
      <div
        ref={sageRef}
        style={{
          position: "absolute",
          bottom: 0,
          left: "310px",
          width: "140px",
          height: "230px",
          backgroundColor: C.sage,
          borderRadius: "70px 70px 0 0",
          zIndex: 4,
          transform: show ? "skewX(0deg)" : `skewX(${sagePos.bodySkew}deg)`,
          transformOrigin: "bottom center",
          transition: "all 0.7s ease-in-out",
        }}
      >
        <div
          style={{
            position: "absolute",
            display: "flex",
            gap: "24px",
            left: show ? "20px" : `${52 + sagePos.faceX}px`,
            top: show ? "35px" : `${40 + sagePos.faceY}px`,
            transition: "all 0.2s ease-out",
          }}
        >
          <Pupil size={12} maxDistance={5} forceLookX={show ? -5 : undefined} forceLookY={show ? -4 : undefined} />
          <Pupil size={12} maxDistance={5} forceLookX={show ? -5 : undefined} forceLookY={show ? -4 : undefined} />
        </div>
        {/* mouth */}
        <div
          style={{
            position: "absolute",
            width: "80px",
            height: "4px",
            borderRadius: "9999px",
            backgroundColor: C.ink,
            left: show ? "10px" : `${40 + sagePos.faceX}px`,
            top: show ? "88px" : `${88 + sagePos.faceY}px`,
            transition: "all 0.2s ease-out",
          }}
        />
      </div>
    </div>
  );
}

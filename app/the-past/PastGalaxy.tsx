"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import type { PastRound } from "@/lib/pastRounds";

// ---------------------------------------------------------------------------
// "The Past" — every recorded round in rounds.csv as a card floating on a
// slowly turning sphere. Drag to orbit, scroll to zoom, hover to peek, click
// to watch. Filtering/sorting re-lays-out the galaxy and the camera glides to
// fit. Cards are cheap colored tiles (color = topic); the YouTube thumbnail is
// loaded onto a card lazily once you hover it, so 800+ cards stay smooth.
// ---------------------------------------------------------------------------

const ACCENT = "#5cae72"; // forest green, echoes the site accent

// Luminous, mostly earthy palette so same-topic cards cluster by color.
const PALETTE = [
  "#6fae6b", "#79c2a8", "#5aa0c9", "#7e8ad6", "#b07cd1", "#d17ca9",
  "#d98c6a", "#d4b86a", "#9fc46a", "#6ac0a0", "#c98f8f", "#8fb0d6",
  "#b6d16a", "#69b58c", "#cf9bd6", "#e0a96d",
];
function topicColor(topic: string): string {
  let h = 0;
  for (let i = 0; i < topic.length; i++) h = (h * 31 + topic.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Stars are colour-coded by topic: each resolution maps to a distinct,
// luminous hue so same-topic rounds glow the same colour and you can read the
// archive's clusters at a glance. Bright/high-value so they still feel starry
// against the dark forest sky.
const STAR_PALETTE = [
  "#ff7a8a", "#ffa24c", "#ffd24c", "#c9f06b", "#7fe08a", "#5ad1a8",
  "#4fd6d6", "#5ab8ff", "#7a93ff", "#b07cff", "#e07cff", "#ff7ad0",
  "#ff9b6b", "#ffe08a", "#9be07f", "#6be0c0", "#74c7ff", "#c79bff",
];
function starColor(topic: string): string {
  let h = 0;
  for (let i = 0; i < topic.length; i++) h = (h * 31 + topic.charCodeAt(i)) >>> 0;
  return STAR_PALETTE[h % STAR_PALETTE.length];
}

// One shared 5-point star outline reused by every star (and its hover halo).
function makeStarGeometry(outer = 0.5, inner = 0.21, points = 5): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
const STAR_GEO = makeStarGeometry();

// At/under this many visible rounds we switch from the star field to detailed
// thumbnail cards — narrow the filters and the constellation resolves to rounds.
const CARD_LIMIT = 80;

// Even point distribution on a sphere (Fibonacci spiral).
function spherePositions(n: number, radius: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / denom) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    pts.push([Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius]);
  }
  return pts;
}

// Shared, deduped thumbnail loader. Cross-origin so the texture isn't tainted;
// on any failure we just keep the colored tile.
const texCache = new Map<string, THREE.Texture>();
const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin("anonymous");
function getThumb(url: string, cb: (t: THREE.Texture | null) => void) {
  const cached = texCache.get(url);
  if (cached) return cb(cached);
  texLoader.load(
    url,
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      texCache.set(url, t);
      cb(t);
    },
    undefined,
    () => cb(null),
  );
}

// --- sorting / filtering -----------------------------------------------------

type SortKey = "new" | "old" | "topic" | "event" | "round";

const SORTS: Record<SortKey, (a: PastRound, b: PastRound) => number> = {
  new: (a, b) => (b.year ?? 0) - (a.year ?? 0) || b.stageRank - a.stageRank,
  old: (a, b) => (a.year ?? 0) - (b.year ?? 0) || a.stageRank - b.stageRank,
  topic: (a, b) => a.topic.localeCompare(b.topic) || (b.year ?? 0) - (a.year ?? 0),
  event: (a, b) => a.event.localeCompare(b.event) || (b.year ?? 0) - (a.year ?? 0),
  round: (a, b) => b.stageRank - a.stageRank || (b.year ?? 0) - (a.year ?? 0),
};

const STAGE_FILTERS = ["All", "Finals", "Semis", "Quarters", "Octos", "Doubles", "Triples", "Prelims", "Demo"] as const;

function stageMatch(stage: string, f: string): boolean {
  switch (f) {
    case "Finals": return /final/i.test(stage);
    case "Semis": return /semi/i.test(stage);
    case "Quarters": return /quarter/i.test(stage);
    case "Octos": return /octo/i.test(stage);
    case "Doubles": return /double|dubs/i.test(stage);
    case "Triples": return /triple|trips/i.test(stage);
    case "Prelims": return /^\s*r\s*\d+/i.test(stage) || /round\s*\d+/i.test(stage);
    case "Demo": return /demo/i.test(stage);
    default: return true;
  }
}

// --- 3D card -----------------------------------------------------------------

type CardProps = {
  round: PastRound;
  position: [number, number, number];
  hovered: boolean;
  eager: boolean;
  color: string;
  onHover: (r: PastRound | null) => void;
  onSelect: (r: PastRound) => void;
};

const RoundCard = memo(
  function RoundCard({ round, position, hovered, eager, color, onHover, onSelect }: CardProps) {
    const ref = useRef<THREE.Mesh>(null);
    const appear = useRef(0);
    const [tex, setTex] = useState<THREE.Texture | null>(null);
    const target = useMemo(
      () => new THREE.Vector3(position[0], position[1], position[2]),
      [position],
    );

    useEffect(() => {
      if ((!hovered && !eager) || tex) return;
      let alive = true;
      getThumb(round.thumb, (t) => {
        if (alive && t) setTex(t);
      });
      return () => {
        alive = false;
      };
    }, [hovered, eager, tex, round.thumb]);

    useFrame(({ camera }) => {
      const m = ref.current;
      if (!m) return;
      m.position.lerp(target, 0.1);
      m.quaternion.copy(camera.quaternion); // billboard toward camera
      appear.current = THREE.MathUtils.lerp(appear.current, hovered ? 1.55 : 1, 0.16);
      m.scale.setScalar(appear.current);
    });

    return (
      <mesh
        ref={ref}
        renderOrder={hovered ? 3 : 1}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(round);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(round);
        }}
      >
        <planeGeometry args={[1.9, 1.07]} />
        {/* key flips when the thumbnail arrives so the material recompiles
            with USE_MAP — otherwise three keeps the map-less shader and the
            texture never samples (card stays a flat color). */}
        <meshBasicMaterial
          key={tex ? "mapped" : "flat"}
          side={THREE.DoubleSide}
          map={tex ?? undefined}
          color={tex ? "#ffffff" : color}
          toneMapped={false}
        />
        {hovered && (
          <mesh position={[0, 0, -0.04]}>
            <planeGeometry args={[2.12, 1.29]} />
            <meshBasicMaterial color={ACCENT} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        )}
      </mesh>
    );
  },
  (a, b) =>
    a.round === b.round &&
    a.position === b.position &&
    a.hovered === b.hovered &&
    a.eager === b.eager &&
    a.color === b.color &&
    a.onHover === b.onHover &&
    a.onSelect === b.onSelect,
);

// --- 3D star (the unfiltered archive view) -----------------------------------

type StarProps = {
  round: PastRound;
  position: [number, number, number];
  hovered: boolean;
  color: string;
  onHover: (r: PastRound | null) => void;
  onSelect: (r: PastRound) => void;
};

const RoundStar = memo(
  function RoundStar({ round, position, hovered, color, onHover, onSelect }: StarProps) {
    const group = useRef<THREE.Group>(null);
    const appear = useRef(0);
    const target = useMemo(
      () => new THREE.Vector3(position[0], position[1], position[2]),
      [position],
    );
    // Deeper elim rounds shine a little bigger — finals are the bright stars.
    const baseScale = 1.0 + (round.stageRank / 100) * 0.6;

    useFrame(({ camera }) => {
      const g = group.current;
      if (!g) return;
      g.position.lerp(target, 0.1);
      g.quaternion.copy(camera.quaternion); // billboard toward camera
      const goal = (hovered ? 1.9 : 1) * baseScale;
      appear.current = THREE.MathUtils.lerp(appear.current, goal, 0.16);
      g.scale.setScalar(appear.current);
    });

    return (
      <group ref={group}>
        <mesh
          geometry={STAR_GEO}
          renderOrder={hovered ? 3 : 1}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(round);
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            onHover(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(round);
          }}
        >
          <meshBasicMaterial color={hovered ? "#ffffff" : color} side={THREE.DoubleSide} toneMapped={false} transparent opacity={0.96} />
        </mesh>
        {hovered && (
          <mesh geometry={STAR_GEO} position={[0, 0, -0.02]} scale={1.6}>
            <meshBasicMaterial color={ACCENT} side={THREE.DoubleSide} toneMapped={false} transparent opacity={0.4} />
          </mesh>
        )}
      </group>
    );
  },
  (a, b) =>
    a.round === b.round &&
    a.position === b.position &&
    a.hovered === b.hovered &&
    a.color === b.color &&
    a.onHover === b.onHover &&
    a.onSelect === b.onSelect,
);

// --- camera auto-fit ---------------------------------------------------------

// When the visible set (and thus radius) changes, glide the camera to frame it,
// then hand control back so the user's own zoom isn't fought every frame.
function FitCamera({ radius }: { radius: number }) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as { update?: () => void } | null;
  const fit = useRef({ target: camDistFor(radius), active: true });

  useEffect(() => {
    fit.current = { target: camDistFor(radius), active: true };
  }, [radius]);

  useFrame(() => {
    if (!fit.current.active) return;
    const dist = camera.position.length() || 1;
    const next = THREE.MathUtils.lerp(dist, fit.current.target, 0.06);
    camera.position.multiplyScalar(next / dist);
    controls?.update?.();
    if (Math.abs(next - fit.current.target) < 0.4) fit.current.active = false;
  });
  return null;
}

// --- the scene ---------------------------------------------------------------

type SceneProps = {
  rounds: PastRound[];
  positions: [number, number, number][];
  hoveredId: string | null;
  showCards: boolean;
  radius: number;
  onHover: (r: PastRound | null) => void;
  onSelect: (r: PastRound) => void;
};

// Frame distance the camera settles at — fog is derived from this (not from
// radius alone) so a 12-card view reads the same as an 800-card view.
function camDistFor(radius: number): number {
  return radius * 2.4 + 8;
}

function GalaxyScene({ rounds, positions, hoveredId, showCards, radius, onHover, onSelect }: SceneProps) {
  const camDist = camDistFor(radius);
  return (
    <>
      <color attach="background" args={["#070b09"]} />
      <fog attach="fog" args={["#070b09", camDist - radius * 0.6, camDist + radius * 2.6]} />
      <ambientLight intensity={0.9} />
      <Stars radius={Math.max(140, radius * 4)} depth={70} count={5000} factor={4} saturation={0} fade speed={0.4} />
      <mesh>
        <sphereGeometry args={[radius * 0.55, 28, 28]} />
        <meshBasicMaterial color={ACCENT} wireframe transparent opacity={0.05} />
      </mesh>
      {rounds.map((r, i) =>
        showCards ? (
          <RoundCard
            key={r.id}
            round={r}
            position={positions[i]}
            hovered={hoveredId === r.id}
            eager
            color={topicColor(r.topic)}
            onHover={onHover}
            onSelect={onSelect}
          />
        ) : (
          <RoundStar
            key={r.id}
            round={r}
            position={positions[i]}
            hovered={hoveredId === r.id}
            color={starColor(r.topic)}
            onHover={onHover}
            onSelect={onSelect}
          />
        ),
      )}
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        autoRotate
        autoRotateSpeed={0.3}
        rotateSpeed={0.6}
        zoomSpeed={0.85}
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={radius * 5 + 24}
      />
      <FitCamera radius={radius} />
    </>
  );
}

// --- page shell --------------------------------------------------------------

export default function PastGalaxy({ rounds }: { rounds: PastRound[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [q, setQ] = useState("");
  const [topic, setTopic] = useState("All");
  const [event, setEvent] = useState("All");
  const [year, setYear] = useState("All");
  const [stage, setStage] = useState("All");
  const [sort, setSort] = useState<SortKey>("new");
  const [hovered, setHovered] = useState<PastRound | null>(null);
  const [selected, setSelected] = useState<PastRound | null>(null);

  const facets = useMemo(
    () => ({
      topics: [...new Set(rounds.map((r) => r.topic))].sort((a, b) => a.localeCompare(b)),
      events: [...new Set(rounds.map((r) => r.event))].sort((a, b) => a.localeCompare(b)),
      years: [...new Set(rounds.map((r) => r.year))]
        .filter((y): y is number => y != null)
        .sort((a, b) => b - a),
    }),
    [rounds],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rounds.filter((r) => {
      if (topic !== "All" && r.topic !== topic) return false;
      if (event !== "All" && r.event !== event) return false;
      if (year !== "All" && String(r.year) !== year) return false;
      if (stage !== "All" && !stageMatch(r.stage, stage)) return false;
      if (needle) {
        const hay = `${r.teamA} ${r.teamB} ${r.topic} ${r.tournament} ${r.stage}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    return list.sort(SORTS[sort]);
  }, [rounds, q, topic, event, year, stage, sort]);

  const radius = Math.max(7, Math.sqrt(Math.max(1, visible.length)) * 0.95);
  const positions = useMemo(() => spherePositions(visible.length, radius), [visible.length, radius]);
  const showCards = visible.length <= CARD_LIMIT;

  const onHover = useCallback((r: PastRound | null) => setHovered(r), []);
  const onSelect = useCallback((r: PastRound) => setSelected(r), []);

  // Hover card follows the cursor without re-rendering React each move.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = panelRef.current;
      if (!el || el.style.display === "none") return;
      const pad = 18;
      const w = el.offsetWidth || 230;
      const h = el.offsetHeight || 170;
      let x = e.clientX + pad;
      let y = e.clientY + pad;
      if (x + w > window.innerWidth) x = e.clientX - w - pad;
      if (y + h > window.innerHeight) y = e.clientY - h - pad;
      el.style.transform = `translate(${x}px, ${y}px)`;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // Esc closes the player.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function reset() {
    setQ("");
    setTopic("All");
    setEvent("All");
    setYear("All");
    setStage("All");
    setSort("new");
  }

  if (!mounted) {
    return (
      <div className="gh-past-root gh-past-loading">
        <span>Charting {rounds.length} rounds…</span>
      </div>
    );
  }

  const filtersOn = q !== "" || topic !== "All" || event !== "All" || year !== "All" || stage !== "All";

  return (
    <div className="gh-past-root">
      <Canvas
        camera={{ position: [0, 3, 44], fov: 55 }}
        dpr={[1, 1.8]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <GalaxyScene
          rounds={visible}
          positions={positions}
          hoveredId={hovered?.id ?? null}
          showCards={showCards}
          radius={radius}
          onHover={onHover}
          onSelect={onSelect}
        />
      </Canvas>

      {/* heading + controls, stacked top-left */}
      <div className="gh-past-ui">
        <div className="gh-past-head">
          <Link href="/" className="gh-past-back">← Grasshopper</Link>
          <h1 className="gh-past-title">The Past</h1>
          <p className="gh-past-sub">
            {rounds.length} recorded rounds — orbit the archive, hover to peek, click to watch.
          </p>
        </div>

        <div className="gh-past-controls">
          <input
            className="gh-past-input"
            type="search"
            placeholder="Search team, topic, tournament…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search rounds"
          />
          <div className="gh-past-selects">
            <label className="gh-past-field">
              <span>Topic</span>
              <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="All">All topics</option>
                {facets.topics.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="gh-past-field">
              <span>Tournament</span>
              <select value={event} onChange={(e) => setEvent(e.target.value)}>
                <option value="All">All tournaments</option>
                {facets.events.map((ev) => (
                  <option key={ev} value={ev}>{ev}</option>
                ))}
              </select>
            </label>
            <label className="gh-past-field">
              <span>Year</span>
              <select value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="All">All years</option>
                {facets.years.map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </label>
            <label className="gh-past-field">
              <span>Round</span>
              <select value={stage} onChange={(e) => setStage(e.target.value)}>
                {STAGE_FILTERS.map((s) => (
                  <option key={s} value={s}>{s === "All" ? "All rounds" : s}</option>
                ))}
              </select>
            </label>
            <label className="gh-past-field">
              <span>Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="new">Newest first</option>
                <option value="old">Oldest first</option>
                <option value="round">Elims first</option>
                <option value="topic">By topic</option>
                <option value="event">By tournament</option>
              </select>
            </label>
          </div>
          <div className="gh-past-meta">
            <span className="gh-past-count">{visible.length} shown</span>
            {filtersOn && (
              <button type="button" className="gh-past-reset" onClick={reset}>Clear filters</button>
            )}
          </div>
        </div>
      </div>

      {/* cursor-following hover peek */}
      <div ref={panelRef} className="gh-past-hover" style={{ display: hovered ? "block" : "none" }}>
        {hovered && (
          <>
            <img
              src={hovered.thumb}
              alt=""
              loading="lazy"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset.fallback) {
                  img.dataset.fallback = "1";
                  img.src = `https://img.youtube.com/vi/${hovered.videoId}/0.jpg`;
                }
              }}
            />
            <div className="gh-past-hover__body">
              <strong>{hovered.teamA} <em>vs</em> {hovered.teamB}</strong>
              <span className="gh-past-hover__meta">
                {hovered.event}{hovered.year ? ` ${hovered.year}` : ""} · {hovered.stage || "—"}
              </span>
              <span className="gh-past-tag" style={{ background: topicColor(hovered.topic) }}>{hovered.topic}</span>
            </div>
          </>
        )}
      </div>

      {visible.length === 0 && (
        <div className="gh-past-empty">
          <p>No rounds match those filters.</p>
          <button type="button" className="gh-past-reset" onClick={reset}>Clear filters</button>
        </div>
      )}

      {/* player */}
      {selected && (
        <div className="gh-past-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="gh-past-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="gh-past-modal__close" onClick={() => setSelected(null)} aria-label="Close">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <div className="gh-past-modal__video">
              <iframe
                src={`https://www.youtube.com/embed/${selected.videoId}`}
                title={`${selected.teamA} vs ${selected.teamB}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="gh-past-modal__info">
              <h2>{selected.teamA} <em>vs</em> {selected.teamB}</h2>
              <p className="gh-past-modal__meta">
                <span>{selected.tournament || selected.event}</span>
                {selected.stage && <span> · {selected.stage}</span>}
                <span className="gh-past-tag" style={{ background: topicColor(selected.topic) }}>{selected.topic}</span>
              </p>
              <a className="gh-past-watch" href={selected.url} target="_blank" rel="noopener noreferrer">
                Watch on YouTube ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

# Design System: Async Debate
**Visual language:** Cozy Photobook

---

## Configuration

| Dial | Level | Rationale |
|------|-------|-----------|
| **Creativity** | `7` | Strong editorial personality through serif fonts, polaroid elements, and washi tape details — grounded, not chaotic |
| **Density** | `4` | Generous breathing room; content-first without feeling gallery-sparse |
| **Variance** | `7` | Intentional asymmetry (rotated cards, two-col bento, polaroid tilt) without losing coherence |
| **Motion** | `5` | Subtle load-rise and scroll-reveal animations; hover spring on cards; polaroid tilt on hover |

---

## 1. Visual Theme & Atmosphere

The interface evokes a handmade nature journal or analog photo album. Pages are warm linen paper; debate rounds surface as album elements — polaroid photographs held with washi tape, caption cards with italic serif annotations, corner brackets marking page zones. The typographic register is literary and considered: Playfair Display for headings and labels (italic for warmth), Lora for body prose, Geist Mono for scores and ELO numbers.

The overall impression: a premium artifact made by someone who cares, not a startup template.

---

## 2. Color Palette

### Mode tokens
| Token | Light | Dark | Role |
|-------|-------|------|------|
| `--paper` | `#f8f4ed` | `#1a1510` | Page background |
| `--paper-2` | `#ede8df` | `#231d16` | Subtle inset areas |
| `--card` | `#fdfaf5` | `#2a2318` | Card/panel fill |
| `--ink` | `#1e1710` | `#f5eddf` | Primary text |
| `--ink-soft` | `#5a4835` | `#b09a7e` | Body / secondary text |
| `--muted` | `#9c8672` | `#7a6550` | Labels, captions, eyebrows |
| `--line` | `rgba(60,38,18,.10)` | `rgba(245,224,188,.09)` | Borders, dividers |

### Accent schemes (user-selectable)
| Scheme | Hex | Mood |
|--------|-----|------|
| `ember` (default) | `#b85c2a` | Warmth, debate fire |
| `gold` | `#b88a2a` | Trophy, prestige |
| `azure` | `#4278a0` | Logic, clarity |
| `violet` | `#7060a0` | Nuance, craft |
| `emerald` | `#4a7c58` | Growth, nature |

### Banned
- Pure black `#000000` — always use `--ink`
- Neon or purple gradients
- Mixed warm/cool gray systems
- Oversaturated accents above 80% saturation

---

## 3. Typography

| Role | Font | Weight | Size | Style |
|------|------|--------|------|-------|
| Display / H1 | Playfair Display | 700 | `clamp(44px, 6.5vw, 82px)` | Normal or italic `<span>` for emphasis |
| Section heading / H2 | Playfair Display | 700 | `clamp(26px, 4vw, 42px)` | Normal |
| Card heading / H3 | Playfair Display | 700 | `19px` | Normal |
| Eyebrow / label | Playfair Display | 400 | `13px` | Italic, `letter-spacing: 0.04em` |
| Body prose | Lora | 400 | `16px` | Normal, `line-height: 1.72` |
| Scores / ELO / mono data | Geist Mono | 600 | `24px` (stat), `15px` (topbar) | Normal, `tnum` feature enabled |

`text-wrap: balance` is applied to all headings.

### Banned
- Generic serif stacks (`Times New Roman`, `Georgia`) as fallback are acceptable for the cascade but must never be the visible font
- `Inter` — blocked in favor of the serif/mono system

---

## 4. Component Language

### Cards (`.db-card`)
Warm paper fill (`--card`), 1px border (`--line`), 8px border-radius, warm-tinted shadow. Corner bracket pseudo-elements (top-left `::before`, bottom-right `::after`) in 45% accent color — a photo album corner protector motif.

**Accent variant:** `.db-card--accent` / `.db-home__step--accent` — 8% accent tint in background, stronger corner brackets, solid accent top border.

### Double-bezel (Doppelrand) testimonial cards
Outer ring: 3px padding, `--card` fill, 2px accent top border. Inner ring: `--paper` fill, 1px border, radius − 2px. Creates nested-frame depth without heavy shadow.

### Polaroid
White (light) or dark-warm (dark mode) border. Bottom caption area with italic Playfair Display. Washi tape strip (`::before` with diagonal texture stripes). 2.2° tilt, smooths to 0.4° on hover.

### Buttons
Italic Playfair Display at 15px. Three variants:
- `.db-btn--accent` — accent fill, `--accent-ink` text, warm ring shadow
- `.db-btn--ghost` — transparent fill, `--ink-soft` text, `--line-strong` border
- `.db-btn--primary` — `--primary-bg` fill (ink in light, cream in dark)
- `.db-btn--lg` — 56px height, 17px font (hero-scale CTA)

**Button-in-button trailing icon:** `.db-btn__arrow` — 22px circle pill, `rgba(255,255,255,.22)` fill inside accent button, translates `(2px, -1px)` on hover.

### Inputs
Italic Playfair Display. Accent border on focus with 3px accent ring. Serif italic placeholder text.

---

## 5. Page Structure — AIDA

| Section | Class | Pattern | Animation |
|---------|-------|---------|-----------|
| **Attention** — hero | `.db-home__hero` | 2-col grid: editorial left, polaroid right | `.db-rise` stagger (0s, 0.18s) |
| **Interest** — how it works | `.db-home__steps` | Asymmetric bento `1.55fr 1fr`, first card spans 2 rows | `.db-rise` stagger (0.1s–0.3s) |
| **Desire** — ladder voices | `.db-home__voices` | Equal 2-col grid of Doppelrand quote cards | `.db-scroll-reveal` |
| **Action** — CTA | `.db-home__action` | Centered banner, accent top border, ambient glow | `.db-scroll-reveal` |

---

## 6. Motion

All animations use `transform` + `opacity` only.

| Class | Trigger | Easing | Duration |
|-------|---------|--------|----------|
| `.db-rise` | Page load | `cubic-bezier(.16,.84,.2,1)` | 720ms |
| `.db-scroll-reveal` | Scroll (`view()`) | `linear` (CSS scroll timeline) | range entry 0%–40% |
| Card hover | User hover | `cubic-bezier(.2,.8,.2,1)` | 220ms |
| Polaroid hover | User hover | `cubic-bezier(.2,.8,.2,1)` | 320ms |
| Button arrow | Btn hover | `ease` | 180ms |

`prefers-reduced-motion` disables both `.db-rise` and `.db-scroll-reveal`.

---

## 7. Layout

- Max-width: `580px` for inner pages, `1040px` for the landing page
- Container padding: `0 28px`
- `min-height: 100dvh` on shell (never `100vh`)
- CSS Grid for all structural layouts
- Sections collapse to single column below 680px
- Hero photo hidden below 800px

---

## 8. Anti-Patterns (Banned)

- Em-dash (`—`) in copy — use commas, periods, or line breaks
- Section-numbering eyebrows ("01 Challenge anyone")
- Three equal-width feature cards in a row — use asymmetric bento
- More than 2 eyebrows on the landing page (max 1 per 3 sections)
- More than 1 primary CTA intent — "Start debating" is the single CTA label everywhere
- AI-slop copy: "seamless", "elevate", "unleash", "next-gen", "revolutionize"
- Fake round numbers: `99.99%`, `50%`, `10,000+ users`
- Generic placeholder names: "John Doe", "Jane Smith", "Acme Corp"
- Broken or generic stock image URLs — use `picsum.photos/seed/{keyword}/w/h`
- Pure-black text or borders
- `z-index` values outside navbar/modal/overlay layers

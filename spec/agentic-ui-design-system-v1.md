# Agentic UI — Design System Specification (v1.0)

Inspired by  
**Macintosh Human Interface Guidelines © 1992**  
Adapted for **Agentic Systems**

---

## 0. Purpose

Agentic UI is a design system for interfaces where **software performs autonomous reasoning**, but **humans retain control, accountability, and visibility**.

This system exists to ensure:

- clarity under cognitive load  
- predictable interaction patterns  
- visible system state  
- reversible, forgivable actions  

Agentic UI treats intelligence as **infrastructure**, not personality.

---

## 1. Core Principles (Non-Negotiable)

### 1.1 Human in Control
- No hidden autonomy
- Every agent action is visible, interruptible, and explainable
- The interface must always answer: *“What is the system doing right now?”*

### 1.2 Consistency
- Identical patterns behave identically across the product
- Same structure, spacing, and semantics everywhere

### 1.3 Forgiveness
- Safe defaults
- Undo where possible
- Confirmation before irreversible actions
- Errors explained plainly

### 1.4 Visibility
- System state is never implicit
- Progress, cost, model, and scope are always visible

---

## 2. Visual DNA

- Neutral, restrained, architectural
- Light-first UI (dark mode mirrored, not reinvented)
- Typography over decoration
- Subtle depth through shadow, never color

Macintosh 1992 principles applied:
- spatial hierarchy
- clear window boundaries
- predictable behavior

---

## 3. Color System

### 3.1 Chromatic Scales

Each hue follows an 8-step perceptual ladder:

- 100–300: backgrounds / fills  
- 400–500: active states  
- 600–800: text / strokes  

**Red** — Error / Attention  
**Green** — Success / Growth  
**Blue** — Primary Accent / Links  
**Orange** — Warning / Forecast / Provisional  

No skipped values. No decorative gradients.

---

### 3.2 Semantic Color Variables

#### Background
bg.primary
bg.secondary
bg.tertiary
bg.elevated
bg.overlay

#### Foreground
fg.primary
fg.secondary
fg.tertiary
fg.disabled

#### Border
border.default
border.subtle
border.strong

#### Status
status.success
status.warning
status.error
status.info
status.disabled

Light and Dark modes are symmetrical.

---

## 4. Spacing & Dimension Tokens

### 4.1 Base Unit
- 8px system

### 4.2 Spacing Groups

**Group 1 — Proximity**
4, 8, 16, 24

Used to communicate relationships between elements.

**Group 2 — Separation**
32, 40, 48, 56, 64, 80, 96

Used to separate conceptual regions.

---

## 5. Typography

### 5.1 Typefaces

**Brand / Headings**
- Geist
- Weight: Semibold / Regular

**UI / Body**
- Inter

**System / Console**
- Monospace (e.g. JetBrains Mono)

### 5.2 Typography Philosophy
- Institutional, calm, neutral
- No expressive typography
- No decorative contrast

---

## 6. Iconography

### 6.1 Scale Grid
14 → 16 → 24 → 32 → 56 → 64


### 6.2 Rules
- Monoline
- Rounded caps
- Optical stroke correction per size
- Icons never replace labels

---

## 7. Layout & Windowing Model

All surfaces are one of:
- Window
- Panel
- Modal
- Drawer

Each has:
- a visible boundary
- a clear hierarchy
- a predictable dismissal path

No stacked modals.

---

## 8. Agent Objects (First-Class)

Agents are **operational objects**, not chat avatars.

Each agent exposes:

- Identity (name, role, model)
- Scope (what it can access)
- State (idle, running, waiting, complete, error)
- Control (start, pause, stop, configure)

---

## 9. Agent Modes

Explicit cognitive modes:
- Fast
- Reasoning
- Complex Tasks

Mode selection is:
- visible
- user-controlled
- tied to cost and latency

---

## 10. Charts & Data Visualization

- Data first
- No decoration
- No gradients
- Minimal animation only when explanatory

**Conventions**
- Actual: solid
- Forecast: hatched
- Growth: line or accent stroke

---

## 10.1 Text Morphing & Typographic Motion

Text morphing is permitted **only in brand and onboarding contexts**.

Allowed surfaces:
- Landing hero
- Intro splash
- Brand identity moments

Forbidden surfaces:
- Operational dashboards
- Agent control panels
- Metrics, logs, tables
- Error messages

Rules:
- Duration: 600–1200ms
- Easing: linear or ease-in-out
- No playful distortions
- Final state must be static and readable

---

## 10.2 Brand Materiality (Liquid Metal)

Liquid metal effects are **brand-layer only**, not UI-layer.

Allowed:
- Logo
- Hero brand marks
- Marketing visuals

Forbidden:
- Buttons
- Cards
- Panels
- Inputs
- System chrome

Operational UI must remain matte, neutral, and static.

---

## 11.11 Progress Indicators (Agent Execution)

Progress is a **first-class agent state surface**.

### Types
- Linear progress bar (deterministic tasks)
- Indeterminate bar (unknown duration)
- Step progress (Thinking → Tooling → Executing → Complete)

### Rules
- Always show % when measurable
- Show current phase label
- Provide ETA when available
- No looping spinners for long tasks (>2s)

Progress must convey **cognitive state**, not loading theatrics.

---

## 11.12 Toasts & Notifications

Notifications are **operational telemetry**, not UX sugar.

### Severity Levels
| Level | Use Case | Persistence |
|-------|----------|-------------|
| Info | Agent action completed | Auto-dismiss |
| Success | Task completed | Auto-dismiss |
| Warning | Human attention recommended | Sticky |
| Error | Human action required | Sticky + modal fallback |

### Rules
- Toasts never block core workflows
- Critical errors escalate to modal or panel
- Notifications must be logged in system feed

---

## 11.13 Tables (Operational Surfaces)

Tables are **control surfaces for system state**.

### Required Features
- Deterministic sorting indicators
- Row-level status chips
- Inline avatars / ownership indicators
- Zebra or subtle row separation
- Fixed header and key columns
- Keyboard navigation
- Row drilldown affordance (›)

### State Encoding
| State | Treatment |
|-------|-----------|
| Parsing | Neutral badge |
| Needs Review | Warning badge |
| Synced | Success badge |
| Error | Error badge |

Tables must prioritize scanability over aesthetics.

---

## 11.14 Agent Ops Dashboards

Dashboards are **control planes**, not analytics toys.

### Required Components
- KPI cards with delta indicators
- Sparse time-series charts
- Alert feed panel
- Accuracy & quality meters
- Agent state panels

### Rules
- No decorative charts
- No gradient heatmaps
- No dense dashboards without hierarchy
- Alerts prioritized by severity

---

## 11. Component State Matrix

### 11.1 Global State Rules

- Only one of the following may change at a time:
  - background
  - border
  - text
  - icon
  - cursor

Motion:
- 120–180ms
- ease-in-out
- no bounce, no spring

---

### 11.2 Button — Primary

| State | Background | Text | Cursor |
|------|-----------|------|--------|
| Default | fg.primary | bg.primary | pointer |
| Hover | lighter fg.primary | bg.primary | pointer |
| Active | darker fg.primary | bg.primary | pointer |
| Focus | default + focus ring | bg.primary | pointer |
| Disabled | fg.disabled | bg.primary | not-allowed |
| Loading | fg.primary | hidden | wait |

---

### 11.3 Button — Secondary

| State | Background | Border | Text |
|------|-----------|--------|------|
| Default | bg.primary | border.default | fg.primary |
| Hover | bg.secondary | border.strong | fg.primary |
| Active | bg.tertiary | border.strong | fg.primary |
| Disabled | bg.secondary | border.subtle | fg.disabled |

---

### 11.4 Inputs

| State | Background | Border | Text |
|------|-----------|--------|------|
| Default | bg.primary | border.default | fg.primary |
| Hover | bg.primary | border.strong | fg.primary |
| Focus | bg.primary | accent.blue | fg.primary |
| Disabled | bg.secondary | border.subtle | fg.disabled |
| Error | bg.primary | status.error | fg.primary |

Errors persist until resolved.

---

### 11.5 Toggles

| State | Track | Thumb |
|------|------|-------|
| Off | border.default | bg.primary |
| On | accent.blue | bg.primary |
| Disabled | border.subtle | bg.secondary |

---

### 11.6 Sliders

| State | Track | Handle |
|------|------|--------|
| Default | border.default | fg.primary |
| Hover | border.strong | fg.primary |
| Active | accent.blue | accent.blue |
| Disabled | border.subtle | fg.disabled |

Numeric values are always visible.

---

### 11.7 Cards

| State | Elevation | Border |
|------|-----------|--------|
| Default | Level 1 | none |
| Hover | Level 2 | border.subtle |
| Active | Level 1 | border.strong |
| Disabled | Level 0 | border.subtle |

Hover never implies click unless clickable.

---

### 11.8 Agent States

| State | Treatment |
|------|----------|
| Idle | Neutral |
| Running | Progress + subtle accent |
| Waiting | Muted |
| Completed | Minimal success accent |
| Error | Error border + explanation |

Agents never feel “alive” — only operational.

---

### 11.9 Modals

| State | Close |
|------|------|
| Open | visible |
| Loading | disabled |
| Error | visible |

Escape always closes unless destructive.

---

### 11.10 Disabled (Global)

Disabled means:
- visible
- legible
- non-interactive

Never hide disabled controls.

---

## 12. Forbidden Patterns

- Anthropomorphism
- Decorative animation
- Color-only state changes
- Hidden system activity
- Multiple primary actions per screen

---

## 13. Engineering QA Checklist

- [ ] All states implemented
- [ ] Semantic tokens only
- [ ] Keyboard focus visible
- [ ] Disabled states tested
- [ ] Loading states explained

---

## 14. Closing Statement

Agentic UI is not trend-driven.

It is a **return to first principles** for a world where software reasons and humans remain accountable.

This system is intentionally calm, explicit, and durable.
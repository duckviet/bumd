# Bumd Frontend Design System
> analytics console on parchment

**Theme:** light

This file is the implementation contract for the Bumd frontend. The Ventriloc material below is the visual source reference; the product-surface contract at the end records what the repository actually ships, how its responsive and interaction boundaries work, and which gaps remain open. A component or state named as open debt is not complete merely because its current rendering is described here.

Ventriloc speaks in a quiet, professional whisper against an off-white canvas — a workspace where data feels approachable rather than intimidating. The interface is built on tight geometric type (PolySans) paired with Inter for UI, an almost-monochrome neutral palette, and a single warm orange (#ff682c) that punctuates charts, icons, and logo marks with restrained energy. Surfaces are flat and lightly tinted (white cards on warm-gray canvas), corners are soft (8px cards, pill-shaped controls), and elevation comes from gentle background shifts rather than shadows. Buttons are pill-shaped, nav is a floating rounded capsule, and dashboard mockups are presented as pristine white cards — the whole experience reads as analytical, airy, and deliberately unfussy.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Signal Orange | `#ff682c` | `--color-signal-orange` | Brand accent — chart fills, logo swoosh, active indicators, small highlights; the single chromatic spark across an otherwise monochrome system |
| Sienna Bronze | `#816729` | `--color-sienna-bronze` | Muted brand tone — icon strokes, decorative chart elements, secondary brand marks where a subtler warmth is needed than Signal Orange |
| Carbon | `#202020` | `--color-carbon` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. Do not promote it to the primary CTA color |
| Graphite | `#4d4d4d` | `--color-graphite` | Secondary text, body emphasis, subdued borders |
| Slate | `#828282` | `--color-slate` | Muted helper text, inactive nav, tertiary borders, placeholder copy |
| Fog | `#f5f5f5` | `--color-fog` | Alt surface tint, subtle bands within white cards, nav hover washes |
| Mist | `#efefef` | `--color-mist` | Page canvas — the dominant warm-gray background that frames the white cards |
| Chalk | `#e8e8e8` | `--color-chalk` | Soft surface inset, nav background, very subtle dividers |
| Paper | `#ffffff` | `--color-paper` | Card surfaces, dashboard panels, content blocks lifted off the canvas |

## Tokens — Typography

### PolySans — Display and heading face — a geometric, slightly condensed custom sans. The 66px hero at line-height 0.91 creates very tight vertical density that makes headlines feel architectural. Used for the logo wordmark, hero headline, and section headings. Letter-spacing locked at -0.02em across all sizes. · `--font-polysans`
- **Substitute:** Space Grotesk, General Sans, or DM Sans
- **Weights:** 400
- **Sizes:** 12px, 13px, 16px, 32px, 40px, 66px
- **Line height:** 0.91, 1.00, 1.13, 1.19, 1.20, 1.38
- **Letter spacing:** -0.02em
- **Role:** Display and heading face — a geometric, slightly condensed custom sans. The 66px hero at line-height 0.91 creates very tight vertical density that makes headlines feel architectural. Used for the logo wordmark, hero headline, and section headings. Letter-spacing locked at -0.02em across all sizes.

### Inter — Body and UI text — handles paragraph copy, buttons, nav links, labels, table cells, and all secondary text. Weights 400 for body, 500 for labels and emphasis, 600 for button text. Normal letter-spacing throughout. · `--font-inter`
- **Substitute:** Inter (Google Fonts)
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 13px, 14px, 15px, 16px, 18px
- **Line height:** 1.15, 1.20, 1.25, 1.33, 1.38, 1.43, 1.50
- **Role:** Body and UI text — handles paragraph copy, buttons, nav links, labels, table cells, and all secondary text. Weights 400 for body, 500 for labels and emphasis, 600 for button text. Normal letter-spacing throughout.

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| caption | 12px | 1.5 | — | `--text-caption` |
| body | 16px | 1.38 | — | `--text-body` |
| body-lg | 18px | 1.33 | — | `--text-body-lg` |
| subheading | 32px | 1.19 | -0.64px | `--text-subheading` |
| heading | 40px | 1.13 | -0.8px | `--text-heading` |
| display | 66px | 0.91 | -1.32px | `--text-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 36 | 36px | `--spacing-36` |
| 40 | 40px | `--spacing-40` |
| 60 | 60px | `--spacing-60` |
| 140 | 140px | `--spacing-140` |

### Border Radius

| Element | Value |
|---------|-------|
| tags | 20px |
| cards | 8px |
| inputs | 8px |
| buttons | 20px |
| navPill | 200px |

### Layout

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 32-40px
- **Element gap:** 20px

## Components

### Hero Headline
**Role:** Page-level display title

PolySans weight 400 at 66px with line-height 0.91 and letter-spacing -1.32px. Left-aligned, Carbon (#202020) on the Mist canvas. The extremely tight line-height (0.91) makes the three lines stack almost touching — a deliberate 'compressed monument' effect. No maximum width constraint beyond the content column.

### Filled Pill Button
**Role:** Primary action

Inter weight 500 or 600, 15-16px, white text on Carbon (#202020) background. 20px border-radius for full pill shape. Horizontal padding 18-20px, vertical padding 8-12px. No visible border. The pill silhouette (height ~40-44px) is a signature of this system.

### Outlined Pill Button
**Role:** Secondary action

Inter weight 500, 15-16px, Carbon text with a 1px Carbon border on transparent background. 20px border-radius matching the filled variant. Same padding rhythm. Used alongside filled buttons in hero and CTA clusters.

### Floating Nav Capsule
**Role:** Primary site navigation

A single pill-shaped container (border-radius 200px) centered at the top, holding nav items inline. Inter 14-15px weight 500, Carbon text. White or very light background with subtle border (#828282 at 1px). Items have 10-13px horizontal padding. Contains dropdowns (services, achievements, ventriloc) indicated by small chevrons.

### Language Toggle
**Role:** Locale switcher

Short text link (Inter 14-15px) showing current locale (e.g. 'FR'). Sits as a standalone item in the top bar, separated from nav and CTA. No border or background — just Carbon text.

### Dashboard Preview Card
**Role:** Product mockup / hero visual

White card (#ffffff) with 8px border-radius, sitting on the Mist canvas. Contains chart visualizations with Signal Orange (#ff682c) filled area charts, dark line strokes, and small typography labels. Cards are layered and slightly offset to create a floating composition. No heavy drop shadow — just the white-on-gray contrast for separation.

### Metric KPI Card
**Role:** Dashboard stat tile

White surface with subtle internal padding, title in Inter 14-15px weight 500 Graphite, large value in PolySans 32-40px Carbon, delta indicator in small Inter 12px (green for positive, Graphite for neutral). Optional small circular icon in Signal Orange or Sienna Bronze.

### Area Chart Card
**Role:** Data visualization panel

White card containing a line/area chart. Line stroke in Carbon at ~2px, area fill in Signal Orange at low opacity (~15-20%) for the gradient effect. X-axis labels in Inter 12px Slate, y-axis in same. Clean grid lines or no grid — minimal chart chrome.

### Logo Mark
**Role:** Brand identity

Wordmark 'ventriloc' in PolySans weight 400 at 24-28px, Carbon text. The distinguishing element is a Signal Orange swoosh/arc replacing or accenting the final letter or trailing the wordmark — this curved brushstroke is the brand's visual signature.

### Partner Logo Strip
**Role:** Social proof band

Horizontal row of grayscale partner logos (ABB, Olymel, Cascades, Angelcare, etc.) in Graphite/Slate tones, evenly spaced. No background treatment — logos sit directly on the Mist canvas. Acts as a trust signal beneath hero sections.

### Dashboard Sidebar
**Role:** In-product navigation panel

Vertical sidebar within a product card. White background, Inter 13-14px labels in Graphite. Filter groups (Date, Shop, Supplier, Product category, Brand, Class, Sex) with small dropdown chevrons. Active item highlighted with Signal Orange or Carbon weight 600.

### Funnel Visualization
**Role:** Conversion analytics widget

Horizontal funnel chart with trapezoidal stages (Visitor → Sign-ups → Active → Subscribed). Signal Orange for the widest/first stage, fading to lighter tints or outlined stages for later steps. Stage labels in Inter 12-13px beneath each segment.

### Donut/Progress Chart
**Role:** Profitability or distribution widget

Circular chart with a Signal Orange arc segment, legend items in Inter 12-13px with small colored dot indicators. Center label in PolySans 32px showing the key percentage (e.g. '34%'). White card background, 8px radius.

## Do's and Don'ts

### Do
- Use PolySans weight 400 for all display text and headings — the single-weight geometric voice is the brand's typographic signature
- Set line-height to 0.91-1.00 for PolySans display sizes (32px+) to achieve the compressed, architectural feel
- Apply -0.02em letter-spacing (converted to px per size: -0.64px at 32px, -0.8px at 40px, -1.32px at 66px) to all PolySans text
- Use 20px border-radius for all buttons, tags, and pill-shaped controls — the pill silhouette is system-defining
- Use Signal Orange (#ff682c) sparingly: chart fills, the logo swoosh, and small functional highlights only — never as a button background or large surface
- Build all cards on the Mist canvas (#efefef) with white (#ffffff) surfaces — the warm-gray-to-white contrast is the primary elevation mechanism
- Center the primary navigation in a single floating pill capsule (200px radius) at the top of the viewport

### Don't
- Don't use heavy drop shadows or deep elevation — keep shadows at 1-3% opacity, if used at all
- Don't add chromatic color to buttons, links, or text — actions stay Carbon-filled or Carbon-outlined, with Signal Orange reserved for data accents
- Don't use sharp corners (0-4px radius) on cards or buttons — all primary surfaces are 8px+ with pills at 20px
- Don't break the type pairing — never substitute Inter for PolySans on headings, or vice versa for body text
- Don't use line-height above 1.20 for PolySans display sizes — the tight 0.91-1.00 range is intentional
- Don't introduce new neutrals beyond the defined scale (Carbon, Graphite, Slate, Fog, Mist, Chalk, Paper) — the monochrome system is part of the identity
- Don't use photography, illustrations, or decorative imagery — the product dashboard mockups and partner logos are the entire visual vocabulary

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Canvas | `#efefef` | Page background — the warm gray that fills the viewport |
| 1 | Paper | `#ffffff` | Card surfaces and dashboard panels |
| 2 | Fog | `#f5f5f5` | Subtle inset bands within cards |
| 3 | Chalk | `#e8e8e8` | Nav backgrounds and soft dividers |

## Elevation

- **Dashboard Preview Cards:** `0 1px 3px rgba(32, 32, 32, 0.04), 0 4px 12px rgba(32, 32, 32, 0.03)`

## Imagery

The visual language is dominated by product dashboard mockups rather than photography. Charts and analytics panels are rendered as crisp white cards with Signal Orange data accents — the product interface IS the hero imagery. Partner logos appear as grayscale wordmarks. No lifestyle photography, no stock imagery, no decorative illustrations. Icons are minimal and monochromatic (Graphite/Carbon stroke), with Signal Orange reserved for data highlights and the logo swoosh. The overall density is text-and-data dominant with generous breathing room.

## Layout

Max-width 1200px centered content on a full-bleed Mist canvas. Hero follows a split layout: left column holds the PolySans headline, body paragraph, and button cluster; right column shows overlapping dashboard preview cards floating in white. Section rhythm uses generous vertical breathing (80px section gaps) with seamless flow rather than alternating bands. Content blocks within sections use a 2-column or 3-column card grid pattern. Navigation is a single floating pill capsule centered at the top of the viewport, unsticky. Dashboard product sections are full-bleed Mist background containing a single large white card with the actual product interface inside.

## Agent Prompt Guide

**Quick Color Reference**
- text: #202020 (Carbon)
- background: #efefef (Mist canvas), #ffffff (Paper cards)
- border: #828282 (Slate, 1px) for subtle dividers; #202020 for strong borders
- accent: #ff682c (Signal Orange) — chart fills, logo swoosh, highlights
- primary action: no distinct CTA color

**Example Component Prompts**
1. *Hero section*: Mist (#efefef) full-bleed background, max-width 1200px centered. Left column: headline in PolySans weight 400 at 66px, line-height 0.91, letter-spacing -1.32px, color #202020. Body paragraph in Inter 16px weight 400 line-height 1.5, color #4d4d4d. Below: a Carbon-filled pill button (20px radius, 18px horizontal padding, 8px vertical, Inter 15px weight 500 white text) next to a Carbon-outlined pill button (same dimensions, 1px border, transparent fill, #202020 text). Right column: two overlapping white dashboard cards (8px radius, 20px gap) containing area charts with Signal Orange (#ff682c) fills at 20% opacity and Carbon line strokes.

2. *Metric KPI tile*: White card (#ffffff), 8px radius, 32px padding. Title in Inter 14px weight 500 #828282. Value in PolySans 40px weight 400 #202020, letter-spacing -0.8px. Delta in Inter 12px #4d4d4d with a small Signal Orange up-arrow.

3. *Floating nav capsule*: Single pill container, border-radius 200px, background #ffffff, 1px border #828282, horizontal padding 10px. Nav items in Inter 14px weight 500 #202020 with 13px horizontal padding each. A Signal Orange filled pill button (20px radius) for the final 'Contact us' item.

4. *Partner logo strip*: Single row on Mist canvas, no background or border. Six grayscale logos evenly distributed with 40-60px gaps, all rendered in Graphite (#4d4d4d) or Slate (#828282). Above the strip, Inter 13px #4d4d4d label 'Trusted by 80+ partners'.

5. *Dashboard product card*: Full-width white card (#ffffff), 8px radius, sitting on Mist canvas with 40px padding. Left sidebar column (200px wide) with filter labels in Inter 13px #4d4d4d. Main content area shows a 4-column grid of metric tiles above a full-width area chart (Signal Orange fill) and a funnel visualization (Signal Orange trapezoids decreasing left to right).

## Similar Brands

- **Tableau** — Same dashboard-as-hero approach with white analytics cards floating on a neutral canvas
- **Mode Analytics** — Light-mode data product with a single warm accent color and geometric sans-serif headings
- **ThoughtSpot** — Monochrome chrome with orange data accents, pill-shaped controls, and tight geometric display type
- **Sisense** — White card surfaces on warm-gray canvas, minimal shadows, condensed-feeling display headings
- **Power BI** — Dashboard-heavy product preview aesthetic with chart cards in white panels and restrained color palette

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-signal-orange: #ff682c;
  --color-sienna-bronze: #816729;
  --color-carbon: #202020;
  --color-graphite: #4d4d4d;
  --color-slate: #828282;
  --color-fog: #f5f5f5;
  --color-mist: #efefef;
  --color-chalk: #e8e8e8;
  --color-paper: #ffffff;

  /* Typography — Font Families */
  --font-polysans: 'PolySans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-inter: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-caption: 12px;
  --leading-caption: 1.5;
  --text-body: 16px;
  --leading-body: 1.38;
  --text-body-lg: 18px;
  --leading-body-lg: 1.33;
  --text-subheading: 32px;
  --leading-subheading: 1.19;
  --tracking-subheading: -0.64px;
  --text-heading: 40px;
  --leading-heading: 1.13;
  --tracking-heading: -0.8px;
  --text-display: 66px;
  --leading-display: 0.91;
  --tracking-display: -1.32px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-60: 60px;
  --spacing-140: 140px;

  /* Layout */
  --page-max-width: 1200px;
  --section-gap: 80px;
  --card-padding: 32-40px;
  --element-gap: 20px;

  /* Border Radius */
  --radius-sm: 3px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 20px;
  --radius-full: 200px;

  /* Named Radii */
  --radius-tags: 20px;
  --radius-cards: 8px;
  --radius-inputs: 8px;
  --radius-buttons: 20px;
  --radius-navpill: 200px;

  /* Surfaces */
  --surface-canvas: #efefef;
  --surface-paper: #ffffff;
  --surface-fog: #f5f5f5;
  --surface-chalk: #e8e8e8;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-signal-orange: #ff682c;
  --color-sienna-bronze: #816729;
  --color-carbon: #202020;
  --color-graphite: #4d4d4d;
  --color-slate: #828282;
  --color-fog: #f5f5f5;
  --color-mist: #efefef;
  --color-chalk: #e8e8e8;
  --color-paper: #ffffff;

  /* Typography */
  --font-polysans: 'PolySans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-inter: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-caption: 12px;
  --leading-caption: 1.5;
  --text-body: 16px;
  --leading-body: 1.38;
  --text-body-lg: 18px;
  --leading-body-lg: 1.33;
  --text-subheading: 32px;
  --leading-subheading: 1.19;
  --tracking-subheading: -0.64px;
  --text-heading: 40px;
  --leading-heading: 1.13;
  --tracking-heading: -0.8px;
  --text-display: 66px;
  --leading-display: 0.91;
  --tracking-display: -1.32px;

  /* Spacing */
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-60: 60px;
  --spacing-140: 140px;

  /* Border Radius */
  --radius-sm: 3px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 20px;
  --radius-full: 200px;
}
```
## Dashboard Consolidation

The authenticated app uses a single command-center dashboard instead of forcing users through isolated pages. The `/app/[org]` and docs views must expose primary navigation, key health metrics, recent activity, and the next deploy/configuration actions in one scan.

- Layout: left rail on desktop, stacked navigation on mobile, dense content grid with no nested cards.
- Primary actions: create doc, open docs, view latest versions, and deploy guidance should be visible in the first viewport.
- Status language: queued, processing, ready, and failed versions must be readable as compact pills with distinct neutral/signal treatment.
- Empty states: show the first useful action, not explanatory marketing copy.
- Interaction: links and buttons use existing pill/button primitives with 180-220ms transform/opacity transitions only.

## Reusable Application Primitives

- `DashboardButton`: pill command button with `primary`, `secondary`, and `danger` tones; disabled state lowers opacity and removes pointer affordance.
- `DashboardModal`: centered responsive dialog surface with a carbon overlay, shared header, form field, error, and action-row anatomy.
- `StatusBadge`: domain-neutral compact label with `neutral`, `warning`, `success`, and `danger` tones. Domain slices map their own state unions to these tones.
- `VersionStatusBadge`: dashboard entity adapter for `queued`, `processing`, `ready`, `failed`, and no-deploy states.
- Dashboard shell surfaces use direct Tailwind utilities backed by this file's named tokens; semantic compatibility classes and `@apply` are not permitted.

# Product Surface Implementation Contract

## 1. Authority, Routes, And Ownership

The current frontend is a Next.js App Router application using Lite Feature-Sliced Design. Dependencies flow from `app` to `widgets` to `features` to `entities` to `shared`; lower layers never import higher layers. Route files own authentication, authorization, transport parsing, redirects, and screen composition. Widgets compose visible regions. Features own user interactions. Entities own normalized domain models. `shared/ui` and generic shared utilities remain domain-neutral. `shared/api` is the intentional boundary-client exception: it may expose domain-shaped, strictly typed DTO schemas and transport functions so external responses are parsed at the boundary, but it must not own domain policy, presentation, or feature workflow state.

Shipped route families:

- Public portal: `/:org/:doc`, `/:org/:doc/changes`, and `/:org/:doc/changes/:id`.
- Authentication: `/login`, `/signup`, `/logout`, `/accept-invite/:token`, and Auth.js callback routes.
- Dashboard: `/app`, `/app/:org`, `/app/:org/docs`, `/app/:org/docs/:doc`, members, API tokens, webhooks, version list/detail/diff, and the HTML-rendered doc settings route.
- Workflow builder: `/app/:org/docs/:doc/tests` and `/app/:org/docs/:doc/tests/:workflowId`.
- Frontend proxy routes: `/api/search`, `/api/try-it-out`, `/api/test-workflows/*`, and GitHub/Auth.js callbacks.

The public portal currently resolves only the default branch's latest ready version. Explicit branch/version portal routes and selectors are open debt (`PORTAL-004`), not shipped behavior. Custom-domain resolution remains open debt (`PORTAL-005`).

## 2. Shared And Domain Visual Primitives

### Shared dashboard primitives

- `DashboardButton`: 40px pill button; `primary`, `secondary`, and `danger` tones; disabled state removes pointer affordance and lowers opacity.
- `DashboardLinkButton`: small or medium pill link for route navigation and external actions.
- `DashboardNavLink`: horizontally scrollable dashboard-tab item with a carbon active state.
- `DashboardPageHeader`: paper surface containing kicker, PolySans title, description, and wrapping actions.
- `DashboardSection`: paper section with optional kicker, title, actions, divider, and content region.
- `InfoCard`: compact labelled metadata surface. It is not permission to nest cards recursively.
- `FormField`, `fieldClassName`, `ModalHeader`, `ModalActions`, and `ModalError`: shared form/dialog anatomy with visible labels and alert semantics.
- `DashboardModal`: labelled dialog with initial focus, keyboard focus loop, Escape/backdrop close when an `onClose` handler exists, and focus restoration. Viewport-safe maximum height and an explicit internal vertical scroll owner are target behavior, not currently established implementation.
- `StatusBadge`: domain-neutral label with neutral, warning, success, and danger tones.
- `VersionStatusBadge`: entity-owned mapping for queued, processing, ready, failed, and no-deploy states.

### Shared portal primitives

- `PortalShell`: public documentation page canvas.
- `PortalContainer`: centered portal width capped at 1440px with responsive gutters.
- `Surface`: paper panel with a chalk border and small radius.
- `Badge`: neutral, signal, success, danger, info, or warning label.
- `MethodBadge`: HTTP-method adapter over `Badge`; unknown methods stay neutral.

Reusable domain behavior must not move into `shared/ui`. Method, version, run, workflow phase, webhook, role, and delivery state mappings belong to their entity or feature slice.

## 3. Dashboard Structure And Responsive Contract

`dashboardShell` owns the authenticated page canvas, organization identity, current user/role, logout, and top-level tabs. It is a server-composed shell; interactive forms and dialogs remain client leaves.

| Width | Contract |
| --- | --- |
| 375px | Header groups wrap without covering identity or logout. Dashboard tabs are a single horizontal scroll owner. Page sections use one readable column; actions wrap; dialogs retain 16px viewport clearance. Primary content must not create horizontal page scroll. |
| 768px | Header identity and actions may share a row when content fits. Forms may use two-column field groupings, while lists remain readable without hiding controls. Target contract: dialogs are viewport-bounded and keep an explicit internal vertical scroll owner; this is not yet shipped for `DashboardModal`. |
| 1280px | Content is centered within `max-w-7xl`. Headers place copy and actions side by side. Lists, metadata grids, and management actions may use dense multi-column layouts without nested-card repetition. |

Dashboard states that every surface must expose deliberately are loading, empty, error, forbidden/role-limited, disabled mutation, success, and one-time-secret reveal. Real-browser evidence for all dashboard workflows and those states remains open debt (`DASH-QA-001`, `DASH-QA-002`).

`DashboardModal` viewport bounding is also open under `DASH-QA-001` and `ARCH-UI-F3`: exit requires a source implementation with a viewport-safe maximum block size and named internal scroll region, followed by keyboard/overflow evidence at 375px, 768px, and 1280px.

## 4. Documentation Portal Structure

`widgets/doc-renderer` is a composition widget, not the owner of request execution or OpenAPI parsing. It composes:

- `SearchBox` and operation-anchor selection;
- `OperationNav` grouped by tag;
- `OperationDetail` cards and Try-It-Out triggers;
- `SchemaRail` with referenced/all tabs;
- `Collapsible` operation groups;
- the feature-level `TryItOutModal`;
- the temporary `widgets/try-it-out-panel` wrapper around the feature-level panel.

`entities/openapi` owns normalized document, operation, parameter, request-body, server, schema, and Try-It-Out draft models. `features/try-it-out` owns draft editing, validation, proxy submission, and response presentation. `shared/api` owns generic request helpers and portal clients.

Portal responsive layout:

| Width | Contract |
| --- | --- |
| 375px | Header, search, operation content, navigation, and schema rail reflow to one column. Content is first in visual order; navigation and schemas follow. Operation paths, JSON, and schema text scroll within their local code/data region rather than widening the page. |
| 768px | The portal remains a readable stacked layout unless available width safely supports side regions. Search controls may wrap and retain a visible label. A measured 40px minimum target is the target contract, not verified current behavior. |
| 1280px | Three regions use approximately `300px / minmax(0,1fr) / 360px`. Navigation and schema/Try-It-Out rails are sticky and own their vertical overflow; the center document remains the page scroll owner. |

Final portal interaction evidence for operation selection, schema tabs/copy, search, changelog, theme, empty/error/private states, and overflow remains open debt (`PORTAL-006`). The duplicated canonical modal plus legacy panel is open debt (`ARCH-FSD-005`); do not treat both surfaces as a permanent design decision.

Search target sizing remains open under `SEARCH-002` and `SEARCH-003`: exit requires 40px-or-larger measured input/button targets at all three widths plus keyboard and browser evidence for loading, empty, error, retry, and result selection.

## 5. Try-It-Out Modal And Panel

The canonical intended workflow is `TryItOutModal`. Its current desktop anatomy is operation context, request builder, and response console. The request builder owns Params, Headers, and Body tabs; the response console owns Body and Headers tabs plus exact HTTP status presentation. All execution passes through `/api/try-it-out`; the browser never calls the target server directly.

| Width | Contract |
| --- | --- |
| 375px | Operation rail is hidden. Request and response regions stack within a viewport-bounded dialog. Each data/code region owns overflow; the document behind the dialog must not scroll. Controls stay reachable without horizontal overflow. |
| 768px | Stacked or two-region layout is acceptable only when request and response remain independently readable. The active operation remains visible in the dialog heading. |
| 1280px | Use the shipped `240px / minmax(0,1fr) / 440px` grid, capped at 1160px wide and 760px tall with 24px viewport clearance. Operation list, request editor, and response data each own their internal overflow. |

Required states are idle, editing, client validation error, sending, successful response, HTTP error response, transport failure, and empty headers/body. Required path/query/body validation is implemented. Required header/cookie and empty/invalid base-URL validation remain open debt (`TRY-REQ-002`).

The modal currently renders `role="dialog"`, `aria-modal`, Close, Escape, and initial field focus. A reliable accessible name is not established: the current `aria-labelledby` relationship does not provide the verifier-required matching label contract. A stable in-dialog heading ID, focus trapping/restoration, explicit background-scroll locking, accessible validation announcements, and operation-switch reset coverage all remain open debt (`TRY-UX-002`). Behavioral and real-browser coverage remains open debt (`TRY-QA-001`). Parser debt is tracked by `TRY-MODEL-002` through `TRY-MODEL-005`; the UI contract must not imply those OpenAPI cases are already supported.

## 6. Workflow Builder, Canvas, And Inspector

The geometry and composition described in this section were verified against the current dirty working-tree revision, including uncommitted user-owned workflow UI changes. They are a stale-state snapshot for documentation alignment, not evidence of the committed baseline or final shipped revision. Reverify them on the final tree under `WF-QA-005` and `WF-QA-006` before treating the contract as complete.

The workflow route composes route-owned toolbar/dialog state with these regions:

- `EndpointPalette`: endpoint search, HTTP-method filters, grouped draggable endpoints, and empty state.
- `TestWorkflowCanvas`: React Flow canvas, background, minimap, controls, endpoint nodes, connections, phase legend, validation feedback, selection, and run-status projection.
- `NodeInspector`: selected endpoint summary, stale warning, phase control, Request, Exports, and Assertions tabs, and node deletion.
- `WorkflowSettingsModal` and `EnvironmentsModal`: metadata, non-secret test data, environment descriptors, and secret-aware configuration.
- `RunConsole`: resizable execution trace below the canvas.

Workflow layout and scroll ownership:

| Width | Contract |
| --- | --- |
| 375px | The canvas is the primary workspace and retains a minimum usable height. Desktop endpoint palette is hidden. Selected-node inspector is an overlay no wider than 90vw and owns vertical scrolling. Toolbar actions wrap or scroll without covering the canvas. Touch-accessible endpoint insertion/remapping is not yet proven and is open QA debt. |
| 768px | Canvas remains primary. Palette/inspector may use overlays or staged panels; no panel may shrink the canvas below a usable interaction area. The run console must remain viewport-bounded. |
| 1280px | Use `260px / minmax(0,1fr)` with an optional 340px inspector at extra-large widths. Palette and inspector own vertical scrolling; React Flow owns canvas pan/zoom; the page shell must not capture canvas gestures. |

Canvas nodes expose method, path, label, phase, run status, selection, stale state, and connection handles. Connections reject cycles and phase-regressing edges with visible feedback. Stale nodes remain visible and block runs. Removal exists; real stale-operation remapping remains open debt (`WF-UI-007`). Viewport persistence remains open debt (`WF-UI-006`).

The current workflow editor has known strict-type/style and module-cohesion debt (`WF-UI-009`, `ARCH-UI-003`, `ARCH-UI-008`, `ARCH-UI-009`). The currently failing focused Node test import is open debt (`WF-UI-005`). These are release blockers, not accepted completion exceptions.

## 7. Run Console

`RunConsole` is a bottom execution region with a resizable height in the current dirty working-tree revision. It groups setup, test, and teardown steps, defaults selection to a failed/running/first step, and separates primary failure from teardown failures. Its detail tabs are Request, Response, Inputs, Exports, and Assertions. These claims reflect uncommitted user-owned changes and are not committed-baseline evidence; they require final-revision source and browser verification under `WF-QA-005` and `WF-QA-006`.

Scroll ownership rules:

- The workspace owns the console height; the drag handle changes only the console region.
- The step timeline and active tab panel own their vertical scrolling.
- Code, headers, bodies, and unbroken identifiers use local horizontal scrolling or wrapping; they never widen the application shell.
- At narrow widths the console must stack or provide an equally usable alternative to the current quarter/three-quarter split. This responsive behavior is not yet verified and remains under `WF-QA-005`/`WF-QA-006`.

The console must preserve duration/error, resolved request, redacted headers, response/truncation state, inputs, exports, and assertion expected/actual values. Upstream export provenance for `vars` inputs remains open debt (`WF-UI-008`, `WF-CONSOLE-001`).

## 8. Accessibility, Focus, And Motion

### Accessibility constraints

- Target WCAG 2.2 AA: 4.5:1 body-text contrast, 3:1 large-text/UI contrast, visible focus, semantic labels, and full keyboard reachability.
- Use real buttons for actions and anchors for navigation. Every icon-only action has an accessible name.
- Errors that block progress use `role="alert"` or an associated field description; color is never the only signal.
- Target dialog contract: use `role="dialog"`, `aria-modal="true"`, and an `aria-labelledby` value with a guaranteed matching heading ID; focus begins inside, stays inside while open, and returns to the trigger on close. `DashboardModal` satisfies the focus portion, while `TryItOutModal` remains open under `TRY-UX-002`.
- Secret inputs and outputs never reveal stored values after the allowed one-time display. Run-console secret inputs render redacted descriptors only.
- Empty, long-label, unbroken-string, failed, stale, and permission-limited content must remain understandable at 375px.

`DashboardModal` meets the focus-loop/restoration contract. `TryItOutModal` does not yet meet the complete focus contract; that difference is explicitly tracked by `TRY-UX-002`.

### Motion

- Motion communicates interaction or state only. Do not animate decorative non-interactive elements.
- Use 180–220ms for hover/focus/state transitions and transform/opacity/background/border changes.
- Programmatic operation navigation currently uses smooth scrolling without a verified `prefers-reduced-motion` fallback. Instant movement under reduced motion is the target contract and remains open under `ARCH-UI-F2` and `ARCH-UI-F3`; exit requires source handling plus browser evidence with reduced motion enabled.
- Canvas pan/zoom and console resizing are direct manipulation, not decorative animation.
- Avoid layout-property animation. The current mouse-driven console height and any remaining broad `transition-all` usage are implementation debt until audited under `ARCH-UI-F1`/`ARCH-UI-F2`.

## 9. Accepted And Open Design Debt

No incomplete item below is accepted as final product completion. “Accepted current behavior” means the repository may preserve it while the linked checklist item remains open; it does not waive the item.

| Debt | Current status and exit condition |
| --- | --- |
| `PORTAL-004..006` | Default/latest portal and limited screenshots are accepted current behavior. Exit with branch/version selection, custom-domain decision where applicable, and final interaction/browser evidence. |
| `ARCH-FSD-005..008` | Feature/entity ownership is mostly shipped, but duplicate Try-It-Out surfaces, `as any`, public-API enforcement, helper coverage, and Lite-FSD evidence remain open. |
| `TRY-MODEL-002..005`, `TRY-REQ-002`, `TRY-UX-002`, `TRY-QA-001` | OpenAPI edge cases, request validation, complete modal focus/scroll behavior, and browser/component coverage remain open. |
| `SEARCH-002/003` | Search lacks measured 40px targets, explicit loading, empty-result, error/retry, keyboard navigation, and final browser proof. Exit requires the source and three-width browser evidence named above. |
| `DASH-QA-001/002` | Existing dashboard behavior is retained, but browser-QA completion claims require linked final-state evidence. `DashboardModal` also needs a viewport-safe maximum height and explicit internal scroll owner before responsive completion. |
| `WF-UI-005..009`, `WF-CONSOLE-001`, `WF-QA-003..006` | Workflow tests, viewport persistence, remapping, provenance, strict style/type cleanup, complete console contract, responsive behavior, and live QA remain open. |
| `ARCH-UI-001..009`, `ARCH-UI-F1..F4` | Tailwind/FSD migration is partial. Oversized management and workflow modules, raw/semantic style debt, strict typing, reduced-motion handling, complete route/state QA, and final reviews remain open. |

New debt must be added here with a stable checklist ID, exact surface, reason, and exit condition. Silent debt is not permitted.

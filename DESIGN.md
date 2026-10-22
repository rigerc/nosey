---
name: Nosey
description: Native terminal design for workspace detection and agent skill suggestions.
colors:
  nosey-primary: '#FFB000'
  nosey-accent: '#FFB000'
  nosey-success: '#A3D977'
  nosey-warn: '#FFD37A'
  nosey-info: '#A08A60'
  nosey-muted: '#A08A60'
  nosey-text: '#F5E6C8'
  nosey-subtle: '#A08A60'
  nosey-border: '#6B5A38'
  nosey-focus: '#FFB000'
  nosey-on-tone: '#14100A'
  light-primary: '#8A5A00'
  light-accent: '#8A5A00'
  light-success: '#2f7d32'
  light-warn: '#a15c00'
  light-danger: '#c62828'
  light-info: '#00698f'
  light-muted: '#6B5A38'
  light-text: '#14100A'
  light-subtle: '#6B5A38'
  light-border: '#A08A60'
  light-focus: '#8A5A00'
  light-on-tone: '#F5E6C8'
components:
  panel-title:
    textColor: '{colors.nosey-muted}'
  panel-title-focused:
    textColor: '{colors.nosey-primary}'
  grouped-skill-heading:
    textColor: '{colors.nosey-muted}'
  skill-row:
    textColor: '{colors.nosey-text}'
  skill-row-focused:
    textColor: '{colors.nosey-primary}'
  text-field-active:
    textColor: '{colors.nosey-text}'
  text-field-cursor:
    textColor: '{colors.nosey-primary}'
  badge-solid-primary:
    backgroundColor: '{colors.nosey-primary}'
    textColor: '{colors.nosey-on-tone}'
---

# Design System: Nosey

## Overview

Nosey's existing `:^)` identity anchors a compact, keyboard-driven terminal interface. Amber identifies focus and the brand's nose; parchment carries readable content; subdued warm metadata keeps evidence and actions easy to scan. This document describes the implemented Ink interface and the confirmed direction, without introducing a replacement identity.

The application renders inline and preserves terminal scrollback. Its hierarchy comes from bold text, restrained borders, blank rows and explicit labels. Scan, Registries, Settings and Help share one shell. Scan presents read-only suggestions; selection and review never imply installation.

**Key Characteristics:**

- Existing Nosey brand assets and the ASCII `:^)` mark.
- One warm brand accent, semantic status colors and terminal-controlled typography.
- Technology-grouped suggestions with synchronized shared-skill selection.
- Separate contextual controls and global navigation hints.
- A compact project summary above results at every terminal width.

Authority: runtime tokens in [palettes.json](src/theme/palettes.json), [tokens.ts](src/theme/tokens.ts) and [themes.ts](src/theme/themes.ts); assets in [the brand kit](assets/nosey-brand-kit/README.md); composition in [AppShell](src/components/AppShell.tsx), [Panel](src/components/Panel.tsx) and [Home](src/screens/Home.tsx). Implementation is authoritative for the finished interface.

## Colors

The default Nosey palette uses amber, parchment and warm muted browns. Frontmatter names preserve runtime semantic roles, with theme prefixes for unambiguous light variants. Feature code must resolve the active theme through `useTheme()` or `useTone()`.

### Primary

- **Nose amber** (`nosey-primary`, `nosey-accent`, `nosey-focus`): the caret in the brand mark, active tabs, focused options, active section titles and the input cursor. These roles intentionally share one brand color.
- **Burnt amber** (`light-primary`, `light-accent`, `light-focus`): the corresponding emphasis on light terminals. Do not use dark-theme amber as text on parchment.

### Neutral

- **Parchment** (`nosey-text`, `light-on-tone`): primary dark-theme text and text on solid light-theme badges.
- **Ground** (`nosey-on-tone`, `light-text`): text on solid Nosey badges and primary light-theme text. The terminal itself controls the canvas; this token does not establish a panel background fill.
- **Dim** (`nosey-info`, `nosey-muted`, `nosey-subtle`, `light-border`): low-priority metadata, group labels and light-theme borders.
- **Umber** (`nosey-border`, `light-muted`, `light-subtle`): subdued dark-theme borders and light-theme secondary text.

Semantic statuses are separate from brand accents: Moss success, warm warning, and the active theme's danger/info roles accompany words or symbols. Nosey's danger is ANSI `redBright`, not a fixed RGB value; it is intentionally absent from CSS-compatible frontmatter. The light theme has its own success, warning, danger and info values in frontmatter.

`dark` and `contrast` remain supported alternatives defined by the runtime palette; this document's frontmatter captures the Nosey and light brand variants. Contrast uses terminal ANSI color names. Mono sets every color role to `undefined`; `NO_COLOR` forces mono. No RGB equivalents or synthetic tonal ramps are prescribed for ANSI colors.

**The Semantic Color Rule.** Use theme roles for state and focus; pair every status with readable text or a symbol so meaning survives mono rendering.

## Typography

All runtime text inherits the user's terminal monospace font and cell metrics. The brand kit prefers JetBrains Mono for exported assets, but the application neither installs nor selects a font. There is no application font-size, line-height, letter-spacing or CSS weight scale to extract.

- Header brand, screen titles, panel titles and labels use Ink `bold`.
- Body values and unfocused options use regular terminal text.
- Metadata, group labels, descriptions and supplementary evidence use semantic muted text; group labels also use bold.
- Focused list options use bold plus primary color and a pointer. Selection uses literal `[x]` / `[ ]`, independent of focus.
- `Kbd` renders bold bracketed keys such as `[enter]`, followed by muted descriptions.

Use existing typography components rather than simulating larger display type or importing a web font. Long menu labels truncate at the end; screen descriptions and evidence can wrap within their allotted width.

## Layout

All measurements are terminal columns and rows, not pixels. The shell orders header, wrapping tabs, screen body, toast host and status footer. Header and tabs are adjacent; body and footer retain a blank row of separation. Header, tabs, screen content and footer use one column of horizontal padding. Tabs have a one-column gap. Screen descriptions and paths truncate in the middle to preserve the beginning and end without adding rows.

Scan uses one column at every width: a three-row summary of scan status, counts, and detected technologies, followed by an open skill picker. Warnings remain explicit below the summary and may extend into scrollback. The picker uses a plain compact section and grouped menus: headings sit directly above their options, later groups retain a blank row above the heading, and list metadata has no extra vertical padding. Below 60 columns, options lead with the skill name so common repository prefixes do not hide the distinction between skills. Full IDs remain searchable in hints and visible in details. The unique selected total appears once above the list; the entry range appears below. The no-install statement remains visible inside the picker.

The option budget is `max(3, min(16, rows - 16))`. The physical menu budget is `max(4, rows - (columns < 60 ? 20 : 19) - activeFilterRows)`. These limits keep the focused item visible while accounting for group headings. Primary initial screens fit 24-row terminals at 40, 60, 80, 96 and 120 columns. Longer warnings, review commands, and detail content may use scrollback rather than clipping important information.

Compact Scan follows the same density and selection treatment without panels, tabs, or a command menu. A two-row brand/project header keeps long paths bounded. Narrow rows lead with the skill name, while review and output retain canonical IDs. Its list reserves space for the summary, one selected total, the no-install statement, and essential footer controls in 24-row terminals.

Settings shows section navigation followed by only the active section's values or editor. Paths and pending-change state stay above those controls. Registries separates project/scope/write-target metadata from its focused list or editor. Help is a topic browser: an unbordered 22-column sidebar beside an open content section at 80 columns and above, and wrapping topic labels above the content below 80 columns. Up/down or j/k changes the topic; visited screens retain their state.

The status footer keeps contextual actions separate from app navigation, with adjacent hint rows. Below 60 columns it shows at most three contextual hints and hides the extra global row when context exists. From 60 through 89 it shows at most five context hints; from 90 it shows at most nine. Editors and confirmations supply their own hints. Horizontal hint spacing is two columns, with one column between key and label.

**The Density Rule.** Spend terminal rows on task content. Keep meaningful separation between groups while removing blank rows between a heading and its options.

## Elevation & Depth

The interface is flat. Focus is conveyed by primary color, bold text and a pointer; muted borders distinguish dialogs and reviews from open browsing sections. There are no CSS shadows, floating surface layers or prescribed full-panel fills. A screenshot's dark canvas belongs to the terminal/capture environment and must not be promoted into a new component background token.

## Shapes

Shapes are terminal border glyphs, not pixel radii. Outlined panels use the base border: `round` in color themes, `single` in mono and `classic` in ASCII. Focus border tokens remain available in the theme, while standard panels use a quiet base outline. ASCII mode also substitutes the ASCII symbol set. Cards use only a left border with one column of left padding. Dividers are horizontal rules; tabs and outline badges use literal brackets.

Preserve the `:^)` silhouette through `BrandMark`: colon and closing parenthesis use text color, and the caret uses primary. It already survives ASCII and mono without an alternate logo.

## Components

### Shared shell and navigation

`AppShell` provides one application header, navigation, body, toast host and footer. Screens compose `ScreenLayout`; they do not create another shell. Tabs wrap, use a one-column gap, and show the active tab in bold primary text inside brackets. The four primary labels remain Scan, Registries, Settings and Help.

### Panels and cards

`Panel` has an optional bold title and a `plain` or `outline` variant. Outlines use a muted base border and one-column side padding; plain sections align directly with their parent. Titles default to muted, or primary when focused; explicit title tones take precedence. Scan browsing, registry browsing, Settings and Help use open sections. Reviews, dialogs and editing flows retain quiet outlines. Compact panels place their title directly above content. `Card` remains the left-rule alternative.

### Grouped skill selection

`MultiSelect` shows a focus pointer, checkbox and skill ID. Selected markers and unfocused selected labels use the success tone; focused labels use primary and bold text. Hints remain muted in either state. The checkbox carries selection in mono. Inactive controls omit pointers and active emphasis. Group headings carry their selected/available count and remain visually distinct from options. Shared IDs have synchronized checkboxes across technology, combination and frontend groups, and appear once in confirmed output. Filtering preserves hidden selections. Enter opens Review; the confirmation defaults to No. The list footer distinguishes selected IDs from visible entries.

### Text fields and search

`TextField` is an inline `Label: value_` terminal field. Labels and entered text use the text role; placeholders use muted text. The active cursor uses primary and inverse styling. Long values truncate at the beginning so the editing end and cursor stay visible; inactive fields omit the cursor. Active text editing captures keys; Enter accepts, Escape cancels and Ctrl+U clears. Deactivate the underlying list while a text field or search control owns input.

### Badges and statuses

`Badge` supports subtle (symbol plus label), outline (bracketed label with one space inside each bracket) and solid (tone fill with `onTone` text and one space on each side). Mono solid badges use inverse bold text. Read-only and partial labels remain explicit words; loading uses a themed spinner rather than an invented percentage. Empty states align left with surrounding content. Status messages, alert titles and bodies, and spinner labels wrap so complete diagnostics remain accessible. Progress bars shrink within their parent and reserve space for a visible percentage; their value contract remains 0–1.

### Contextual footer

`StatusBar` places contextual actions above separate global navigation when width permits. The divider is subdued; keys are bold and descriptions muted. Hints reflect the active control, including filter, confirmation and wizard modes, so their visual prominence matches actual keyboard ownership.

## Do's and Don'ts

### Do:

- **Do** reuse the existing `:^)` mark and Nosey brand assets.
- **Do** resolve colors, borders and glyphs from the active semantic theme.
- **Do** preserve separation between groups and synchronized selection for shared skill IDs.
- **Do** compose screens inside `ScreenLayout` and preserve the shared contextual footer.
- **Do** review 24-row output at 40 and 120 columns alongside light, mono and ASCII variants.
- **Do** state that suggestions and selection do not install skills.

### Don't:

- **Don't** replace the mark or introduce another decorative brand accent.
- **Don't** force a terminal font, pixel type scale, CSS radius, shadow or panel fill.
- **Don't** use color alone to distinguish focus, selection, warnings or errors.
- **Don't** merge contextual editing hints with unrelated global shortcuts.
- **Don't** count repeated grouped entries as separate selected skills.
- **Don't** hide essential state behind a wide-only layout or print application logs while Ink owns stdout.

# Design System Specification: The Nordic Narrative

## 1. Overview & Creative North Star: "The Curated Silence"
This design system is built upon the concept of **"The Curated Silence."** It rejects the cluttered, noisy interfaces of typical AI platforms in favor of a high-end editorial experience. Inspired by modern Scandinavian architecture and print journalism, the system prioritizes negative space as a functional element, not just a stylistic choice. 

By utilizing intentional asymmetry and a "typography-first" hierarchy, we move away from "boxed" software and toward a digital canvas. The goal is to make the user feel like they are interacting with a premium physical object—think matte paper, frosted glass, and light ash wood.

## 2. Colors & Surface Philosophy
The palette is a sophisticated blend of cool slates (`primary`), ethereal off-whites (`surface`), and warm, organic undertones (`tertiary`).

### The "No-Line" Rule
**Explicit Instruction:** Solid 1px borders are strictly prohibited for sectioning. Structural boundaries must be achieved through background shifts. For example, a main content area (`surface`) should transition into a footer or header using `surface-container-low` or `surface-container-high`. We define space through mass and tone, not lines.

### Surface Hierarchy & Layering
Treat the UI as a physical stack of materials.
*   **Base Layer:** `surface` (#f9f9f7) – The foundation.
*   **Secondary Layer:** `surface-container-low` (#f3f4f2) – Used for subtle grouping of content.
*   **Elevated Layer:** `surface-container-lowest` (#ffffff) – Used for high-priority cards or active work areas to create a "lifted" paper effect.

### The "Glass & Wood" Signature
To achieve the "Modern Nordic" feel, use **Glassmorphism** for the top navigation bar. 
*   **Top Nav:** Use `surface` at 80% opacity with a `20px` backdrop-blur. 
*   **Accents:** Use the `tertiary` (#695e4c) and `tertiary-fixed-dim` (#f0e0cb) tokens to mimic "light wood" for progress bars, small decorative elements, or secondary CTAs.

## 3. Typography: Editorial Authority
We utilize **Manrope** for its geometric yet approachable structure and **Inter** for functional precision.

*   **Display (Manrope):** Large, airy, and bold. Use `display-lg` (3.5rem) with negative letter-spacing (-0.02em) for hero moments.
*   **Headlines (Manrope):** `headline-md` (1.75rem) should have generous line-height (1.4) to ensure a "book-like" feel.
*   **Body (Manrope):** `body-lg` (1rem) is the workhorse. It must always have a max-width of 65ch (characters) to maintain readability.
*   **Labels (Inter):** `label-md` (0.75rem) is used for metadata and micro-copy, providing a technical contrast to the editorial headings.

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are too "digital." We use **Ambient Depth.**

*   **Layering Principle:** Instead of a shadow, place a `surface-container-lowest` (#ffffff) card on a `surface-container` (#eceeec) background. The 1.5% contrast shift creates a "soft lift."
*   **The Ambient Shadow:** If a floating element (like a modal) is required, use a shadow with a 40px blur, 0px offset, and 4% opacity using the `on-surface` color. It should feel like a cloud, not a shadow.
*   **The Ghost Border:** For accessibility in input fields, use `outline-variant` (#afb3b0) at **15% opacity**. It should be barely perceptible, serving only as a subtle guide.

## 5. Components

### Buttons (The Tactile Interaction)
*   **Primary:** `primary` (#4d626c) background with `on-primary` text. Radius: `xl` (1.5rem). No shadow.
*   **Secondary (The Wood Accent):** `tertiary-container` (#ffeed8) background with `on-tertiary-container` text. This provides the "light wood" warmth.
*   **Tertiary:** Ghost style. No background, `primary` text. Use `surface-container-highest` on hover with a smooth 300ms ease-in-out transition.

### Input Fields
*   **Style:** No background (transparent) with a `surface-variant` bottom-border ONLY (2px). When focused, the border transitions to `primary` via a width-expand animation from the center.
*   **Typography:** Labels must use `label-md` in `on-surface-variant`.

### Cards & Lists
*   **Forbid Dividers:** Do not use lines to separate list items. Use 16px of vertical whitespace or a subtle toggle between `surface` and `surface-container-low` backgrounds.
*   **Rounding:** All cards must use `lg` (1rem) or `xl` (1.5rem) corner radius to maintain the "soft" Nordic aesthetic.

### AI Narrative Stream (Custom Component)
*   As AI generates text, use a soft gradient mask at the bottom of the container (transitioning from `surface` alpha 0 to `surface` alpha 100) to create a "fading in from the mist" effect.

## 6. Do’s and Don'ts

### Do:
*   **Embrace Asymmetry:** Align the logo to the far left and the navigation links to the far right, leaving a massive "void" in the center of the top bar to emphasize scale.
*   **Use Subtle Motion:** Elements should "drift" into place (Y-axis offset + Fade) rather than popping. Use a `cubic-bezier(0.2, 0.8, 0.2, 1)` timing function.
*   **Treat Text as Art:** Use `tertiary` for pull-quotes to break the monochromatic slate and grey.

### Don’t:
*   **Don't use pure black:** Use `on-surface` (#2f3332) for text. Pure black is too harsh for the Nordic palette.
*   **Don't use sidebars:** All navigation must be horizontal and top-aligned to preserve the "open horizon" feel of the interface.
*   **Don't use heavy shadows:** If a component looks like it's "floating" too high, reduce the opacity of the shadow, don't increase the darkness.
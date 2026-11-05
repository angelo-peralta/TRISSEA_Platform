> **v1.5 Tuguegarao pilot priority:** Start with `docs/00-PILOT-STATUS.md` and `docs/48-ADR-010-TUGUEGARAO-PILOT.md`. Historical scope below is preserved; any conflicting release sequence or fare assumptions are superseded by v1.5, especially Reservation being deferred and uploaded fares remaining unverified.

# TRISSEA Design Bible — Human-Centered Transport UI

## Design intent
Calm, precise, functional, reassuring. Distinct from Grab branding, screens and trade dress. Avoid generic AI-dashboard styling. Design for passengers using small phones outdoors and drivers who need large, glanceable actions.

## Design principles
1. **Action clarity:** one main CTA per task screen; current stage legible in one glance.
2. **Map as context:** map never obscures booking status or recovery controls; text route fallback.
3. **Safety before decoration:** verify vehicle/plate; visible contact/support; audit-friendly state labels.
4. **Trust through truth:** show freshness and estimate labels; no fake countdowns, fabricated ETA or guaranteed pickup claims.
5. **Low-data resilience:** skeletons, cached safe local text, compressed maps and minimal assets.
6. **A11y:** accessible contrast, screen reader semantics, logical focus, 44px minimum tap targets, 200% text resize support where possible.
7. **One visual identity:** consistent shapes, iconography, terminology, spacing and state colors across platforms.

## Provisional tokens (change by brand ADR)
- Midnight blue `#102A43` — navigation, text.
- Teal `#087F72` — confirmed/primary interaction.
- Warm amber `#D99B32` — caution/terminal accent, not exclusive status encoding.
- Pale surface `#F7F9FA`, white `#FFFFFF`.
- Danger `#C0392B`, muted slate `#51606F`.
- Font: system UI / Inter-equivalent where licensed and available; use platform-native fallback.
- Spacing units: 4/8/12/16/24/32; radii 8/12/16; consistent shadows only where elevation is meaningful.

## Visual hierarchy
Passenger: full-width pickup/destination, price/ETA and single sticky CTA, map occupies remaining area. Driver: one job offer card with pickup route details, massive Accept, secondary Decline, timer from server. Dispatcher: split live map/table with robust filters and stale markers; no endless decorative cards.

## Component inventory
`PrimaryButton`, `SecondaryButton`, `DangerConfirm`, `LocationPicker`, `ServiceSelector`, `FareBreakdown`, `RideStatusStepper`, `DriverIdentityCard`, `ConnectionBanner`, `PermissionExplainer`, `LocationFreshness`, `TerminalQueueCard`, `SafetyAction`, `ReceiptSheet`, `EmptyState`, `ErrorRetry`.

## Screen states
Each component/screen must specify loading, empty, normal, pending, success, error, offline, expired, restricted and accessibility behavior where relevant.

## Content style
Short direct copy: "Searching for a driver", "Driver has arrived", "Location update delayed", "Your fare changed—review before continuing". Avoid pressure tactics and ambiguous labels like "Proceed" without stating what happens.

## Design artifacts expected per feature
User journey, low-fi layout, visual states, accessibility annotation, mobile breakpoints, motion/performance budget, sample test cases and i18n string keys.

## Reservation interface rules
Show **Reservation — TODA terminal pickup window**. On confirmation show terminal, pickup landmark, booked window (PHT), party size, reference, grace, cancellation terms and status; clearly state **driver not yet assigned**. At check-in show verification/quote consent, then live `Searching for terminal driver` state. Never display a fake fixed ETA, assured driver, reserved driver queue position or a hidden fee. Distinguish terminal navigation from driver tracking. QR/dispatcher accessibility fallback required.

## Mobile implementation companion (v1.4)
The binding Expo-specific mobile rules now live in `design/MOBILE-DESIGN-RULES.md`; reusable UI responsibilities in `design/MOBILE-COMPONENT-CONTRACTS.md`; feature screen acceptance in `design/MOBILE-SCREEN-ACCEPTANCE.md`; and PR review in `design/MOBILE-REVIEW-CHECKLIST.md`. Do not introduce visually incompatible screens because a third-party agent skill recommends a different aesthetic. Current external design skills are indexed in `design/MOBILE-AGENT-REPOS.md`.

# TRISSEA Mobile UI Component Contracts

Use reusable primitives in `packages/mobile-ui` (implementation folder is **proposed**, not yet scaffolded). Keep Expo Router route files thin and separate view components from API/dispatch business rules. Treat this document as an implementation contract rather than component code.

| Component | Required props / behavior | Accessibility, safety and state |
|---|---|---|
| `AppScreen` | title, safeAreaEdges, surface, scrollMode | Correct safe area, keyboard avoidance, focus heading |
| `AppButton` | variant, size, loading, disabled, onPress, accessibilityLabel | 44pt/48dp targets; no two submits; destructive confirmation |
| `AppText` | role, colorRole, maxFontScale | Semantic font scale; no clipped fare/time/plate |
| `StatusPill` | status enum, label, icon | Text label; colors not only cue; server state |
| `LocationField` | place, accuracy, onEdit, onSearch | Keyboard navigation and landmark search; permissions |
| `MapTripCanvas` | route, markers, accuracy, isStale | Native MapLibre; textual companion; attribution |
| `ServiceOptionTile` | option, availability, summary, selected | Explicit Regular/Shared/Special/Reservation differences |
| `FareQuotePanel` | amount, currency, expiresAt, conditions, quoteId | Derived only from server quote; reconsent on change |
| `DriverIdentityCard` | display name, verified vehicle, plate, contact/safety | Visible full verification details; privacy and moderation |
| `DriverOfferCard` | offer, expiresAt, accept/decline | Server clock sync; no optimistic acceptance |
| `QueuePositionCard` | serverRank, terminal, updatedAt, eligibility | FIFO visible, stale status and backend reconciliation |
| `ConnectivityBanner` | online, latencyState, lastSync | Non-blocking reconnect and specific retry messaging |
| `PermissionExplainer` | permission, use, whyNow, openSettings | No deceptive consent; location rationale and next action |
| `TerminalSlotPicker` | terminal, windows, availability, policyVersion | PHT dates, stale inventory refresh, hold expiry |
| `TerminalCheckIn` | reservation, credential, assistedFallback | Server verification; QR never sole accessible method |
| `SafetyActions` | support/call/report, ride state | Available during relevant trips; not hidden by sheet |
| `EmptyErrorState` | code, messageKey, primaryAction | Actionable recovery; no generic failure-only UI |

## Rules

1. Token-only styling from `design/tokens.json` via theme adapter. Dark/light roles should be explicitly mapped and visually tested.
2. No trip state, fare, queue position, reservation capacity, driver verification or ETA logic inside view components. Props must be from validated API models/selectors.
3. React Native components are not DOM elements. Use `Pressable`, `Text`, `View`, `ScrollView`, accessible list controls and native-safe navigation.
4. Prefer a simple in-house visual layer over importing unrelated UI kits. Third-party primitives are allowed only after Expo SDK compatibility, security and maintenance review.
5. Shared `packages/mobile-ui` must not import a passenger-only/driver-only feature package or instantiate a network client.
6. Use specialized domain cards only when two or more screens actually reuse them; avoid abstraction for its own sake.
7. Every component must document accessibility props, loading/error behavior, theme behavior and render-performance concerns.

## Examples of component boundaries

- `FareQuotePanel` **renders** a server quote. It must not calculate distance-based fare locally.
- `QueuePositionCard` **renders** server rank and staleness. It must not infer rank from visible nearby tricycles.
- `ServiceOptionTile` **renders** service selection. It must not silently migrate a booking from Reservation to Regular.
- `TerminalSlotPicker` displays inventory but cannot guarantee it. A hold/confirm endpoint establishes capacity.

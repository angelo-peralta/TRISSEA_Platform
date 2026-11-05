# TRISSEA Mobile UI Design Review — Required Checklist

Use for passenger and driver pull requests. Mark each criterion PASS / FAIL / N/A, attach evidence and file an issue for failures. This checklist is a gate, not a replacement for device testing.

## Product truth
- [ ] The screen states the correct service: Regular, Shared, Special or passenger TODA Reservation.
- [ ] Reservation never implies queue-jumping, a held driver, or guaranteed pickup.
- [ ] Queue, fare, driver verification, availability and trip state are server-authoritative.
- [ ] Date/time explicitly uses PHT where user-visible; peso amounts are formatted correctly.
- [ ] ETA is labeled as an estimate with stale/location error states.

## Native usability
- [ ] Android 48dp / iOS 44pt minimum actionable targets and safe margins.
- [ ] No navigation/gesture area overlap, clipping, obscured controls or unscrollable keyboards.
- [ ] Accessible screen reader role/name, focus order, dynamic text and reduced-motion behavior.
- [ ] WCAG AA contrast confirmed with actual foreground/background values.
- [ ] No essential information conveyed by color, animation, map or QR alone.
- [ ] Bottom sheet/back navigation does not discard an active booking without warning.

## Reliability and safety
- [ ] Loading, pending, error, offline, empty, expired and retry outcomes defined.
- [ ] Pending submit cannot issue a duplicate ride/reservation (idempotency).
- [ ] Reconnected views refresh canonical server status before allowing stateful actions.
- [ ] Background location wording is accurate; permission denied can be recovered from.
- [ ] Safety, support and plate/vehicle verification are accessible when applicable.
- [ ] No sensitive GPS, phone, QR token, identity, or payment data is embedded in screenshot fixtures or analytics.

## UI consistency and performance
- [ ] Uses shared theme tokens and UI components, not arbitrary per-screen colors/sizes.
- [ ] Layout passes representative inexpensive Android-device testing and outdoor readability review.
- [ ] Lists/maps avoid avoidable rerender loops and expensive screen animations.
- [ ] Brand language remains original; no copied competitor UI/trade dress.
- [ ] Android and iOS differences are assessed; neither platform is an accidental web port.

## Reviewer signoff template

```
Screen/PR:
Reviewer:
Android build/device:
iOS build/device (if supported):
Contrast evidence:
Large text/screen reader evidence:
Offline/error evidence:
Status: PASS / FAIL / CONDITIONAL
Blocking issues:
```

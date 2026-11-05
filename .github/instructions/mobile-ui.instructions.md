---
applyTo: "apps/passenger/**,apps/driver/**,packages/mobile-ui/**"
---
# TRISSEA Mobile UI instructions
Read `AGENTS.md`, `design/DESIGN-BIBLE.md` and `design/MOBILE-DESIGN-RULES.md`. Respect `design/tokens.json`, `design/MOBILE-COMPONENT-CONTRACTS.md` and `design/MOBILE-SCREEN-ACCEPTANCE.md`. Use `.agents/skills/trissea-mobile-design/SKILL.md` for design/implementation/audit tasks; external skills are optional and subordinate to TRISSEA rules. Preserve Regular/Shared/Special/passenger-only TODA Reservation semantics. All server-authoritative booking, queue, driver, fare and GPS status must remain truthful under offline/reconnect scenarios. Test screen readers, 44pt/48dp targets, native safe areas and large-font layout.

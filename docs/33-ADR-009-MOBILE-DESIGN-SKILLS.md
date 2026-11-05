# ADR-009 — Project-first mobile design skills

**Decision:** Accepted for blueprint v1.4, November 5, 2026.

## Context
TRISSEA uses Expo/React Native for passenger and driver apps. Multiple AI coding agents can generate inconsistent visual UI or import generic web patterns. Project-specific mobile design, review and safety rules must be reusable across agents and applications.

## Decision
- Store binding, original TRISSEA visual, UX, safety and interaction rules in `design/MOBILE-DESIGN-RULES.md`, with token source `design/tokens.json`.
- Provide a portable, project-local agent skill in `.agents/skills/trissea-mobile-design/SKILL.md` and bridge files for Cursor/Copilot, and references in `AGENTS.md`/`CLAUDE.md`.
- Recommend **official Expo skills** for platform specifics; use vetted community Mobile Design and React Native guideline skills as optional assistance. Provide links and opt-in install commands rather than vendoring entire changing repositories.
- External skills never override approved dispatch, reservation, privacy, localization, legal or platform constraints.

## Consequences
- More consistent visual and interaction behavior with traceable accessibility standards.
- Some repeated documentation maintenance; changing token roles or component architecture requires cross-file update.
- Agent skills do not automatically implement screens or substitute for real-device usability and accessibility testing.

## Links
See `design/MOBILE-AGENT-REPOS.md` and `design/MOBILE-REVIEW-CHECKLIST.md`.

# Mobile Design Agent Repositories — Recommended for TRISSEA

**Status:** External sources verified November 5, 2026. These GitHub repositories are not packaged wholesale in this blueprint; the ZIP contains original TRISSEA-specific rules, a project-local agent skill and optional installation commands. If third-party skills are installed, review their files and licenses before allowing execution and pin a reviewed revision in the actual implementation repository.

## Recommended skill stack

| Priority | Repository / Skill | What it adds | GitHub |
|---|---|---|---|
| 1 | **Expo official** `expo-design-system`, `expo-native-ui`, `expo-router` | Token themes, reusable components, native iOS/Android styling and Expo Router conventions | https://github.com/expo/skills |
| 2 | **Mobile Design** `mobile-design` by RubenGlez | Navigation, forms, accessibility, touch, typography, motion, platform-specific screen review | https://github.com/RubenGlez/mobile-design |
| 3 | **Vercel** `react-native-guidelines` | React Native rendering, scrolling/list performance, stable references and platform patterns | https://github.com/vercel-labs/agent-skills |
| Optional | **React Native Design** `react-native-design` by brunoviews | Color contrast calculator, theme audits and screen patterns | https://github.com/brunoviews/agent-skills |

Official Expo repo and listed community projects describe AI agent skills; they are instruction packs, **not complete UI component libraries or a design finished for TRISSEA**. Expo design system skill is MIT-licensed; RubenGlez/mobile-design and Vercel agent-skills show MIT license. Always verify license and dependency policy on the commit actually installed.

## Install from project root on Windows PowerShell

First examine the repositories, then run:

```powershell
# Maintained official Expo skills; chooses compatible agents interactively
npx skills@latest add expo/skills --skill expo-design-system --skill expo-native-ui --skill expo-router

# Mobile-specific UX and accessibility (community)
npx skills@latest add RubenGlez/mobile-design

# React Native implementation and performance rules
npx skills@latest add vercel-labs/agent-skills --skill react-native-guidelines
```

If a skill name has changed, run `npx skills@latest add <owner/repo> --list` and choose the current name. The CLI may ask which coding agent to target. Node.js version must satisfy the installed CLI requirements.

An optional helper script is available: `scripts/install-mobile-design-skills.ps1`. It invokes external `npx` packages and therefore **requires network access and trust review**. Do not run it in untrusted repositories.

For Codex, Expo also documents an official plugin installation: `codex plugin add expo@openai-curated`. See https://docs.expo.dev/skills/ . If installing via both the plugin and skills CLI, avoid duplicated or conflicting instructions.

## Rule precedence, always

1. Approved TRISSEA feature, safety/operation/business rules and `AGENTS.md`.
2. `design/DESIGN-BIBLE.md` + `design/MOBILE-DESIGN-RULES.md` + `design/tokens.json`.
3. `design/MOBILE-COMPONENT-CONTRACTS.md` and screen acceptance/review checklists.
4. Installed Expo official skills and current Expo documentation.
5. Optional community third-party design / performance skills.

When different sources conflict, do **not** silently choose the most visually fashionable result. Follow the higher-precedence source; document an ADR for genuine design-system changes.

## Why not copy every repo into the ZIP?

Vendor copies go stale, can duplicate conflicting instructions, and require maintaining license notices. TRISSEA's own rulebook and project-local skill work without them; the install commands add current external guidance when a developer actually starts implementing mobile views.

## Primary links

- Expo skills: https://github.com/expo/skills
- Expo official skill reference: https://docs.expo.dev/skills/
- Mobile Design: https://github.com/RubenGlez/mobile-design
- Vercel agent skills: https://github.com/vercel-labs/agent-skills
- React Native Design (optional): https://github.com/brunoviews/agent-skills
- Skills CLI: https://github.com/vercel-labs/skills

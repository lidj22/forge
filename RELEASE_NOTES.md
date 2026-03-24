# Forge v0.4.14

Released: 2026-03-23

## Changes since v0.4.13

### Bug Fixes
- fix: bell idle timer 10s + 90s fallback
- fix: bell uses idle detection instead of output pattern matching
- fix: bell resets only on Enter key, not every keystroke
- fix: bell cooldown 2min per tab label, prevents duplicate notifications
- fix: bell requires 2000+ bytes of new output before checking markers
- fix: notification timestamps display in correct timezone
- fix: bell fires once per claude task, suppressed on attach/redraw
- fix: bell detects claude completion markers (Cogitated, tokens, prompt)


**Full Changelog**: https://github.com/aiwatching/forge/compare/v0.4.13...v0.4.14

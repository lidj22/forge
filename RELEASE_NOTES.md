# Forge v0.4.15

Released: 2026-03-23

## Changes since v0.4.14

### Features
- feat: record token usage from task, pipeline, and mobile sources
- feat: Usage dashboard — token cost by project, model, day, source
- feat: token usage tracking — scanner, DB, API

### Bug Fixes
- fix: exclude cache tokens from cost estimate
- fix: usage stored per day+model for accurate daily breakdown
- fix: usage query uses local timezone for daily grouping

### Performance
- perf: usage scan interval from 5min to 1 hour

### Other
- ui: show author and source URL in skills detail view
- ui: move Usage button next to Browser in header right section


**Full Changelog**: https://github.com/aiwatching/forge/compare/v0.4.14...v0.4.15

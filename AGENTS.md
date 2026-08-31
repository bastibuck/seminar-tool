## Agent skills

### Issue tracker

Issues live in GitHub Issues on `bastibuck/seminar-tool`, managed via the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles using their default label strings
(`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`).
See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/`.
See `docs/agents/domain.md`.

### Teaching workspace

All onboarding/teaching material lives under `teaching/` and is gitignored
(session-specific, not part of the product):
`teaching/lessons/`, `teaching/reference/`, `teaching/learning-records/`,
`teaching/assets/`, plus session docs `teaching/MISSION.md`, `teaching/NOTES.md`,
`teaching/RESOURCES.md`.

When a teaching session is active, check those files for context and create any
new lesson/learning-record/asset there (not at the repo root). Lessons cite
repo source via relative paths (`../../../app`, `../../../lib`, ...) that assume
they are one level below the repo root.

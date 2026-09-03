---
name: documentation-drift
description: Audit repository documentation against the current implementation, tests, configuration, and runtime evidence; report drift before editing, then update only after disputed behavior is confirmed.
disable-model-invocation: true
---

# Documentation Drift Audit

Audit documentation as a set of claims about the repository. Treat the implementation, tests, configuration, database schema, and verified runtime behavior as evidence; documentation is not authoritative.

## Operating Boundary

The default run is audit-only. Do not edit documentation during the initial audit. Produce findings and ask for confirmation where the documentation and implementation disagree about domain behavior, lifecycle rules, security posture, or historical decisions.

After the user confirms the disputed resolutions, update the affected documentation and re-check every changed claim against the evidence.

## Scope

Inspect all applicable documentation:

- Root `CONTEXT.md` and `CONTEXT-MAP.md`, if present.
- Every file under `docs/`, including ADRs, guides, references, specifications, examples, and research.
- Every file under `teaching/`, including lessons, reference material, learning records, textual assets, `MISSION.md`, `NOTES.md`, and `RESOURCES.md`.
- Repository-level documentation such as `README.md`, `AGENTS.md`, contribution guides, package documentation, and configuration documentation.
- Documentation embedded in configuration or scripts when it makes user-facing or architectural claims.

Compare claims with:

- Application and library code.
- Tests and fixtures.
- Package manifests and scripts.
- Configuration files.
- Database schemas, migrations, seed data, and generated interfaces.
- API routes, handlers, integrations, and client behavior.
- Local runtime behavior when it can be verified safely.

Respect repository instructions first. Read relevant `AGENTS.md`, domain guidance, and any documentation-specific conventions before exploring.

## Audit Method

1. Map the documentation surface and identify the implementation areas each document discusses.
2. Read the domain glossary before naming domain concepts. Preserve canonical terms and flag overloaded or conflicting language.
3. Extract substantive claims from each document. Ignore purely editorial prose unless it changes meaning.
4. Trace each claim to repository evidence. Use exact file and line references where possible.
5. Check concrete scenarios: creation, updates, deletion, retries, concurrency, permissions, lifecycle transitions, empty states, post-terminal behavior, and historical data.
6. Check examples and commands by looking for referenced files, routes, package scripts, configuration keys, and runnable APIs.
7. Check teaching material separately. A lesson may be historically accurate but still need a clear historical marker if it teaches an earlier implementation.
8. Check ADRs for both current validity and preserved historical context. Do not erase a decision merely because the implementation later changed; distinguish superseded rationale from current policy.
9. Check domain documentation for implementation detail. `CONTEXT.md` is a glossary, not a specification, scratchpad, or architecture record.
10. If runtime verification is useful, run the narrowest safe command first. Record what was verified locally and do not generalize local-only facts to hosted deployment without evidence.

## Classifications

Classify each substantive claim as one of:

- **Valid:** supported by current code or strong repository evidence.
- **Stale:** likely once accurate but no longer describes current behavior.
- **Contradicted:** directly disagrees with current implementation or tests.
- **Ambiguous:** terminology or wording cannot be mapped reliably to the code.
- **Missing:** omits an important current concept, behavior, constraint, or relationship.
- **Implementation detail in domain documentation:** belongs in technical documentation rather than `CONTEXT.md`.
- **Unverified:** cannot be confirmed from the repository or safe local runtime checks.

Order findings by severity, then confidence. Prioritize security, data loss, lifecycle, permissions, API behavior, broken examples, and domain-language contradictions over cosmetic issues.

## Finding Format

For every finding, include:

- Severity and confidence.
- Documentation file and line reference.
- The documented claim.
- Classification.
- Evidence from the codebase, with file and line references.
- Why the discrepancy matters.
- A recommended resolution.

Do not silently choose between contradictory domain behavior or historical decisions. State the competing interpretations and ask the user to confirm them.

## Required Report

Return these sections:

1. **Scope inspected:** concise list of documentation and implementation areas checked.
2. **Findings:** severity- and confidence-ordered findings using the finding format above.
3. **Missing concepts:** important current behaviors, constraints, relationships, or domain terms absent from the documentation.
4. **Unverified claims:** claims that could not be confirmed locally.
5. **Update plan:** proposed changes grouped under:
   - `CONTEXT.md`
   - ADRs
   - General `docs/`
   - `teaching/`
   - Repository-level documentation
6. **Confirmation needed:** only the decisions that must be resolved before documentation changes.

For `CONTEXT.md`, recommend only glossary-level changes. Recommend an ADR only when all three conditions hold:

- The decision is hard to reverse.
- It would be surprising without context.
- It resulted from a meaningful trade-off among alternatives.

## Update Phase

Only enter this phase after the user confirms disputed resolutions or explicitly asks to apply uncontroversial corrections.

1. Update the smallest set of affected documents.
2. Preserve intentional historical context in ADRs and learning records.
3. Mark superseded implementation descriptions as historical rather than presenting them as current.
4. Keep domain documentation free of implementation details.
5. Re-search for the old claim and nearby synonyms.
6. Re-check each changed claim against current code, tests, configuration, and runtime evidence.
7. Run relevant formatting, typecheck, tests, or build commands when available.
8. Report changed files, verification results, unresolved risks, and any claims that remain unverified.

## Guardrails

- Never edit documentation during the initial audit.
- Never treat an ADR as proof that the current code still implements its decision.
- Never treat a teaching record as current behavior without checking its historical framing.
- Never recommend implementation details for `CONTEXT.md`.
- Never turn a future ticket or research recommendation into an implemented capability.
- Never generalize local configuration or runtime results to production without evidence.
- Never silently resolve a domain contradiction.

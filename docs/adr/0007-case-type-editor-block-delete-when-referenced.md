# Case-type editor reverses "no type editor"; deletes are blocked when referenced

V1 introduces an admin surface for authoring case types and their findings, reversing ADR 0003's "types are seeded in version control, no type editor" stance. Findings remain referenced (not snapshotted) as before; the editor makes the mutations that 0003 assumed would only be deliberate developer changes.

Deletes are the one place preservation outweighs flexibility, and they differ by entity:

- **A case type delete is blocked while any case (active or ended) references it.** Running cases steer from the type's findings; deleting the type would strand them. Lookup is via the `restrict` FK from `cases.case_type_id`; we check first and refuse with the name of a referencing case.
- **A finding delete is blocked once any `releases` row ever referenced it.** A release is a record that the finding was shown to students; deleting the finding would cascade-destroy that release history, erasing the audit of what was disclosed. We refuse with the name of a run that released it.

Renames and reorders stay allowed and are retroactive (per ADR 0003): editing a finding immediately affects future starts and, via the release reference, past viewers. Only hard deletes are blocked. This keeps the accepted 0003 trade-off while guarding against accidental loss of referenced data.

Case type names are globally unique: a `unique` constraint on `case_types.name` (migration 000005) refuses duplicate names at the database level, and the admin API surfaces this as a friendly 409. Finding names remain unique only within their case type.
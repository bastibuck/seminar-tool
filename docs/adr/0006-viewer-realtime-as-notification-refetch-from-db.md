# The viewer treats Realtime events as notifications and refetches from the DB as source of truth

The viewer only ever reads case state through `GET /api/viewer/:code`: React Query holds the query key, and the viewer's single Realtime subscription is one **Broadcast** channel (`viewer-<caseId>`, event `changed`) whose parameter-less callback just calls `queryClient.invalidateQueries(...)`. The websocket message is a ping — a signal that something changed — never a source of row data. The delivered payload fields are ignored in production code.

We chose this deliberately over reading the payload directly. A payload is a point-in-time snapshot of whatever the event happened to carry; the DB is authoritative and always current. Doing a refetch on every event keeps a single source of truth (the tables) and sidesteps the question of which fields an event did or did not include. The cost is a REST round-trip per event, which is fine at this app's volume (a handful of releases per hour per case).

## The notification path is Broadcast, not Postgres-changes

The viewer historically subscribed to Postgres-changes on `releases` (all events) and `cases` (UPDATE), which is why the original version of this ADR leaned on `replica identity full` for DELETE routing. That mechanism is gone: migration `20260910000002` removed both tables from the `supabase_realtime` publication (integration test `tests/integration/anon-denied.test.ts` asserts no application table is in it) and restored `replica identity default`, so the replica-identity posture described here no longer applies to anything the viewer does. The viewer now subscribes to a Broadcast channel fed by `notifyViewerOfChange` in `lib/broadcast.ts`, which the cockpit's release/end routes call after each mutation. Broadcast replaces Postgres-changes as the doorbell; the refetch-not-payload decision is unchanged.

## A fallback refetch covers the doorbell breaking, never as a payload source

Because Broadcast is fire-and-forget with no replay, a ping sent while the viewer's socket is still connecting or reconnecting is lost forever. A narrow fallback (ADR `0011`) refetches the same viewer query on a 5-second interval only while the Realtime channel has not confirmed `SUBSCRIBED` and the case is still active, so the invariant holds: refetching is still from the DB, never from Realtime payloads.
# Seminar Tool

A live-teaching companion for medical roleplay workshops: doctors steer a patient case from a control room, releasing findings to students who work through the case in the seminar room.

## Language

**Case Type**:
A predefined case script: a named scenario carrying its fixed list of findings, prepared before any workshop takes place.
_Avoid_: template, blueprint, preset

**Case**:
A temporary named run of a case type, steered live by doctors and worked through by students in person. Multiple cases can run in parallel, and a case is not retained as a lasting record.
_Avoid_: session, room, workshop

**Case Activity**:
A real doctor action on a case: creating the case, releasing a finding, or un-releasing a finding. Viewer access and page views are not case activity.
_Avoid_: access, visit, heartbeat

**Case Expiry**:
The point after which a case is eligible for deletion: 24 hours after it ends, or 72 hours after its last case activity while it remains active. Expiry is evaluated by the nightly cleanup.
_Avoid_: archive, retention forever

**Cockpit**:
The doctor-facing surface used to start and steer a case and release findings.
_Avoid_: steering side, control room, admin

**Viewer**:
The student-facing, read-only surface showing everything released in a case. One shared device per room, joined by case code.
_Avoid_: view part, view side, student app

**Finding**:
A predefined item in a case with a name and exactly one image that doctors hold back and release at the right moment. The image is required for a Finding to exist, may be replaced, and is shown to Viewers when the Finding is released. It is not independently removable.
_Avoid_: data item, entity, file, attachment

Finding images are not live-updated in an already-open Viewer; a fresh page load reads the current image. Finding name and image changes do not need realtime propagation. Deleting a Finding also deletes its image; seeded Findings follow the same rule as every other Finding.

The supported admin upload formats are JPEG, PNG, and WebP. Generated SVG placeholders are an internal migration artifact and are not an admin upload format.

Every Finding has its image path required at the database level after the existing data is backfilled; the rollout may use a temporary nullable column only during that backfill. Generated placeholders may be SVG, while server-side admin upload validation accepts the declared MIME type and size limits without separate byte-signature inspection.

Finding creation and image replacement happen on a dedicated admin Finding page. The Viewer receives a signed image URL only for a released Finding; unreleased Findings and their image paths are not exposed.

The Cockpit may preview a Finding image before release. Replacing an image does not change any Case's release state and becomes visible to an already-running Case on the next Viewer page load. The Case Type editor keeps Finding previews, edit links, reorder controls, and deletion; deleting a Finding warns that its image will also be deleted. The Finding name is the image's alternative text in the Viewer.

**Release**:
The act of making a finding visible to all viewers of a case. A release optionally carries a contextual note the doctor types at release time; this note lives on the release, not the finding.
_Avoid_: publish, share, send

**Un-release**:
Revoking a release; the item disappears from viewers again. Used for mid-case mistakes.
_Avoid_: hide, retract

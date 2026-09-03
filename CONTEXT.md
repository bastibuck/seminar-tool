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
The point after which a case is eligible for deletion: 24 hours after it ends, or 72 hours after its last case activity while it remains active.
_Avoid_: archive, retention forever

**Cockpit**:
The doctor-facing surface used to start and steer a case and release findings.
_Avoid_: steering side, control room, admin

**Viewer**:
The student-facing, read-only surface showing everything released in a case. One shared device per room, joined by case code.
_Avoid_: view part, view side, student app

**Finding**:
A predefined item in a case (a name; file attachments come later) that doctors hold back and release at the right moment.
_Avoid_: data item, entity, file, attachment

**Release**:
The act of making a finding visible to all viewers of a case. A release optionally carries a contextual note the doctor types at release time; this note lives on the release, not the finding.
_Avoid_: publish, share, send

**Un-release**:
Revoking a release; the item disappears from viewers again. Used for mid-case mistakes.
_Avoid_: hide, retract

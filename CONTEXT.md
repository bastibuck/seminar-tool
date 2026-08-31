# Seminar Tool

A live-teaching companion for medical roleplay workshops: doctors steer a patient case from a control room, releasing findings to students who work through the case in the seminar room.

## Language

**Case Type**:
A predefined case script: a named scenario carrying its fixed list of findings, prepared before any workshop takes place.
_Avoid_: template, blueprint, preset

**Case**:
A named run of a case type, steered live by doctors and worked through by students. Multiple cases can run in parallel.
_Avoid_: session, room, workshop

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

insert into app_health (note)
values ('Bereit');

insert into case_types (id, name)
values ('11111111-4111-4111-8111-111111111111', 'Akuter Thoraxschmerz')
on conflict (id) do nothing;

insert into findings (id, case_type_id, name, note, position)
values
  (
    '21111111-4111-4111-8111-111111111111',
    '11111111-4111-4111-8111-111111111111',
    'Anamnese',
    '56-jähriger Patient, Druckgefühl hinter dem Brustbein seit 40 Minuten',
    1
  ),
  (
    '21111111-4111-4111-8111-111111111112',
    '11111111-4111-4111-8111-111111111111',
    'Vitalparameter',
    'RR 150/90 mmHg, HF 102/min, SpO₂ 94 %',
    2
  ),
  (
    '21111111-4111-4111-8111-111111111113',
    '11111111-4111-4111-8111-111111111111',
    '12-Kanal-EKG',
    'ST-Hebungen in II, III und aVF',
    3
  ),
  (
    '21111111-4111-4111-8111-111111111114',
    '11111111-4111-4111-8111-111111111111',
    'Labor: Troponin T',
    '480 ng/l, deutlich erhöht (Referenzbereich < 14 ng/l)',
    4
  ),
  (
    '21111111-4111-4111-8111-111111111115',
    '11111111-4111-4111-8111-111111111111',
    'Röntgen-Thorax',
    null,
    5
  ),
  (
    '21111111-4111-4111-8111-111111111116',
    '11111111-4111-4111-8111-111111111111',
    'Diagnose',
    'Hinterwandinfarkt',
    6
  )
on conflict (id) do nothing;

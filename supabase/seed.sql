insert into app_health (note)
values ('Bereit');

insert into case_types (id, name)
values ('11111111-4111-4111-8111-111111111111', 'Akuter Thoraxschmerz')
on conflict (name) do nothing;

insert into findings (id, case_type_id, name, position, image_path)
values
  (
    '21111111-4111-4111-8111-111111111111',
    '11111111-4111-4111-8111-111111111111',
    'Anamnese',
    1, 'findings/21111111-4111-4111-8111-111111111111/placeholder.svg'
  ),
  (
    '21111111-4111-4111-8111-111111111112',
    '11111111-4111-4111-8111-111111111111',
    'Vitalparameter',
    2, 'findings/21111111-4111-4111-8111-111111111112/placeholder.svg'
  ),
  (
    '21111111-4111-4111-8111-111111111113',
    '11111111-4111-4111-8111-111111111111',
    '12-Kanal-EKG',
    3, 'findings/21111111-4111-4111-8111-111111111113/placeholder.svg'
  ),
  (
    '21111111-4111-4111-8111-111111111114',
    '11111111-4111-4111-8111-111111111111',
    'Labor: Troponin T',
    4, 'findings/21111111-4111-4111-8111-111111111114/placeholder.svg'
  ),
  (
    '21111111-4111-4111-8111-111111111115',
    '11111111-4111-4111-8111-111111111111',
    'Röntgen-Thorax',
    5, 'findings/21111111-4111-4111-8111-111111111115/placeholder.svg'
  ),
  (
    '21111111-4111-4111-8111-111111111116',
    '11111111-4111-4111-8111-111111111111',
    'Diagnose',
    6, 'findings/21111111-4111-4111-8111-111111111116/placeholder.svg'
  )
on conflict (id) do nothing;

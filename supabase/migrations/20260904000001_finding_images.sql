insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- Allowed types must stay in sync with lib/finding-image/formats.ts (the SVG
-- entry covers legacy placeholder.svg artifacts provisioned by npm run db:backfill).
values ('finding-images', 'finding-images', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

alter table findings add column image_path text;

update findings
set image_path = 'findings/' || id || '/placeholder.svg'
where image_path is null;

alter table findings alter column image_path set not null;

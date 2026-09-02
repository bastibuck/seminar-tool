# Supabase Storage for File/Image Storage

**Date:** 2026-09-02
**Scope:** Research against primary sources (official Supabase docs, the `supabase/storage` GitHub repo, and the Supabase Storage API reference) for storing finding-attachment images in the seminar-tool (Next.js on Vercel + Supabase Postgres/Realtime) medical workshop app.

---

## 1. Can Supabase Storage handle this?

**Yes.** Supabase Storage is a general-purpose object/file store designed for exactly this: "storing user-generated content, ... images, videos, documents" with "fine-grained access controls" — [Storage overview](https://supabase.com/docs/guides/storage).

### Buckets
Buckets are "distinct containers for files and folders," like "super folders." You create **distinct buckets per security/access rule** (e.g., one bucket for videos, one for profile pictures). — [Storage Quickstart](https://supabase.com/docs/guides/storage/quickstart)

Buckets are backed by rows in the `storage.buckets` Postgres table. Key columns include `id`, `name`, `public`, `file_size_limit`, and `allowed_mime_types`. — [Storage Schema](https://supabase.com/docs/guides/storage/schema/design)

A bucket's `file_size_limit` and `allowed_mime_types` let you constrain uploads (e.g., only images under a certain size) at the bucket level. — [Storage Schema](https://supabase.com/docs/guides/storage/schema/design)

### File size limits & storage quotas
- **Standard upload** is "ideal for small files that are not larger than **6MB**." The standard API can technically upload up to 5GB, but TUS resumable upload is recommended above 6MB. — [Standard Uploads](https://supabase.com/docs/guides/storage/uploads)
- **Plan storage quotas** (from the [pricing comparison table](https://supabase.com/pricing)):
  - **Free:** 1 GB file storage, max file upload size **50 MB**, 5 GB egress (5 GB cached).
  - **Pro ($25/mo):** 100 GB storage (then $0.0213/GB), max file upload size **500 GB**, 250 GB egress (then $0.09/GB), plus 250 GB cached egress.

### Supported image/file types
Any file type can be stored. Image **transformation** (resize/optimize) supports PNG, JPEG, WebP, AVIF, GIF, ICO, SVG, BMP, TIFF (and HEIC as source only, not result). — [Image Transformations — supported formats](https://supabase.com/docs/guides/storage/image-transformations)

You can restrict uploads to an allow-list of MIME types via a bucket's `allowed_mime_types` column. — [Storage Schema](https://supabase.com/docs/guides/storage/schema/design)

### How files are referenced
Three ways:
1. **Public URL** (`getPublicUrl`) — works only for public buckets / public objects, no auth.
2. **Signed URL** (`createSignedUrl`) — temporary, time-limited link used for private objects.
3. **Download via SDK** (`download` / `downloadAuthenticated`) — streams the bytes to the client; used with the user's auth token.

These are documented under the [Storage SDK methods](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl). Details in §3 and §5.

---

## 2. How do files live in Supabase Storage?

### Physical storage / provider
Supabase Storage is "an [Amazon S3-compatible](https://github.com/supabase/storage) object storage service that stores metadata in Postgres." The actual binary objects are stored in an S3-compatible storage provider, while **metadata lives in Postgres** and **authorization is enforced by Postgres Row Level Security**. — [supabase/storage README](https://github.com/supabase/storage)

> "the storage schema only stores the metadata and the actual objects are stored in a provider like S3." — [Storage Schema](https://supabase.com/docs/guides/storage/schema/design)

### URL / routing
Files are served through your project's REST API at the storage hostname:
- REST uploads/downloads: `https://<project-ref>.supabase.co/storage/v1/object/<bucket>/<path>` — [Standard Uploads — cURL](https://supabase.com/docs/guides/storage/uploads)
- Direct storage hostname for uploads (better performance): `https://<project-ref>.storage.supabase.co` — [Resumable Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- Rendered/transformed images: `https://<project-id>.supabase.co/storage/v1/render/image/public/bucket/image.jpg?width=500&height=600` — [Image Transformations](https://supabase.com/docs/guides/storage/image-transformations)

### Organizing files in folders
Files can be organized into **folders within a bucket**, exactly like a filesystem. ("Folders are a way to organize your files... There is no right or wrong way to organize your files.") — [Storage Quickstart](https://supabase.com/docs/guides/storage/quickstart)

Folder structure is derived from the object `name` path (e.g. `public/subfolder/avatar.png`), and the helpers `storage.foldername(name)` and `storage.filename(name)` expose that structure for RLS policies. — [Storage Helper Functions](https://supabase.com/docs/guides/storage/schema/helper-functions)

File/folder/bucket names must follow AWS object-key naming guidelines. — [Storage Quickstart](https://supabase.com/docs/guides/storage/quickstart)

---

## 3. How to protect files?

### RLS policies for storage
Storage access control is **entirely Postgres RLS** on the `storage.objects` table. "By default Storage does not allow any uploads to buckets without RLS policies." You create policies for `SELECT` (read), `INSERT` (upload), `UPDATE` (overwrite), `DELETE`. — [Storage Access Control](https://supabase.com/docs/guides/storage/access-control)

Example — allow only authenticated users to upload into the `private` folder of a bucket:

```sql
create policy "Allow authenticated uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'my_bucket_id' and
  (storage.foldername(name))[1] = 'private'
);
```
— [Storage Access Control](https://supabase.com/docs/guides/storage/access-control)

Allow a user to read only their own uploads (by `owner_id`):

```sql
create policy "Individual user Access"
on storage.objects for select
to authenticated
using ( (select auth.jwt()->>'sub') = owner_id );
```
— [Storage Access Control](https://supabase.com/docs/guides/storage/access-control)

There are operation-aware helpers, `storage.allow_only_operation()` / `storage.allow_any_operation()`, to distinguish "list" from "download" when both use `SELECT`. — [Storage Helper Functions](https://supabase.com/docs/guides/storage/schema/helper-functions)

### Bucket-level vs object-level control
Access decisions are made **per-object** via RLS on `storage.objects`, referencing the bucket (`bucket_id`) and object name/folder. Bucket-level config (public flag, file size limit, allowed MIME types) provides coarse constraints. Roles are checked via `auth.uid()` / `auth.jwt()` or `to authenticated`/`to public` policy roles. — [Storage Access Control](https://supabase.com/docs/guides/storage/access-control), [Storage Schema](https://supabase.com/docs/guides/storage/schema/design)

### Public vs private buckets
- **Public bucket:** objects "do not require any authorization to access." Public objects get better CDN cache-hit rates because no per-user policy check is needed.
- **Private bucket:** "permissions for accessing each object is checked on a per user level" — each user with different policies causes its own cache miss.
— [Storage CDN](https://supabase.com/docs/guides/storage/cdn/fundamentals)

For private buckets you grant read access via RLS and/or issue signed URLs.

### Signed URLs
- **`createSignedUrl(path, expiresIn)`** — "Creates a signed URL. Use a signed URL to share a file for a fixed amount of time." `expiresIn` is **seconds**. Requires `select` permission on `storage.objects`. — [JS API: createSignedUrl](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl)
- **`createSignedUrls(paths[], expiresIn)`** — batch version for many files. — [JS API: createSignedUrls](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurls)
- Signed URLs can **also carry image-transformation options**, embedded into the URL's token. — [Image Transformations — signing transformed URLs](https://supabase.com/docs/guides/storage/image-transformations)

With Next.js, you typically generate signed URLs server-side (in a route handler or server action using the service key, which bypasses RLS), then hand the short-lived URL to the client `<img>` tag or a download link.

### Restricting by user role (our "released findings viewable only" case)
Yes. Combine:
- **Private bucket** (no public access).
- **RLS `SELECT` policy** allowing the intended audience (e.g. students) to read the specific released objects while cockpit users get `INSERT`/upload.
- **Signed URLs** issued over the service role for students, so students never need direct RLS access — the URL is the short-lived credential.

The `allow_any_operation` / `allow_only_operation` helpers let you control exactly which operations (list vs read) a given role may perform. — [Storage Helper Functions](https://supabase.com/docs/guides/storage/schema/helper-functions)

> **Security note:** "If you exclusively use Storage from trusted clients, such as your own servers, and need to bypass the RLS policies, you can use the service key... Service keys entirely bypass RLS policies." Never share the service key publicly. — [Storage Access Control](https://supabase.com/docs/guides/storage/access-control)

---

## 4. Integration with our data model

Our model: `case_types → cases → findings` and a separate `releases` join table (`case_id, finding_id, released_at, note`). Findings currently have only `name` + `position`. — see `supabase/migrations/20260824000001_*.sql` and `[...]0002_releases.sql`, and `lib/cases.ts`.

### How to reference stored files
Store the **object path** (and bucket) in a new column on `findings` (e.g. `attachment_path text`) or a child `finding_files` table if a finding can have multiple attachments. The stored path is relative to the bucket, e.g. `findings/<finding-id>/<file-name>.png`. Do not store a public URL — build URLs on demand from path + freshness.

Because access is controlled per-object by RLS and the `name`/folder, you can place files in a folder corresponding to the finding id and gate reads accordingly.

### Born vs released access — the "release" flow
Two viable patterns:

**Pattern A — private bucket + signed URLs issued server-side (recommended).**
- Bucket is **private**; cockpit (uploader) gets `INSERT`/`SELECT`/`UPDATE`/`DELETE` via RLS (or uploads happen server-side with the service key).
- Students never hold RLS access. When a finding is **released** (a row appears in `releases`), your server-side route calls `createSignedUrl(path, expiresIn)` using the service key to mint a time-limited URL, then returns it to the student client. Unreleased findings simply never get a URL, so there's nothing to leak.
- Because the sign claims in `lib/cases.ts` already join `releases` to know what is released (see `getCaseByCode` at `lib/cases.ts:143`), you can mint URLs only for released, non-ended findings.

**Pattern B — RLS-driven reads by role.**
- Make students an `authenticated` role with an RLS `SELECT` policy that allows reading only objects in `findings/<released finding ids>`. This requires encoding release state into the object path (brittle) or cross-table RLS `IN` subqueries on `releases` joined per user and case. More complex and less auditable than signed URLs.

**Permanent vs time-limited URL:** signed URLs can be minted with a long `expiresIn` (e.g. 31536000 = 1 year) for workshop-long access, or a short window. There is no "forever" signed URL — re-mint on each request or cache the minted URL. For long-lived, unauthenticated distribution you'd make the bucket public (not advised here for unreleased medical material).

---

## 5. SDK / API usage (`@supabase/supabase-js`)

The Storage module is reached via `supabase.storage.from('<bucket>')`. All methods return `{ data, error }`. — [Standard Uploads](https://supabase.com/docs/guides/storage/uploads)

### Upload from the client (JS)
```js
const { data, error } = await supabase.storage
  .from('avatars')
  .upload('public/avatar1.png', file)
```
— [Storage Quickstart](https://supabase.com/docs/guides/storage/quickstart)

Options include `upsert` (overwrite — returns `400 Asset Already Exists` otherwise) and `contentType`. — [Standard Uploads](https://supabase.com/docs/guides/storage/uploads)

### Upload from a server / API route
Two options:
1. **Standard upload with the service-role client** (create a `@supabase/supabase-js` client using `SUPABASE_SERVICE_ROLE_KEY`) — bypasses RLS, allowed from trusted server code. — [Storage Access Control — bypassing](https://supabase.com/docs/guides/storage/access-control)
2. **`createSignedUploadUrl`** — mints a time-limited token for a client to upload to a private bucket without granting blanket upload rights. Combine with TUS resumable for large files. — [Resumable Uploads — presigned uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)

### List files
`supabase.storage.from(bucket).list('folder')` and the newer paginated `listV2(...)`, plus bucket listing via `listBuckets()`. — [JS API reference](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl)

### Delete files
`supabase.storage.from(bucket).remove([path1, path2])`. (Bucket deletion requires emptying the bucket first via `empty()`.) — [JS API reference](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl)

### Download
`supabase.storage.from(bucket).download(path)` or `.downloadAuthenticated(path)` (private buckets); supports transform options. — [Storage Quickstart](https://supabase.com/docs/guides/storage/quickstart), [Image Transformations](https://supabase.com/docs/guides/storage/image-transformations)

---

## 6. Gotchas and limitations

- **Overwrites are anti-pattern.** Overwriting "will take some time to propagate the changes to all the edge nodes leading to stale content." Upload to a **new path** instead. — [Standard Uploads](https://supabase.com/docs/guides/storage/uploads), [Resumable Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- **CDN / caching:** all assets are cached on a global CDN (285+ cities). Private buckets get a **cache miss per user with different policies**; public buckets cache across users. Cache status is in the `cf-cache-status` header. — [Storage overview](https://supabase.com/docs/guides/storage), [Storage CDN](https://supabase.com/docs/guides/storage/cdn/fundamentals)
- **Don't modify the `storage` schema** — treat it as read-only; only add custom indexes (recommended for RLS performance). Deleting metadata directly (not via API) leaves orphaned billed objects. — [Storage Schema](https://supabase.com/docs/guides/storage/schema/design)
- **S3 versioning not supported** — deleted objects are permanently removed. — [S3 Compatibility](https://supabase.com/docs/guides/storage/s3/compatibility)
- **Image transformation is Pro-plan+** and billed per origin image (100 included, then $5/1000); not on Free. Free also caps **max upload at 50MB** and **storage at 1GB**. — [Storage Image Transformations](https://supabase.com/docs/guides/storage/image-transformations), [Pricing](https://supabase.com/pricing)
- **No per-request cold-start concern for serving** — the CDN caches public assets; private/assets incur an origin fetch on cache miss but this is CDN-level latency, not serverless cold start. (The Next.js app itself, on Vercel, does have cold starts, but that's orthogonal to Storage.)
- **Vercel + Supabase Storage:** the standard pattern is a Vercel route handler / server action that uses the service-role client or the JS SDK to upload the `File`/`Blob` and mint signed URLs. The `next/image` loader for Supabase transformations is documented. — [Image Transformations — Next.js loader](https://supabase.com/docs/guides/storage/image-transformations)
- **Rate limits:** Supabase doesn't publish hard per-second upload rate limits in the docs reviewed; plan-level volume (egress/storage) and MAU/usage quotas apply. For heavy bulk uploads, prefer the direct storage hostname and resumable uploads. — [Resumable Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)

---

## Recommendation (tailored to seminar-tool)

Supabase Storage is a strong fit: it already shares the project's Postgres access control model (RLS), so authorization logic stays in one place, and `@supabase/supabase-js` is already a dependency (`^2.112.4`).

Concretely for this project:

1. **One private bucket** for finding attachments (e.g. `finding-attachments`), files under `findings/<finding-id>/<filename>`. Keep it **private** — no public URL pattern.
2. **Uploads from the cockpit**: server-side (Vercel route handler / server action) with the service-role client, so only trusted code can write, OR RLS `INSERT` policy scoped to cockpit role. Given students must never upload, server-side with service key is simplest and safest.
3. **Reference in the DB**: add `attachment_path` (and maybe `attachment_content_type`, `attachment_size`) to `findings`, or a `finding_files` child table if a finding can carry multiple images. Store the object path, not a URL.
4. **Release flow**: when a finding is released (a row in `releases` — already modeled), a server route mints a **signed URL** via `createSignedUrl(path, expiresIn)` with the service key and returns it to the student. Mint only for released, non-ended findings (the join logic already exists in `lib/cases.ts`), with an expiry tuned to the workshop window (e.g. minutes-to-hours; re-mint on each view). This gives time-limited protection while keeping files private and out of students' direct RLS reach.
5. **Plan**: the Free tier (50 MB max upload, 1 GB storage) is fine to prototype, but the Pro plan unlocks image transformations, smart CDN, and larger uploads — consider it before adding real workshop media. Keep objects **never overwritten** (use fresh paths per upload) to avoid CDN stale-content issues.

**Bottom line:** use a **private bucket + server-minted signed URLs for released findings**, reference files by object path columns on `findings`, and perform all uploads server-side with the service key. This keeps medical material private, enforces release-time visibility, and reuses the existing `releases` model.

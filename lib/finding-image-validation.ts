export const FINDING_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const FINDING_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function validateFindingImage(file: File | null): string | null {
  if (!file || file.size === 0) return "Bitte wähle ein Bild aus.";
  if (!(FINDING_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Bitte lade ein JPEG-, PNG- oder WebP-Bild hoch.";
  }
  if (file.size > FINDING_IMAGE_MAX_BYTES) return "Das Bild darf höchstens 10 MB groß sein.";
  return null;
}

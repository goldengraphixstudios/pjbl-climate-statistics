import { uploadDataUrlToStorage } from './supabaseClient';

export interface FileAsset {
  url: string;
  filename?: string;
  mimeType?: string;
  uploadedAt?: string;
  storagePath?: string;
}

interface UploadStudentFileAssetParams {
  studentId: string;
  lessonSlug: string;
  activityKey: string;
  file?: File | null;
  existingValue?: string | null;
  filename?: string;
  mimeType?: string;
}

const DATA_URL_PATTERN = /^data:([^;]+);base64,/i;
const REMOTE_URL_PATTERN = /^https?:\/\//i;

function inferExtensionFromMimeType(mimeType?: string | null) {
  if (!mimeType) return 'bin';
  const normalized = mimeType.toLowerCase();
  const mapped: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  };
  return mapped[normalized] || normalized.split('/').pop() || 'bin';
}

function inferMimeTypeFromDataUrl(value: string) {
  const match = DATA_URL_PATTERN.exec(value);
  return match?.[1] || undefined;
}

function inferMimeTypeFromUrl(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.endsWith('.pdf')) return 'application/pdf';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.svg')) return 'image/svg+xml';
  return undefined;
}

function sanitizeFilename(filename: string, fallbackMimeType?: string) {
  const trimmed = filename.trim();
  const fallbackExt = inferExtensionFromMimeType(fallbackMimeType);
  if (!trimmed) return `uploaded-file.${fallbackExt}`;

  const lastDot = trimmed.lastIndexOf('.');
  const rawBase = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  const rawExt = lastDot > 0 ? trimmed.slice(lastDot + 1) : fallbackExt;
  const safeBase =
    rawBase
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'uploaded-file';
  const safeExt =
    rawExt
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toLowerCase() || fallbackExt;
  return `${safeBase}.${safeExt}`;
}

function deriveFilenameFromUrl(value: string, fallbackFilename?: string, mimeType?: string) {
  if (fallbackFilename?.trim()) return fallbackFilename.trim();
  if (value.startsWith('data:')) {
    return `uploaded-file.${inferExtensionFromMimeType(mimeType || inferMimeTypeFromDataUrl(value))}`;
  }

  try {
    const parsed = new URL(value);
    const fromPath = decodeURIComponent(parsed.pathname.split('/').pop() || '').trim();
    if (fromPath) return fromPath;
  } catch {
    // Ignore invalid URL parsing and fall back below.
  }

  return `uploaded-file.${inferExtensionFromMimeType(mimeType || inferMimeTypeFromUrl(value))}`;
}

async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

export function isFileAsset(value: unknown): value is FileAsset {
  return !!value && typeof value === 'object' && typeof (value as FileAsset).url === 'string';
}

export function resolveFileAsset(value: unknown, fallback: Partial<FileAsset> = {}): FileAsset | null {
  if (isFileAsset(value)) {
    const url = value.url.trim();
    if (!url) return null;
    const mimeType = value.mimeType || fallback.mimeType || inferMimeTypeFromDataUrl(url) || inferMimeTypeFromUrl(url);
    return {
      ...fallback,
      ...value,
      url,
      mimeType,
      filename: value.filename || fallback.filename || deriveFilenameFromUrl(url, fallback.filename, mimeType),
    };
  }

  if (typeof value === 'string') {
    const url = value.trim();
    if (url.startsWith('{') || url.startsWith('[')) {
      try {
        const parsed = JSON.parse(url);
        const parsedAsset = resolveFileAsset(parsed, fallback);
        if (parsedAsset) return parsedAsset;
      } catch {
        // Ignore invalid JSON and continue with plain-string handling below.
      }
    }
    if (!url || (!url.startsWith('data:') && !REMOTE_URL_PATTERN.test(url))) return null;
    const mimeType = fallback.mimeType || inferMimeTypeFromDataUrl(url) || inferMimeTypeFromUrl(url);
    return {
      url,
      mimeType,
      filename: fallback.filename || deriveFilenameFromUrl(url, fallback.filename, mimeType),
      uploadedAt: fallback.uploadedAt,
      storagePath: fallback.storagePath,
    };
  }

  return null;
}

export function getFileAssetFilename(value: unknown, fallbackFilename?: string) {
  return resolveFileAsset(value, { filename: fallbackFilename })?.filename || fallbackFilename || 'uploaded-file';
}

export function isPdfFileAsset(value: unknown) {
  const asset = resolveFileAsset(value);
  return asset?.mimeType === 'application/pdf' || /\.pdf(?:$|\?)/i.test(asset?.url || '');
}

export function isImageFileAsset(value: unknown) {
  const asset = resolveFileAsset(value);
  return !!asset?.mimeType && asset.mimeType.startsWith('image/');
}

export async function uploadStudentFileAsset({
  studentId,
  lessonSlug,
  activityKey,
  file,
  existingValue,
  filename,
  mimeType,
}: UploadStudentFileAssetParams): Promise<FileAsset | null> {
  const uploadedAt = new Date().toISOString();
  let dataUrl: string | null = null;
  let resolvedFilename = filename?.trim() || file?.name || '';
  let resolvedMimeType = mimeType?.trim() || file?.type || '';

  if (file) {
    dataUrl = await readFileAsDataUrl(file);
    resolvedMimeType = resolvedMimeType || inferMimeTypeFromDataUrl(dataUrl) || '';
    resolvedFilename = resolvedFilename || `uploaded-file.${inferExtensionFromMimeType(resolvedMimeType)}`;
  } else if (existingValue?.trim()) {
    const normalized = existingValue.trim();
    if (REMOTE_URL_PATTERN.test(normalized)) {
      return resolveFileAsset(normalized, {
        filename: resolvedFilename,
        mimeType: resolvedMimeType,
        uploadedAt,
      });
    }
    if (normalized.startsWith('data:')) {
      dataUrl = normalized;
      resolvedMimeType = resolvedMimeType || inferMimeTypeFromDataUrl(normalized) || '';
      resolvedFilename = resolvedFilename || `uploaded-file.${inferExtensionFromMimeType(resolvedMimeType)}`;
    }
  }

  if (!dataUrl) return null;

  const safeFilename = sanitizeFilename(resolvedFilename, resolvedMimeType);
  const storagePath = [
    'student-uploads',
    lessonSlug,
    studentId,
    activityKey,
    `${Date.now()}-${safeFilename}`,
  ].join('/');
  const uploadResult = await uploadDataUrlToStorage('uploads', storagePath, dataUrl);
  const publicUrl = 'publicUrl' in uploadResult ? uploadResult.publicUrl : null;
  const url = publicUrl || dataUrl;
  const normalized = resolveFileAsset(url, {
    filename: safeFilename,
    mimeType: resolvedMimeType,
    uploadedAt,
    storagePath,
  });
  return normalized;
}

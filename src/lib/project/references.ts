import type { PathValidationResult } from "@/lib/project/paths";
import type { Project, ProjectFileMap, ProjectReference, ProjectReferenceKind } from "@/lib/project/types";

export const REFERENCE_ROOT = "src/references/";
export const MAX_PROJECT_REFERENCES = 10;
export const MAX_REFERENCE_TOTAL_BYTES = 25 * 1024 * 1024;

export const REFERENCE_ACCEPT_ATTRIBUTE = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".pdf",
  ".css",
  ".html",
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".xml",
].join(",");

export class ReferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type ReferenceUpload =
  | {
      name: string;
      mimeType?: string;
      size: number;
      content: string;
      dataBase64?: never;
    }
  | {
      name: string;
      mimeType?: string;
      size: number;
      dataBase64: string;
      content?: never;
    };

interface AddReferenceOptions {
  now?: string;
  createId?: () => string;
}

interface ReferenceTypeInfo {
  extension: string;
  kind: ProjectReferenceKind;
  mimeType: string;
}

const TEXT_REFERENCE_MIME_TYPES = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".md", "text/markdown"],
  [".txt", "text/plain"],
  [".json", "application/json"],
  [".csv", "text/csv"],
  [".xml", "application/xml"],
]);

const BINARY_REFERENCE_MIME_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".pdf", "application/pdf"],
]);

export function addReferenceUploads(
  project: Project,
  uploads: ReferenceUpload[],
  options: AddReferenceOptions = {},
): Project {
  if (uploads.length === 0) return project;

  const existingReferences = project.references ?? [];
  const nextCount = existingReferences.length + uploads.length;
  if (nextCount > MAX_PROJECT_REFERENCES) {
    throw new ReferenceValidationError(`Projects can include up to 10 references.`);
  }

  const nextSize =
    existingReferences.reduce((total, reference) => total + reference.size, 0) +
    uploads.reduce((total, upload) => total + normalizeSize(upload.size), 0);
  if (nextSize > MAX_REFERENCE_TOTAL_BYTES) {
    throw new ReferenceValidationError("References are limited to 25 MB per project.");
  }

  const now = options.now ?? new Date().toISOString();
  const createId = options.createId ?? createReferenceId;
  const usedPaths = new Set([
    ...Object.keys(project.files),
    ...existingReferences.map((reference) => reference.projectPath),
  ]);
  const references = [...existingReferences];
  const files: ProjectFileMap = { ...project.files };

  for (const upload of uploads) {
    const sanitizedName = sanitizeReferenceFileName(upload.name);
    const typeInfo = getReferenceTypeInfo(sanitizedName);
    if (!typeInfo) {
      throw new ReferenceValidationError(`Unsupported reference type: ${upload.name}`);
    }
    const projectPath = makeUniqueReferencePath(sanitizedName, usedPaths);
    const mimeType = normalizeMimeType(upload.mimeType, typeInfo);
    const reference: ProjectReference = {
      id: createId(),
      name: normalizeDisplayName(upload.name),
      mimeType,
      size: normalizeSize(upload.size),
      kind: typeInfo.kind,
      projectPath,
      createdAt: now,
    };

    if (typeInfo.kind === "text") {
      if (!("content" in upload) || typeof upload.content !== "string") {
        throw new ReferenceValidationError(`Text reference "${upload.name}" requires text content.`);
      }
      files[projectPath] = upload.content;
    } else {
      if (!("dataBase64" in upload) || typeof upload.dataBase64 !== "string") {
        throw new ReferenceValidationError(`Binary reference "${upload.name}" requires base64 data.`);
      }
      if (!isLikelyBase64(upload.dataBase64)) {
        throw new ReferenceValidationError(`Binary reference "${upload.name}" is not valid base64.`);
      }
      reference.dataBase64 = upload.dataBase64;
    }

    references.push(reference);
  }

  return {
    ...project,
    files,
    references,
    updatedAt: now,
  };
}

export function removeProjectReference(project: Project, referenceId: string): Project {
  const reference = project.references.find((candidate) => candidate.id === referenceId);
  if (!reference) return project;

  const files = { ...project.files };
  if (reference.kind === "text") {
    delete files[reference.projectPath];
  }

  return {
    ...project,
    files,
    references: project.references.filter((candidate) => candidate.id !== referenceId),
    updatedAt: new Date().toISOString(),
  };
}

export function validateReferencePath(filePath: string): PathValidationResult {
  if (!filePath || filePath.length > 240) {
    return invalidReferencePath(filePath);
  }

  if (
    filePath.startsWith("/") ||
    filePath.startsWith("./") ||
    filePath.includes("\\") ||
    filePath.includes("\0") ||
    filePath.includes("//")
  ) {
    return invalidReferencePath(filePath);
  }

  const parts = filePath.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".." || part.startsWith("."))) {
    return invalidReferencePath(filePath);
  }

  if (!filePath.startsWith(REFERENCE_ROOT)) {
    return invalidReferencePath(filePath);
  }

  if (!getReferenceTypeInfo(filePath)) {
    return invalidReferencePath(filePath);
  }

  return { ok: true, path: filePath };
}

export function assertValidReferencePath(filePath: string): string {
  const result = validateReferencePath(filePath);
  if (!result.ok) {
    throw new ReferenceValidationError(result.error);
  }
  return result.path;
}

export function validateProjectReferences(
  references: ProjectReference[] | undefined,
  files: ProjectFileMap,
): void {
  const projectReferences = references ?? [];
  if (projectReferences.length > MAX_PROJECT_REFERENCES) {
    throw new ReferenceValidationError(`Projects can include up to 10 references.`);
  }

  const totalSize = projectReferences.reduce((total, reference) => total + normalizeSize(reference.size), 0);
  if (totalSize > MAX_REFERENCE_TOTAL_BYTES) {
    throw new ReferenceValidationError("References are limited to 25 MB per project.");
  }

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();

  for (const reference of projectReferences) {
    if (!reference.id || seenIds.has(reference.id)) {
      throw new ReferenceValidationError("Reference ids must be unique.");
    }
    seenIds.add(reference.id);

    const path = assertValidReferencePath(reference.projectPath);
    if (seenPaths.has(path)) {
      throw new ReferenceValidationError(`Duplicate reference path: ${path}`);
    }
    seenPaths.add(path);

    const typeInfo = getReferenceTypeInfo(path);
    if (!typeInfo || reference.kind !== typeInfo.kind) {
      throw new ReferenceValidationError(`Reference kind does not match ${path}.`);
    }

    if (reference.kind === "text") {
      if (!Object.hasOwn(files, reference.projectPath)) {
        throw new ReferenceValidationError(`Missing text reference file: ${reference.projectPath}`);
      }
      continue;
    }

    if (!reference.dataBase64 || !isLikelyBase64(reference.dataBase64)) {
      throw new ReferenceValidationError(`Missing binary data for reference: ${reference.projectPath}`);
    }
  }
}

export function getReferenceKindForName(fileName: string): ProjectReferenceKind | undefined {
  return getReferenceTypeInfo(fileName)?.kind;
}

export function isSupportedProviderImage(reference: ProjectReference): boolean {
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(reference.mimeType);
}

export function isPdfReference(reference: ProjectReference): boolean {
  return reference.mimeType === "application/pdf";
}

export function referenceToDataUrl(reference: ProjectReference): string | undefined {
  if (!reference.dataBase64) return undefined;
  return `data:${reference.mimeType};base64,${reference.dataBase64}`;
}

export function decodeBase64ToUint8Array(dataBase64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(dataBase64, "base64"));
  }

  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function sanitizeReferenceFileName(fileName: string): string {
  const displayName = normalizeDisplayName(fileName);
  const extension = getExtension(displayName);
  if (!extension || !getReferenceTypeInfo(displayName)) {
    throw new ReferenceValidationError(`Unsupported reference type: ${fileName}`);
  }

  const rawBaseName = displayName.slice(0, -extension.length);
  const baseName =
    rawBaseName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 170) || "reference";

  return `${baseName}${extension}`;
}

function normalizeDisplayName(fileName: string): string {
  const normalized = fileName.trim();
  if (
    !normalized ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.includes("\0") ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith(".")
  ) {
    throw new ReferenceValidationError(`Invalid reference name: ${fileName || "<empty>"}`);
  }
  return normalized;
}

function makeUniqueReferencePath(fileName: string, usedPaths: Set<string>): string {
  const extension = getExtension(fileName);
  const baseName = fileName.slice(0, -extension.length);
  let suffix = 1;
  let candidate = `${REFERENCE_ROOT}${fileName}`;

  while (usedPaths.has(candidate)) {
    suffix += 1;
    candidate = `${REFERENCE_ROOT}${baseName}-${suffix}${extension}`;
  }

  usedPaths.add(candidate);
  return candidate;
}

function getReferenceTypeInfo(fileName: string): ReferenceTypeInfo | undefined {
  const extension = getExtension(fileName);
  const textMimeType = TEXT_REFERENCE_MIME_TYPES.get(extension);
  if (textMimeType) {
    return { extension, kind: "text", mimeType: textMimeType };
  }

  const binaryMimeType = BINARY_REFERENCE_MIME_TYPES.get(extension);
  if (binaryMimeType) {
    return { extension, kind: "binary", mimeType: binaryMimeType };
  }

  return undefined;
}

function normalizeMimeType(mimeType: string | undefined, typeInfo: ReferenceTypeInfo): string {
  const normalized = mimeType?.trim().toLowerCase();
  if (!normalized || normalized === "application/octet-stream") {
    return typeInfo.mimeType;
  }
  return normalized;
}

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filePath.slice(lastDot).toLowerCase();
}

function normalizeSize(size: number): number {
  if (!Number.isFinite(size) || size < 0) {
    throw new ReferenceValidationError("Reference size must be a non-negative number.");
  }
  return size;
}

function isLikelyBase64(value: string): boolean {
  return value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

function invalidReferencePath(filePath: string): PathValidationResult {
  return { ok: false, error: `Invalid reference path: ${filePath || "<empty>"}` };
}

function createReferenceId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `ref-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

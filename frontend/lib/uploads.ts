// Leave room for multipart headers under Vercel's request-body limit.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const IMAGE_SIZE_ERROR = "Images must be 4 MB or smaller.";
export function imageSizeError(file: Pick<File, "size">): string | null {
  return file.size > MAX_IMAGE_BYTES ? IMAGE_SIZE_ERROR : null;
}

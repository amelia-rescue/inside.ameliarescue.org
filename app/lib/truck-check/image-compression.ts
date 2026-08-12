export const MAX_IMAGE_DIMENSION = 3072;
export const IMAGE_QUALITY = 0.85;
export const COMPRESSED_IMAGE_TYPE = "image/jpeg";

export class UnsupportedImageError extends Error {
  constructor(fileName: string) {
    super(
      `"${fileName}" could not be read. Try a JPG or PNG, or retake the photo.`,
    );
    this.name = "UnsupportedImageError";
  }
}

export function getScaledDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxDimension) {
    return { width, height };
  }

  const scale = maxDimension / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function getCompressedFileName(fileName: string): string {
  const baseName = fileName.replace(/\.[^./\\]+$/, "") || "photo";
  return `${baseName}.jpg`;
}

async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    // `from-image` bakes EXIF orientation into the bitmap, which canvas drawing
    // would otherwise discard, leaving phone photos rotated sideways.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UnsupportedImageError(file.name);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, COMPRESSED_IMAGE_TYPE, IMAGE_QUALITY);
  });
}

export async function compressImage(
  file: File,
  maxDimension = MAX_IMAGE_DIMENSION,
): Promise<File> {
  const bitmap = await decodeImage(file);

  try {
    const { width, height } = getScaledDimensions(
      bitmap.width,
      bitmap.height,
      maxDimension,
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new UnsupportedImageError(file.name);
    }

    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await canvasToBlob(canvas);
    if (!blob) {
      throw new UnsupportedImageError(file.name);
    }

    return new File([blob], getCompressedFileName(file.name), {
      type: COMPRESSED_IMAGE_TYPE,
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

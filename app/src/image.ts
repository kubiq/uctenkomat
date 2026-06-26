import { Platform } from "react-native";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import type { PickedFile } from "./types";

const MAX_WIDTH = 1500;
const QUALITY = 0.7;

/**
 * Downscale an image and return base64 JPEG (no data: prefix).
 * Native: expo-image-manipulator. Web/Electron: canvas.
 */
export async function prepareImageBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") return webResizeToBase64(uri);
  const out = await manipulateAsync(uri, [{ resize: { width: MAX_WIDTH } }], {
    compress: QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });
  return out.base64 ?? "";
}

/**
 * Read a picked PDF as base64 (no data: prefix). Unlike images, PDFs are sent
 * to the model as-is — gpt-4o extracts both text and page images itself.
 * Web: the document picker already provides base64; otherwise fetch the blob.
 * Native: read the file off disk.
 */
export async function readPdfBase64(file: PickedFile): Promise<string> {
  if (file.base64) return stripDataPrefix(file.base64);
  if (Platform.OS === "web") {
    const res = await fetch(file.uri);
    const blob = await res.blob();
    return await blobToBase64(blob);
  }
  return await new File(file.uri).base64();
}

function stripDataPrefix(s: string): string {
  const comma = s.indexOf(",");
  return s.startsWith("data:") && comma !== -1 ? s.slice(comma + 1) : s;
}

async function blobToBase64(blob: any): Promise<string> {
  const w = globalThis as any;
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new w.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return stripDataPrefix(dataUrl);
}

// Browser/Electron canvas resize. Uses DOM APIs (cast to any to keep RN tsconfig happy).
async function webResizeToBase64(uri: string): Promise<string> {
  const w = globalThis as any;
  const img: any = await new Promise((resolve, reject) => {
    const i = new w.Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.crossOrigin = "anonymous";
    i.src = uri;
  });
  const scale = Math.min(1, MAX_WIDTH / img.width);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = w.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  const dataUrl: string = canvas.toDataURL("image/jpeg", QUALITY);
  return dataUrl.split(",")[1] ?? "";
}

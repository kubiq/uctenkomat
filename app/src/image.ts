import { Platform } from "react-native";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

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

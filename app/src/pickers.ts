import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { showAlert } from "./ui";
import { t } from "./i18n";

const isWeb = Platform.OS === "web";

/** Take one photo with the camera. Returns its URI, or null when cancelled/denied. */
export async function capturePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    showAlert(t("alerts.permissionDeniedTitle"), t("alerts.cameraDenied"));
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
  return !result.canceled && result.assets?.length ? result.assets[0].uri : null;
}

/** Pick images from the gallery, in selection order. Returns [] when cancelled/denied. */
export async function pickImageUris(multiple: boolean): Promise<string[]> {
  if (!isWeb) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("alerts.permissionDeniedTitle"), t("alerts.photosDenied"));
      return [];
    }
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
    allowsMultipleSelection: multiple,
    orderedSelection: multiple,
  });
  return !result.canceled && result.assets?.length ? result.assets.map((a) => a.uri) : [];
}

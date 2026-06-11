import { Alert, Platform } from "react-native";

// React Native's Alert.alert does nothing on web (RN-Web). Use window.alert there.
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === "web") {
    const w = globalThis as any;
    const text = message ? `${title}\n\n${message}` : title;
    if (typeof w.alert === "function") w.alert(text);
    else console.log(text);
  } else {
    Alert.alert(title, message);
  }
}

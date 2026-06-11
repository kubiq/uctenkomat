import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Current on-screen keyboard height (0 when closed). Used as dynamic bottom
 * padding so inputs can scroll above the keyboard without leaving dead space
 * when it's closed. No-op on web/desktop (no virtual keyboard).
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

// A safe minimum so the bottom controls always clear the keyboard, even when
// Android (edge-to-edge) under-reports the keyboard height.
const MIN_INSET = 340;

/**
 * Bottom inset to apply while the on-screen keyboard is open (0 when closed),
 * so inputs and the buttons below them can scroll above the keyboard without
 * leaving dead space when it's closed. No-op on web/desktop.
 */
export function useKeyboardHeight(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, (e) =>
      setInset(Math.max(e.endCoordinates?.height ?? 0, MIN_INSET)),
    );
    const hide = Keyboard.addListener(hideEvt, () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return inset;
}

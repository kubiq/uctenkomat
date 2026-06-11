import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

// Native: auto-scrolls the focused input above the keyboard (handles edge-to-edge).
export function KbScroll({
  style,
  contentContainerStyle,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <KeyboardAwareScrollView
      style={style}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      bottomOffset={20}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

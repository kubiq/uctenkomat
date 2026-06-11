import type { ReactNode } from "react";
import { ScrollView, type StyleProp, type ViewStyle } from "react-native";

// Web/desktop: no virtual keyboard — a plain ScrollView (keeps the native lib out of the web bundle).
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
    <ScrollView style={style} contentContainerStyle={contentContainerStyle} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

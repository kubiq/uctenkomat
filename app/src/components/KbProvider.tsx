import type { ReactNode } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";

export function KbProvider({ children }: { children: ReactNode }) {
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

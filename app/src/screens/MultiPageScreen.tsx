import { useEffect, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { capturePhoto, pickImageUris } from "../pickers";
import { useI18n } from "../i18n";
import type { PickedFile } from "../types";

type Props = {
  onDone: (file: PickedFile) => void;
  onBack: () => void;
};

const isWeb = Platform.OS === "web";

// Collects several photos of one long receipt (top to bottom) and hands them on
// as a single multi-page file, read by the model as one receipt.
export default function MultiPageScreen({ onDone, onBack }: Props) {
  const { t } = useI18n();
  const [pages, setPages] = useState<string[]>([]);

  async function addPhoto() {
    const uri = await capturePhoto();
    if (uri) setPages((p) => [...p, uri]);
  }

  async function addFromGallery() {
    const uris = await pickImageUris(true);
    if (uris.length) setPages((p) => [...p, ...uris]);
  }

  // On a phone, open the camera straight away for the first page.
  useEffect(() => {
    if (!isWeb) addPhoto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function remove(index: number) {
    setPages((p) => p.filter((_, i) => i !== index));
  }

  function done() {
    if (pages.length === 0) return;
    onDone({ uri: pages[0], isPdf: false, pages });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>{t("common.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("multiPage.title")}</Text>
        <View style={{ width: 50 }} />
      </View>
      <Text style={styles.muted}>{t("multiPage.hint")}</Text>

      <View style={styles.grid}>
        {pages.map((uri, i) => (
          <View key={`${uri}-${i}`} style={styles.page}>
            <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
            <View style={styles.pageBar}>
              <Text style={styles.pageNo}>{t("multiPage.page", { n: i + 1 })}</Text>
              <Pressable onPress={() => remove(i)} hitSlop={8}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
      {pages.length === 0 && <Text style={styles.empty}>{t("multiPage.empty")}</Text>}

      <View style={styles.actions}>
        {!isWeb && (
          <Pressable style={styles.secondary} onPress={addPhoto}>
            <Text style={styles.secondaryText}>
              {pages.length === 0 ? t("multiPage.takeFirst") : t("multiPage.takeNext")}
            </Text>
          </Pressable>
        )}
        <Pressable style={styles.secondary} onPress={addFromGallery}>
          <Text style={styles.secondaryText}>{t("multiPage.addFromGallery")}</Text>
        </Pressable>
        <Pressable
          style={[styles.submit, pages.length === 0 && styles.submitDisabled]}
          onPress={done}
          disabled={pages.length === 0}
        >
          <Text style={styles.submitText}>{t("multiPage.read", { count: pages.length })}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingTop: 56 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  back: { color: "#2563eb", fontSize: 16 },
  title: { fontSize: 20, fontWeight: "700" },
  muted: { color: "#64748b" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 },
  page: { width: 128, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, overflow: "hidden" },
  thumb: { width: "100%", height: 170, backgroundColor: "#f1f5f9" },
  pageBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 6 },
  pageNo: { fontWeight: "600", color: "#0f172a" },
  remove: { color: "#dc2626", fontSize: 16 },
  empty: { color: "#94a3b8", textAlign: "center", marginVertical: 24 },
  actions: { gap: 12, marginTop: 24 },
  secondary: { borderWidth: 1.5, borderColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  secondaryText: { color: "#2563eb", fontSize: 16, fontWeight: "600" },
  submit: { backgroundColor: "#16a34a", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});

import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { CreatedExpense } from "../types";

type Props = { count: number; expense: CreatedExpense | null; onNew: () => void };

export default function SuccessScreen({ count, expense, onNew }: Props) {
  const multiple = count > 1;
  return (
    <View style={styles.container}>
      <Text style={styles.check}>✓</Text>
      <Text style={styles.title}>{multiple ? `${count} expenses created` : "Expense created"}</Text>
      {!multiple && expense && (
        <Text style={styles.muted}>
          #{expense.id}
          {expense.number ? ` · ${expense.number}` : ""}
        </Text>
      )}

      {!multiple && expense?.url && (
        <Pressable style={styles.link} onPress={() => Linking.openURL(expense.url!)}>
          <Text style={styles.linkText}>Open in Fakturoid</Text>
        </Pressable>
      )}
      <Pressable style={styles.primary} onPress={onNew}>
        <Text style={styles.primaryText}>Scan more receipts</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12, backgroundColor: "#fff" },
  check: { fontSize: 64, color: "#16a34a" },
  title: { fontSize: 24, fontWeight: "700" },
  muted: { color: "#64748b" },
  link: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, borderWidth: 1, borderColor: "#2563eb" },
  linkText: { color: "#2563eb", fontSize: 16, fontWeight: "600" },
  primary: { marginTop: 8, backgroundColor: "#2563eb", paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12 },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});

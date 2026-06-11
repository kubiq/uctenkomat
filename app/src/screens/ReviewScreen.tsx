import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { createExpense, searchSubjects } from "../fakturoid";
import { showAlert } from "../ui";
import type { CreatedExpense, Receipt, Settings, Subject } from "../types";

type Props = {
  settings: Settings;
  initial: Receipt;
  onDone: (expense: CreatedExpense) => void;
  onBack: () => void;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

export default function ReviewScreen({ settings, initial, onDone, onBack }: Props) {
  const [receipt, setReceipt] = useState<Receipt>(initial);
  const [override, setOverride] = useState<Subject | null>(null); // manual supplier override
  const [query, setQuery] = useState(initial.supplier_name ?? initial.merchant ?? "");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const lineSum = useMemo(
    () => round2(receipt.items.reduce((acc, it) => acc + (it.total_price || 0), 0)),
    [receipt.items],
  );
  const totalMismatch = receipt.total != null && Math.abs(lineSum - receipt.total) > 0.5;

  // VAT recap reconciliation (mirrors the server-side check).
  const recapTotal = useMemo(
    () => round2(receipt.vat_summary.reduce((a, v) => a + v.base + v.vat, 0)),
    [receipt.vat_summary],
  );
  const recapMismatch =
    receipt.vat_summary.length > 0 && receipt.total != null && Math.abs(recapTotal - receipt.total) > 0.05;

  const ico = (receipt.supplier_ico ?? "").replace(/\D/g, "");

  function updateItem(i: number, patch: Partial<Receipt["items"][number]>) {
    setReceipt((r) => ({ ...r, items: r.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));
  }
  function removeItem(i: number) {
    setReceipt((r) => ({ ...r, items: r.items.filter((_, idx) => idx !== i) }));
  }

  async function doSearch() {
    setSearching(true);
    try {
      setSubjects(await searchSubjects(settings, query));
    } catch (e: any) {
      showAlert("Search failed", e?.message ?? String(e));
    } finally {
      setSearching(false);
    }
  }

  async function submit() {
    if (receipt.items.length === 0) {
      showAlert("No items", "Add at least one line item.");
      return;
    }
    if (!override && !ico) {
      showAlert(
        "No supplier",
        "No IČO was extracted, so the supplier can't be auto-matched. Pick a supplier manually.",
      );
      setShowSearch(true);
      return;
    }
    setSubmitting(true);
    try {
      // Omit subjectId -> resolve by IČO; include it only when overriding.
      const expense = await createExpense(settings, receipt, { subjectId: override?.id });
      onDone(expense);
    } catch (e: any) {
      showAlert("Could not create expense", e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Review</Text>
        <View style={{ width: 48 }} />
      </View>

      {/* Header fields */}
      <Text style={styles.label}>Merchant</Text>
      <TextInput
        style={styles.input}
        value={receipt.merchant ?? ""}
        onChangeText={(t) => setReceipt((r) => ({ ...r, merchant: t }))}
      />
      <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={receipt.date ?? ""}
        onChangeText={(t) => setReceipt((r) => ({ ...r, date: t }))}
        placeholder="2026-06-10"
      />

      {/* Supplier — auto by IČO, with manual override */}
      <Text style={styles.section}>Supplier</Text>
      {override ? (
        <View style={styles.supplierBox}>
          <Text style={styles.supplierName}>{override.name}</Text>
          <Text style={styles.muted}>Manual override · #{override.id}</Text>
          <Pressable onPress={() => setOverride(null)} hitSlop={8}>
            <Text style={styles.link}>Use auto-match instead</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.supplierBox}>
          <Text style={styles.supplierName}>{receipt.supplier_name ?? receipt.merchant ?? "—"}</Text>
          <Text style={styles.muted}>
            {ico ? `Auto-match by IČO ${ico}` : "⚠ no IČO extracted — pick a supplier manually"}
            {receipt.supplier_dic ? ` · ${receipt.supplier_dic}` : ""}
          </Text>
          <Pressable onPress={() => setShowSearch((s) => !s)} hitSlop={8}>
            <Text style={styles.link}>{showSearch ? "Hide search" : "Override supplier…"}</Text>
          </Pressable>
        </View>
      )}

      {showSearch && !override && (
        <>
          <View style={styles.searchRow}>
            <TextInput style={[styles.input, { flex: 1 }]} value={query} onChangeText={setQuery} placeholder="Search…" />
            <Pressable style={styles.searchBtn} onPress={doSearch}>
              <Text style={styles.searchBtnText}>{searching ? "…" : "Search"}</Text>
            </Pressable>
          </View>
          {subjects.map((s) => (
            <Pressable
              key={s.id}
              style={styles.subjectRow}
              onPress={() => {
                setOverride(s);
                setShowSearch(false);
              }}
            >
              <Text style={styles.subjectName}>{s.name}</Text>
              {(s.vat_no || s.registration_no) && <Text style={styles.muted}>{s.vat_no ?? s.registration_no}</Text>}
            </Pressable>
          ))}
        </>
      )}

      {/* Items — per-line VAT */}
      <Text style={styles.section}>Items</Text>
      {receipt.items.map((it, i) => (
        <View key={i} style={styles.itemCard}>
          <View style={styles.itemTop}>
            <TextInput style={[styles.input, { flex: 1 }]} value={it.name} onChangeText={(t) => updateItem(i, { name: t })} />
            <Pressable onPress={() => removeItem(i)} hitSlop={10}>
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.itemNums}>
            <NumField label="Qty" value={it.quantity} onChange={(n) => updateItem(i, { quantity: n })} />
            <NumField label="Unit" value={it.unit_price} onChange={(n) => updateItem(i, { unit_price: n })} />
            <NumField label="Total" value={it.total_price} onChange={(n) => updateItem(i, { total_price: n ?? 0 })} />
            <NumField label="VAT %" value={it.vat_rate} onChange={(n) => updateItem(i, { vat_rate: n })} />
          </View>
        </View>
      ))}

      {/* Reconciliation */}
      <View style={styles.totalRow}>
        <Text style={styles.muted}>Lines: {lineSum.toFixed(2)} {receipt.currency ?? ""}</Text>
        <Text style={styles.muted}>Receipt: {receipt.total?.toFixed(2) ?? "—"}</Text>
      </View>
      {totalMismatch && <Text style={styles.warn}>⚠ Line sum differs from the receipt total — check items.</Text>}
      {recapMismatch && (
        <Text style={styles.warn}>
          ⚠ VAT recap ({recapTotal.toFixed(2)}) doesn't reconcile with the total — a number may be misread.
        </Text>
      )}

      <Pressable style={styles.submit} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Create expense in Fakturoid</Text>}
      </Pressable>
    </ScrollView>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <View style={styles.numField}>
      <Text style={styles.smallLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={value?.toString() ?? ""}
        onChangeText={(t) => onChange(num(t))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 56, backgroundColor: "#fff" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  back: { color: "#2563eb", fontSize: 16 },
  title: { fontSize: 20, fontWeight: "700" },
  label: { fontSize: 13, color: "#475569", marginTop: 12, marginBottom: 4 },
  section: { fontSize: 16, fontWeight: "700", marginTop: 22, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, backgroundColor: "#fff", color: "#0f172a" },
  supplierBox: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 12, gap: 4 },
  supplierName: { fontSize: 15, fontWeight: "600" },
  link: { color: "#2563eb", marginTop: 4 },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 10 },
  searchBtn: { backgroundColor: "#334155", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  searchBtnText: { color: "#fff", fontWeight: "600" },
  subjectRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  subjectName: { fontSize: 15 },
  itemCard: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 10, marginBottom: 10 },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  remove: { color: "#dc2626", fontSize: 18, paddingHorizontal: 4 },
  itemNums: { flexDirection: "row", gap: 6, marginTop: 8 },
  numField: { flex: 1 },
  smallLabel: { fontSize: 11, color: "#64748b", marginBottom: 2 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  muted: { color: "#64748b" },
  warn: { color: "#b45309", marginTop: 6 },
  submit: { backgroundColor: "#16a34a", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 28 },
  submitText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});

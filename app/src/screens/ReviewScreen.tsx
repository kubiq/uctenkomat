import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getProvider, providerCreds } from "../accounting";
import { useKeyboardHeight } from "../keyboard";
import { showAlert, confirmDialog } from "../ui";
import { useI18n } from "../i18n";
import { vatDeductionAtRisk, SIMPLIFIED_DOC_LIMIT_CZK } from "../vat";
import type { CreatedExpense, Receipt, Settings, Subject } from "../types";

type Props = {
  settings: Settings;
  initial: Receipt;
  attachment?: { data_url: string; filename?: string } | null;
  recentTags?: string[];
  onUsedTags?: (tags: string[]) => void;
  onDone: (expense: CreatedExpense) => void;
  onBack: () => void;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

export default function ReviewScreen({
  settings,
  initial,
  attachment,
  recentTags = [],
  onUsedTags,
  onDone,
  onBack,
}: Props) {
  const { t } = useI18n();
  // Fall back to the supplier name when no merchant/trade name was extracted (e.g. invoices).
  const [receipt, setReceipt] = useState<Receipt>(() => ({
    ...initial,
    merchant: initial.merchant ?? initial.supplier_name ?? null,
  }));
  const [override, setOverride] = useState<Subject | null>(null); // manual supplier override
  const [query, setQuery] = useState(initial.supplier_name ?? initial.merchant ?? "");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [markPaid, setMarkPaid] = useState(true); // receipts are paid at the till
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [duplicate, setDuplicate] = useState<CreatedExpense | null>(null); // already in the accounting system

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
  const dic = (receipt.supplier_dic ?? "").replace(/[^A-Za-z0-9]/g, "");
  const provider = getProvider(settings.provider);
  const creds = providerCreds(settings);
  const kb = useKeyboardHeight();

  // On open, check whether this receipt is already saved (best-effort; a failure
  // just skips the warning). Runs once — the identifiers come from the parse.
  useEffect(() => {
    if (!provider.findDuplicate) return;
    let cancelled = false;
    provider
      .findDuplicate(creds, initial)
      .then((d) => !cancelled && setDuplicate(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dupLabel = duplicate ? (duplicate.number ?? `#${duplicate.id}`) : "";

  function updateItem(i: number, patch: Partial<Receipt["items"][number]>) {
    setReceipt((r) => ({ ...r, items: r.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));
  }
  function removeItem(i: number) {
    setReceipt((r) => ({ ...r, items: r.items.filter((_, idx) => idx !== i) }));
  }

  function addTag(raw: string) {
    const t = raw.trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTagInput("");
  }
  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }
  const tagSuggestions = recentTags.filter((t) => !tags.includes(t)).slice(0, 8);

  async function doSearch() {
    setSearching(true);
    try {
      setSubjects(await provider.searchSubjects(creds, query));
    } catch (e: any) {
      showAlert(t("alerts.searchFailed"), e?.message ?? String(e));
    } finally {
      setSearching(false);
    }
  }

  async function submit() {
    if (receipt.items.length === 0) {
      showAlert(t("alerts.noItemsTitle"), t("alerts.noItemsMsg"));
      return;
    }
    if (duplicate) {
      const go = await confirmDialog(
        t("alerts.duplicateTitle"),
        t("alerts.duplicateMsg", { provider: provider.label, number: dupLabel }),
        t("alerts.duplicateConfirm"),
        t("common.cancel"),
      );
      if (!go) return;
    }
    if (!override && !ico && !dic) {
      showAlert(t("alerts.noSupplierTitle"), t("alerts.noSupplierMsg"));
      setShowSearch(true);
      return;
    }
    setSubmitting(true);
    try {
      // Omit subjectId -> resolve by IČO/DIČ/name; include it only when overriding.
      const cleanTags = provider.supportsTags ? tags : [];
      const expense = await provider.createExpense(creds, receipt, {
        subjectId: override?.id,
        tags: cleanTags,
        attachment: attachment ?? undefined,
        markPaid,
      });
      if (cleanTags.length) onUsedTags?.(cleanTags);
      // Warn once the expense exists: a receipt over the simplified-document limit
      // without your IČO/DIČ on it isn't valid for VAT deduction.
      if (vatDeductionAtRisk(receipt, { ico: settings.ico, vatId: settings.vatId })) {
        showAlert(
          t("alerts.vatRiskTitle"),
          t("alerts.vatRiskMsg", { limit: SIMPLIFIED_DOC_LIMIT_CZK.toLocaleString("cs-CZ") }),
        );
      }
      onDone(expense);
    } catch (e: any) {
      showAlert(t("alerts.createFailedTitle"), e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: 24 + kb }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>{t("common.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("review.title")}</Text>
        <View style={{ width: 48 }} />
      </View>

      {duplicate && (
        <View style={styles.dupBanner}>
          <Text style={styles.dupBannerText}>{t("review.duplicateBanner", { provider: provider.label, number: dupLabel })}</Text>
          {duplicate.url && (
            <Pressable onPress={() => Linking.openURL(duplicate.url!)} hitSlop={8}>
              <Text style={styles.dupBannerLink}>{t("review.openExisting")}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Header fields */}
      <Text style={styles.label}>{t("review.merchant")}</Text>
      <TextInput
        style={styles.input}
        value={receipt.merchant ?? ""}
        onChangeText={(v) => setReceipt((r) => ({ ...r, merchant: v }))}
      />
      <Text style={styles.label}>{t("review.date")}</Text>
      <TextInput
        style={styles.input}
        value={receipt.date ?? ""}
        onChangeText={(v) => setReceipt((r) => ({ ...r, date: v }))}
        placeholder={t("review.datePlaceholder")}
      />
      <Text style={styles.label}>{t("review.docNo")}</Text>
      <TextInput
        style={styles.input}
        value={receipt.doc_number ?? ""}
        onChangeText={(v) => setReceipt((r) => ({ ...r, doc_number: v }))}
        placeholder={t("review.docPlaceholder")}
      />

      {/* Supplier — auto by IČO, with manual override */}
      <Text style={styles.section}>{t("review.supplier")}</Text>
      {override ? (
        <View style={styles.supplierBox}>
          <Text style={styles.supplierName}>{override.name}</Text>
          <Text style={styles.muted}>{t("review.manualOverride", { id: override.id })}</Text>
          <Pressable onPress={() => setOverride(null)} hitSlop={8}>
            <Text style={styles.link}>{t("review.useAutoMatch")}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.supplierBox}>
          <Text style={styles.supplierName}>{receipt.supplier_name ?? receipt.merchant ?? "—"}</Text>
          <Text style={styles.muted}>
            {ico
              ? receipt.supplier_dic
                ? t("review.autoByIcoDic", { ico, dic: receipt.supplier_dic })
                : t("review.autoByIco", { ico })
              : dic
                ? t("review.autoByDic", { dic: receipt.supplier_dic })
                : t("review.noIdWarn")}
          </Text>
          <Pressable onPress={() => setShowSearch((s) => !s)} hitSlop={8}>
            <Text style={styles.link}>{showSearch ? t("review.hideSearch") : t("review.overrideSupplier")}</Text>
          </Pressable>
        </View>
      )}

      {showSearch && !override && (
        <>
          <View style={styles.searchRow}>
            <TextInput style={[styles.input, { flex: 1 }]} value={query} onChangeText={setQuery} placeholder={t("review.searchPlaceholder")} />
            <Pressable style={styles.searchBtn} onPress={doSearch}>
              <Text style={styles.searchBtnText}>{searching ? "…" : t("common.search")}</Text>
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
      <Text style={styles.section}>{t("review.items")}</Text>
      {receipt.items.map((it, i) => (
        <View key={i} style={styles.itemCard}>
          <View style={styles.itemTop}>
            <TextInput style={[styles.input, { flex: 1 }]} value={it.name} onChangeText={(v) => updateItem(i, { name: v })} />
            <Pressable onPress={() => removeItem(i)} hitSlop={10}>
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.itemNums}>
            <NumField label={t("review.qty")} value={it.quantity} onChange={(n) => updateItem(i, { quantity: n })} />
            <NumField label={t("review.unit")} value={it.unit_price} onChange={(n) => updateItem(i, { unit_price: n })} />
            <NumField label={t("review.total")} value={it.total_price} onChange={(n) => updateItem(i, { total_price: n ?? 0 })} />
            <NumField label={t("review.vatPct")} value={it.vat_rate} onChange={(n) => updateItem(i, { vat_rate: n })} />
          </View>
        </View>
      ))}

      {/* Reconciliation */}
      <View style={styles.totalRow}>
        <Text style={styles.muted}>{t("review.lines", { sum: lineSum.toFixed(2), currency: receipt.currency ?? "" })}</Text>
        <Text style={styles.muted}>{t("review.receipt", { total: receipt.total?.toFixed(2) ?? "—" })}</Text>
      </View>
      {totalMismatch && <Text style={styles.warn}>{t("review.totalMismatch")}</Text>}
      {recapMismatch && (
        <Text style={styles.warn}>{t("review.vatMismatch", { recap: recapTotal.toFixed(2) })}</Text>
      )}

      {/* Tags — captured here, used for filtering/reporting in the accounting system */}
      {provider.supportsTags && (
        <>
          <Text style={styles.section}>{t("review.tags")}</Text>
          {tags.length > 0 && (
            <View style={styles.tagWrap}>
              {tags.map((tag) => (
                <Pressable key={tag} style={styles.tagChip} onPress={() => removeTag(tag)} hitSlop={6}>
                  <Text style={styles.tagChipText}>{tag}</Text>
                  <Text style={styles.tagChipX}>✕</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={tagInput}
              onChangeText={setTagInput}
              placeholder={t("review.addTagPlaceholder")}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={() => addTag(tagInput)}
            />
            <Pressable style={styles.searchBtn} onPress={() => addTag(tagInput)}>
              <Text style={styles.searchBtnText}>{t("common.add")}</Text>
            </Pressable>
          </View>
          {tagSuggestions.length > 0 && (
            <View style={styles.tagWrap}>
              {tagSuggestions.map((tag) => (
                <Pressable key={tag} style={styles.tagSuggest} onPress={() => addTag(tag)} hitSlop={6}>
                  <Text style={styles.tagSuggestText}>+ {tag}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}

      {/* Options */}
      <Pressable style={styles.toggleRow} onPress={() => setMarkPaid((v) => !v)} hitSlop={6}>
        <View style={[styles.checkbox, markPaid && styles.checkboxOn]}>{markPaid && <Text style={styles.checkboxTick}>✓</Text>}</View>
        <Text style={styles.toggleLabel}>{t("review.markPaid")}</Text>
      </Pressable>
      {attachment && <Text style={styles.muted}>{t("review.attachmentNote")}</Text>}

      <Pressable style={styles.submit} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t("review.createExpense", { provider: provider.label })}</Text>}
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
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingTop: 56 },
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
  dupBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, backgroundColor: "#fef3c7", borderColor: "#f59e0b", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  dupBannerText: { color: "#92400e", flex: 1, fontWeight: "600" },
  dupBannerLink: { color: "#2563eb", fontWeight: "700" },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  tagChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#dbeafe", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  tagChipText: { color: "#1e3a8a", fontWeight: "600" },
  tagChipX: { color: "#1e3a8a", fontSize: 12 },
  tagSuggest: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  tagSuggestText: { color: "#475569" },
  submit: { backgroundColor: "#16a34a", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 28 },
  submitText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 24 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  checkboxTick: { color: "#fff", fontSize: 14, fontWeight: "800" },
  toggleLabel: { fontSize: 15, color: "#0f172a" },
});

import type { Attachment, CreatedExpense, ProviderId, Receipt, Subject } from "../types";

// One credential input the Settings screen renders for a provider.
// `label` and `placeholder` are i18n keys, translated by SettingsScreen.
export type CredentialField = {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  hint?: string;
};

// A flat per-provider credentials object: { [field.key]: value }.
export type Creds = Record<string, string>;

// Options for createExpense. Providers ignore fields they don't support.
export type CreateExpenseOpts = {
  subjectId?: number;
  tags?: string[];
  /** Original receipt file(s) to attach — one per page of a multi-photo receipt. */
  attachments?: Attachment[];
  /** Mark the expense as paid (paid on its issue date). */
  markPaid?: boolean;
};

export interface AccountingProvider {
  id: ProviderId;
  label: string;
  /** i18n key for the "where to create the API app" hint shown in Settings. */
  setupHint: string;
  credentialFields: CredentialField[];

  /** Whether opts.tags are sent through to the created expense. */
  supportsTags?: boolean;

  /** Validate credentials cheaply (used by the Settings "Test connection"). */
  check(creds: Creds): Promise<boolean>;

  /** Search suppliers/contacts for the review screen's manual override. */
  searchSubjects(creds: Creds, query: string): Promise<Subject[]>;

  /**
   * Look for an already-saved expense matching this receipt (same supplier +
   * document number, or date + total), so the user can avoid creating a
   * duplicate. Optional: providers that can't check this omit it. Returns the
   * existing expense, or null when none is found.
   */
  findDuplicate?(creds: Creds, receipt: Receipt): Promise<CreatedExpense | null>;

  /**
   * Create the expense. When opts.subjectId is omitted, resolve the supplier
   * from the receipt's IČO (create it if missing). opts.tags is honoured only
   * when supportsTags is true; other providers ignore it.
   */
  createExpense(creds: Creds, receipt: Receipt, opts: CreateExpenseOpts): Promise<CreatedExpense>;
}

import type { CreatedExpense, ProviderId, Receipt, Subject } from "../types";

// One credential input the Settings screen renders for a provider.
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
  /** Original receipt file to attach to the expense (data URL + name). */
  attachment?: { data_url: string; filename?: string };
  /** Mark the expense as paid (paid on its issue date). */
  markPaid?: boolean;
};

export interface AccountingProvider {
  id: ProviderId;
  label: string;
  /** Where to create the API app, shown as a hint in Settings. */
  setupHint: string;
  credentialFields: CredentialField[];

  /** Whether opts.tags are sent through to the created expense. */
  supportsTags?: boolean;

  /** Validate credentials cheaply (used by the Settings "Test connection"). */
  check(creds: Creds): Promise<boolean>;

  /** Search suppliers/contacts for the review screen's manual override. */
  searchSubjects(creds: Creds, query: string): Promise<Subject[]>;

  /**
   * Create the expense. When opts.subjectId is omitted, resolve the supplier
   * from the receipt's IČO (create it if missing). opts.tags is honoured only
   * when supportsTags is true; other providers ignore it.
   */
  createExpense(creds: Creds, receipt: Receipt, opts: CreateExpenseOpts): Promise<CreatedExpense>;
}

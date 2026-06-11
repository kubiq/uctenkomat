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

export interface AccountingProvider {
  id: ProviderId;
  label: string;
  /** Where to create the API app, shown as a hint in Settings. */
  setupHint: string;
  credentialFields: CredentialField[];

  /** Validate credentials cheaply (used by the Settings "Test connection"). */
  check(creds: Creds): Promise<boolean>;

  /** Search suppliers/contacts for the review screen's manual override. */
  searchSubjects(creds: Creds, query: string): Promise<Subject[]>;

  /**
   * Create the expense. When opts.subjectId is omitted, resolve the supplier
   * from the receipt's IČO (create it if missing).
   */
  createExpense(creds: Creds, receipt: Receipt, opts: { subjectId?: number }): Promise<CreatedExpense>;
}

export type Profile = { id: string; name: string };
export type Vault = {
  id: string; name: string; invite_code: string; currency: string;
  savings_goal: number; monthly_target: number; reminder_day: number;
};
export type Me = { profile: Profile; vault: Vault | null; partner: Profile | null };
export type Member = { id: string; name: string; total: number; thisMonth: number; owed: number };
export type Summary = {
  vault: Vault; totalDeposited: number; loanedOut: number; available: number; members: Member[];
};
export type Contribution = { id: string; user_id: string; amount: number; note: string | null; created_at: string };
export type Loan = {
  id: string; borrower_id: string; amount: number; repaid: number;
  purpose: string | null; status: 'active' | 'repaid'; created_at: string;
};
export type ActivityItem = { id: string; type: string; amount: number | null; message: string; created_at: string };
export type Notif = { id: string; type: 'reminder' | 'partner'; title: string; body: string; read: boolean; created_at: string };

import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { Loan, Summary } from '../types';
import { Button, Card, ConfirmModal, ErrorText, Input, Screen, StatusModal, SwipeableItem, T, money, useLoad } from '../ui';

/**
 * DuoSave Official Loan Rules Profit Charges:
 * - RWF 0 – 5,000: no profit charge (0)
 * - RWF 5,001 – 14,000: RWF 1,500 profit charge
 * - RWF 14,001 – 22,000: RWF 3,000 profit charge
 * - RWF 22,001 – 35,000: RWF 4,000 profit charge
 * - RWF 35,001 – 50,000: RWF 5,000 profit charge
 * - Above RWF 50,000: RWF 6,500 profit charge
 */
export function calculateProfitCharge(principal: number): number {
  if (principal <= 5000) return 0;
  if (principal <= 14000) return 1500;
  if (principal <= 22000) return 3000;
  if (principal <= 35000) return 4000;
  if (principal <= 50000) return 5000;
  return 6500;
}

export default function LoansScreen() {
  const { c } = useTheme();
  const { me } = useAuth();
  const { data, loading, error, reload } = useLoad(async () => {
    const [summary, loans] = await Promise.all([
      api.get<Summary>('/vault/summary'),
      api.get<Loan[]>('/loans'),
    ]);
    return { summary, loans };
  });

  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [repay, setRepay] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRules, setShowRules] = useState(false);

  // Modern Confirmation Modal state
  const [confirmConfig, setConfirmConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    icon?: keyof typeof Ionicons.glyphMap;
    confirmLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Modern Status Modal State
  const [statusConfig, setStatusConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'success' | 'error' | 'info';
  }>({
    visible: false,
    title: '',
    message: '',
  });

  // Auto-refresh loans every 10 seconds to detect partner approvals or requests
  useEffect(() => {
    const interval = setInterval(() => {
      reload().catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const cur = data?.summary.vault.currency ?? 'RWF';
  const isVaultOwner = (me?.profile.email?.toLowerCase() === 'stevenmwizerwa1@gmail.com') || !!me?.isAdmin;
  const nameOf = (id: string, fallback?: string) =>
    data?.summary.members.find((m) => m.id === id)?.name ?? fallback ?? 'Partner';

  // Real-time calculation based on group rules
  const enteredAmount = parseFloat(amount.replace(',', '.')) || 0;
  const calculatedFee = enteredAmount > 0 ? calculateProfitCharge(enteredAmount) : 0;
  const totalRepayDue = enteredAmount + calculatedFee;

  // Unpaid loan rule check: A member with unpaid loan > 50,000 may not take another loan unless emergency
  const myActiveLoans = (data?.loans ?? []).filter((l) => l.status === 'active' && l.borrower_id === me?.profile.id);
  const myUnpaidBalance = myActiveLoans.reduce((sum, l) => sum + (Number(l.amount) - Number(l.repaid)), 0);
  const isEmergency = purpose.toLowerCase().includes('emergency') || purpose.toLowerCase().includes('urgent');
  const exceeds50kLimit = myUnpaidBalance > 50000 && !isEmergency;

  const requestLoan = () => {
    const n = parseFloat(amount.replace(',', '.'));
    if (!(n > 0)) { setErr('Enter an amount greater than 0'); return; }

    if (exceeds50kLimit) {
      setErr(`Rule Restriction: You have an unpaid loan balance of ${money(myUnpaidBalance, cur)}. Rules forbid additional loans above 50,000 RWF unless it is a serious emergency.`);
      return;
    }

    const available = data?.summary.available ?? 0;
    if (n > available) {
      setErr(`Requested amount exceeds available vault savings (${money(available, cur)})`);
      return;
    }

    const fee = calculateProfitCharge(n);
    const totalDue = n + fee;

    setConfirmConfig({
      visible: true,
      title: 'Submit Loan Request?',
      message: `Principal: ${money(n, cur)}\nRule Profit Charge: ${fee > 0 ? `+${money(fee, cur)}` : 'RWF 0'}\nTotal to Repay: ${money(totalDue, cur)}\n\nYour partner will be notified to review and approve this loan before funds are disbursed.`,
      icon: 'hourglass-outline',
      confirmLabel: 'Submit Request',
      isDestructive: false,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        setBusy(true); setErr(null);
        try {
          await api.post('/loans', { amount: n, purpose: purpose || undefined });
          setAmount(''); setPurpose('');
          await reload();
          setStatusConfig({
            visible: true,
            title: 'Request Sent',
            message: `Your loan request for ${money(n, cur)} (Total repayment: ${money(totalDue, cur)}) was submitted! Your partner has been notified to approve it.`,
            type: 'success',
          });
        } catch (e: any) {
          setErr(e.message);
        }
        setBusy(false);
      },
    });
  };

  const handleApproveLoan = (loan: Loan) => {
    const requesterName = nameOf(loan.borrower_id, loan.requester_name);
    setConfirmConfig({
      visible: true,
      title: 'Approve Loan Request?',
      message: `Are you sure you want to approve ${requesterName}'s loan for ${money(Number(loan.amount), cur)}? This amount will be disbursed and deducted from available vault savings.`,
      icon: 'checkmark-circle-outline',
      confirmLabel: 'Approve & Release Funds',
      isDestructive: false,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        setBusy(true);
        try {
          await api.post(`/loans/${loan.id}/approve`);
          await reload();
          setStatusConfig({
            visible: true,
            title: 'Loan Approved',
            message: `You approved ${requesterName}'s loan of ${money(Number(loan.amount), cur)}.`,
            type: 'success',
          });
        } catch (e: any) {
          setStatusConfig({
            visible: true,
            title: 'Approval Error',
            message: e.message,
            type: 'error',
          });
        }
        setBusy(false);
      },
    });
  };

  const handleRejectLoan = (loan: Loan) => {
    const requesterName = nameOf(loan.borrower_id, loan.requester_name);
    setConfirmConfig({
      visible: true,
      title: 'Decline Loan Request?',
      message: `Are you sure you want to decline ${requesterName}'s loan request of ${money(Number(loan.amount), cur)}?`,
      icon: 'close-circle-outline',
      confirmLabel: 'Decline Loan',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        setBusy(true);
        try {
          await api.post(`/loans/${loan.id}/reject`);
          await reload();
          setStatusConfig({
            visible: true,
            title: 'Loan Declined',
            message: `You declined ${requesterName}'s loan request.`,
            type: 'info',
          });
        } catch (e: any) {
          setStatusConfig({
            visible: true,
            title: 'Error',
            message: e.message,
            type: 'error',
          });
        }
        setBusy(false);
      },
    });
  };

  const handleCancelMyRequest = (loan: Loan) => {
    setConfirmConfig({
      visible: true,
      title: 'Cancel Your Request?',
      message: `Do you want to cancel your pending loan request for ${money(Number(loan.amount), cur)}?`,
      icon: 'close-outline',
      confirmLabel: 'Cancel Request',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        setBusy(true);
        try {
          await api.post(`/loans/${loan.id}/cancel`);
          await reload();
          setStatusConfig({
            visible: true,
            title: 'Request Cancelled',
            message: 'Your loan request has been cancelled.',
            type: 'info',
          });
        } catch (e: any) {
          setStatusConfig({
            visible: true,
            title: 'Error',
            message: e.message,
            type: 'error',
          });
        }
        setBusy(false);
      },
    });
  };

  const pay = async (id: string) => {
    const n = parseFloat((repay[id] ?? '').replace(',', '.'));
    if (!(n > 0)) { setErr('Enter a repayment amount'); return; }
    setErr(null);
    try {
      await api.post(`/loans/${id}/repay`, { amount: n });
      setRepay({ ...repay, [id]: '' });
      await reload();
      setStatusConfig({
        visible: true,
        title: 'Repayment Recorded',
        message: `Successfully repaid ${money(n, cur)} back to the vault!`,
        type: 'success',
      });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const confirmDeleteLoan = (id: string, loanAmount: number | string) => {
    setConfirmConfig({
      visible: true,
      title: 'Delete Loan Record?',
      message: `Are you sure you want to remove this loan of ${money(Number(loanAmount), cur)}? The available vault balance will be updated immediately.`,
      icon: 'trash-outline',
      confirmLabel: 'Delete Loan',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        setErr(null);
        try {
          await api.delete(`/loans/${id}`);
          await reload();
        } catch (e: any) {
          setErr(e.message);
        }
      },
    });
  };

  const allLoans = data?.loans ?? [];
  const pendingApprovalsForMe = allLoans.filter((l) => l.status === 'pending' && l.borrower_id !== me?.profile.id);
  const myPendingRequests = allLoans.filter((l) => l.status === 'pending' && l.borrower_id === me?.profile.id);
  const activeLoans = allLoans.filter((l) => l.status === 'active');
  const pastLoans = allLoans.filter((l) => l.status === 'repaid' || l.status === 'rejected');

  return (
    <Screen title="Loans & Approvals" onRefresh={reload} refreshing={loading}>
      <ErrorText msg={error} />
      {data && (
        <Card>
          <T muted size={12}>Available to borrow</T>
          <T size={32} weight="800">{money(data.summary.available, cur)}</T>
          <T size={12} muted>Loans require partner approval before funds are withdrawn from shared savings.</T>
        </Card>
      )}

      {/* Pending Loan Requests from Partners Requiring Approval */}
      {pendingApprovalsForMe.length > 0 && (
        <Card style={{ borderColor: c.warn, borderWidth: 1.5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="alert-circle" size={22} color={c.warn} />
            <T weight="700" size={16} color={c.warn}>
              Action Required ({pendingApprovalsForMe.length})
            </T>
          </View>
          <T size={13} muted>
            Your partner requested a loan. Please review and approve or decline:
          </T>
          {pendingApprovalsForMe.map((l) => {
            const borrowerName = nameOf(l.borrower_id, l.requester_name);
            return (
              <View
                key={l.id}
                style={{
                  backgroundColor: c.cardAlt,
                  padding: 14,
                  borderRadius: 12,
                  gap: 10,
                  marginTop: 6,
                }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <T weight="700" size={15}>{borrowerName}</T>
                  <T weight="800" size={17} color={c.accent}>{money(Number(l.amount), cur)}</T>
                </View>
                {l.purpose && <T size={13} muted>{l.purpose}</T>}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <Button
                    label="Approve"
                    variant="primary"
                    onPress={() => handleApproveLoan(l)}
                    loading={busy}
                  />
                  <Button
                    label="Decline"
                    variant="ghost"
                    onPress={() => handleRejectLoan(l)}
                    loading={busy}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {/* Current User's Pending Loan Requests */}
      {myPendingRequests.length > 0 && (
        <Card style={{ borderColor: c.accent, borderWidth: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="time-outline" size={20} color={c.accent} />
            <T weight="700" size={16}>Your Pending Loan Requests</T>
          </View>
          <T size={13} muted>
            Waiting for your partner to review and approve:
          </T>
          {myPendingRequests.map((l) => (
            <View
              key={l.id}
              style={{
                backgroundColor: c.cardAlt,
                padding: 12,
                borderRadius: 10,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 4,
              }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="700" size={15}>{money(Number(l.amount), cur)}</T>
                {l.purpose && <T size={12} muted>{l.purpose}</T>}
                <T size={11} color={c.warn} weight="600">⏳ Awaiting Approval</T>
              </View>
              <Pressable
                onPress={() => handleCancelMyRequest(l)}
                hitSlop={8}
                style={({ pressed }) => ({
                  backgroundColor: c.danger + '20',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 8,
                  opacity: pressed ? 0.6 : 1,
                })}>
                <T size={12} weight="700" color={c.danger}>Cancel</T>
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      {/* Request Loan Form */}
      <Card>
        <T weight="700" size={16}>Request a Loan</T>
        <T size={13} muted>
          Enter the amount you wish to borrow. Group profit charges apply according to our savings rules.
        </T>

        {myUnpaidBalance > 50000 && (
          <View style={{ backgroundColor: c.warn + '18', padding: 12, borderRadius: 10, borderColor: c.warn + '40', borderWidth: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="warning-outline" size={18} color={c.warn} />
              <T size={13} weight="700" color={c.warn}>Rule Restriction</T>
            </View>
            <T size={12}>
              You currently have an unpaid loan balance of {money(myUnpaidBalance, cur)}. Rules forbid additional loans above 50,000 RWF unless there is a serious emergency. Specify "Emergency" in your purpose to request.
            </T>
          </View>
        )}

        <Input
          label={`Principal Amount (${cur})`}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />

        {/* Real-time Rule Calculation Box */}
        {enteredAmount > 0 && (
          <View style={{
            backgroundColor: c.cardAlt,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.border,
            gap: 6,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T size={13} muted>Requested Principal:</T>
              <T size={13} weight="600">{money(enteredAmount, cur)}</T>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T size={13} muted>Rule Profit Charge:</T>
              <T size={13} weight="700" color={calculatedFee > 0 ? c.warn : c.accent}>
                {calculatedFee > 0 ? `+ ${money(calculatedFee, cur)}` : 'RWF 0 (No fee)'}
              </T>
            </View>
            <View style={{ height: 1, backgroundColor: c.border, marginVertical: 2 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T size={14} weight="700">Total Repayment Due:</T>
              <T size={16} weight="800" color={c.accent}>{money(totalRepayDue, cur)}</T>
            </View>
          </View>
        )}

        <Input
          label="Purpose"
          value={purpose}
          onChangeText={setPurpose}
          placeholder="Flight tickets, repair, emergency..."
        />
        <ErrorText msg={err} />
        <Button label="Submit Loan Request" onPress={requestLoan} loading={busy} />
      </Card>

      {/* Official Loan Rules Accordion */}
      <Card>
        <Pressable
          onPress={() => setShowRules(!showRules)}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="document-text-outline" size={18} color={c.accent} />
            <T weight="700" size={15}>Official Loan Profit Charges</T>
          </View>
          <Ionicons name={showRules ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
        </Pressable>

        {showRules && (
          <View style={{ gap: 6, marginTop: 4 }}>
            <T size={12}>• RWF 0 – 5,000: <T weight="700" color={c.accent}>No profit charge</T></T>
            <T size={12}>• RWF 5,001 – 14,000: <T weight="700">RWF 1,500 profit charge</T></T>
            <T size={12}>• RWF 14,001 – 22,000: <T weight="700">RWF 3,000 profit charge</T></T>
            <T size={12}>• RWF 22,001 – 35,000: <T weight="700">RWF 4,000 profit charge</T></T>
            <T size={12}>• RWF 35,001 – 50,000: <T weight="700">RWF 5,000 profit charge</T></T>
            <T size={12}>• Above RWF 50,000: <T weight="700">RWF 6,500 profit charge</T></T>
            <T size={11} muted style={{ marginTop: 4 }}>
              * Unpaid loan after 3 weeks receives an additional RWF 1,500 charge.
            </T>
          </View>
        )}
      </Card>

      {/* Active Loans */}
      <T weight="700" size={16}>Active Loans</T>
      {activeLoans.length === 0 && <T muted>No active loans.</T>}
      {activeLoans.map((l) => {
        const owed = Number(l.amount) - Number(l.repaid);
        const mine = l.borrower_id === me?.profile.id;
        const canDelete = (mine || me?.profile.email?.toLowerCase() === 'stevenmwizerwa1@gmail.com') && Number(l.repaid) === 0;
        return (
          <Card key={l.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T weight="700">{mine ? 'You' : nameOf(l.borrower_id, l.requester_name)}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <T weight="700" color={c.warn}>Active</T>
                {canDelete && (
                  <Pressable
                    onPress={() => confirmDeleteLoan(l.id, l.amount)}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                    <Ionicons name="trash-outline" size={18} color={c.danger} />
                  </Pressable>
                )}
              </View>
            </View>
            {l.purpose && <T size={13} muted>{l.purpose}</T>}
            <T size={13} muted>{money(Number(l.repaid), cur)} repaid of {money(Number(l.amount), cur)}</T>
            {mine && (
              <View style={{ gap: 8, marginTop: 4 }}>
                <Input
                  value={repay[l.id] ?? ''}
                  onChangeText={(v) => setRepay({ ...repay, [l.id]: v })}
                  keyboardType="decimal-pad"
                  placeholder={`Repay up to ${owed.toFixed(2)}`}
                />
                <Button label="Repay Loan" variant="ghost" onPress={() => pay(l.id)} />
              </View>
            )}
          </Card>
        );
      })}

      {/* Past / Settled Loans */}
      {pastLoans.length > 0 && (
        <>
          <T weight="700" size={16}>Past Loans</T>
          {pastLoans.map((l) => {
            const mine = l.borrower_id === me?.profile.id;
            const borrowerName = mine ? 'You' : nameOf(l.borrower_id, l.requester_name);
            const isRepaid = l.status === 'repaid';
            const canDeletePast = mine || isVaultOwner;
            return (
              <SwipeableItem key={l.id} onDelete={() => api.delete(`/loans/${l.id}`).then(() => reload()).catch(() => {})}>
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <T weight="700">{borrowerName}</T>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <T weight="700" color={isRepaid ? c.accent : c.danger}>
                        {isRepaid ? '✓ Repaid' : '✗ Declined'}
                      </T>
                      {canDeletePast && (
                        <Pressable
                          onPress={() => confirmDeleteLoan(l.id, l.amount)}
                          hitSlop={8}
                          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                          <Ionicons name="trash-outline" size={18} color={c.danger} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                  {l.purpose && <T size={12} muted>{l.purpose}</T>}
                  <T size={13} muted>
                    {money(Number(l.amount), cur)} {isRepaid ? '(Fully settled)' : '(Declined)'}
                  </T>
                </Card>
              </SwipeableItem>
            );
          })}
        </>
      )}

      {/* Modern Confirmation Popup */}
      <ConfirmModal
        visible={confirmConfig.visible}
        title={confirmConfig.title}
        message={confirmConfig.message}
        icon={confirmConfig.icon}
        confirmLabel={confirmConfig.confirmLabel}
        isDestructive={confirmConfig.isDestructive}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig((prev) => ({ ...prev, visible: false }))}
      />

      {/* Modern Status Popup */}
      <StatusModal
        visible={statusConfig.visible}
        title={statusConfig.title}
        message={statusConfig.message}
        type={statusConfig.type}
        onClose={() => setStatusConfig((prev) => ({ ...prev, visible: false }))}
      />
    </Screen>
  );
}

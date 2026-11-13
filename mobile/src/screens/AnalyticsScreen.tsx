import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { Contribution, Summary } from '../types';
import { Card, ErrorText, ProgressBar, Screen, T, money, useLoad } from '../ui';

function formatCompact(val: number): string {
  if (val === 0) return '0';
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`;
  return `${val}`;
}

export default function AnalyticsScreen() {
  const { c } = useTheme();
  const { t } = useLanguage();
  const { me } = useAuth();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const { data, loading, error, reload } = useLoad(async () => {
    const [summary, list] = await Promise.all([
      api.get<Summary>('/vault/summary'),
      api.get<Contribution[]>('/savings'),
    ]);
    return { summary, list };
  });

  const cur = data?.summary.vault.currency ?? 'RWF';
  const partnerColors = [c.blue, '#9b5de5', '#f15bb5', '#fee440'];
  const members = data?.summary.members ?? [];
  const vault = data?.summary.vault;
  const rawList = data?.list ?? [];
  const accountSavings = data?.summary.accountSavings ?? 0;

  const now = new Date();
  const currentMonthIdx = now.getMonth();
  const currentYear = now.getFullYear();

  // 6 MONTHS DATA
  const monthlyBuckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    const isCurrent = d.getMonth() === currentMonthIdx && d.getFullYear() === currentYear;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleString('en-US', { month: 'short' });
    const fullTitle = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    // Sum for this month
    const listInMonth = rawList.filter((x) => {
      const xDate = new Date(x.created_at);
      return `${xDate.getFullYear()}-${xDate.getMonth()}` === key;
    });

    // Separate member personal deposits from general account savings
    const memberAmounts = members.map((m) =>
      listInMonth
        .filter((x) => x.user_id === m.id && x.note !== 'Account savings')
        .reduce((sum, x) => sum + Number(x.amount), 0)
    );

    const accountSavingsInMonth = listInMonth
      .filter((x) => x.note === 'Account savings')
      .reduce((sum, x) => sum + Number(x.amount), 0);

    const totalMonth = listInMonth.reduce((sum, x) => sum + Number(x.amount), 0);

    return {
      key,
      label,
      fullTitle,
      isCurrent,
      memberAmounts,
      accountSavingsInMonth,
      total: totalMonth,
    };
  });

  const maxVal = Math.max(1, ...monthlyBuckets.map((b) => b.total));
  const activeSelectedIdx = selectedIdx !== null && selectedIdx < monthlyBuckets.length ? selectedIdx : monthlyBuckets.length - 1;
  const selectedBucket = monthlyBuckets[activeSelectedIdx];

  // Overview metrics
  const totalVaultSaved = data?.summary.totalDeposited ?? rawList.reduce((s, x) => s + Number(x.amount), 0);
  const thisMonthMembersTotal = members.reduce((sum, m) => sum + Number(m.thisMonth), 0);
  const monthlyTarget = vault?.monthly_target ?? 0;
  const targetPct = monthlyTarget > 0 ? Math.min(100, Math.round((thisMonthMembersTotal / monthlyTarget) * 100)) : 100;
  const sixMonthsTotal = monthlyBuckets.reduce((s, b) => s + b.total, 0);
  const monthlyAvg = Math.round(sixMonthsTotal / 6);
  const availableBal = data?.summary.available ?? totalVaultSaved;
  const loanedOut = data?.summary.loanedOut ?? 0;

  return (
    <Screen title={t('analytics_title')} onRefresh={reload} refreshing={loading}>
      <ErrorText msg={error} />

      {/* Top Key Metrics Cards */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card style={{ flex: 1, padding: 14, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="wallet-outline" size={17} color={c.accent} />
            <T size={12} muted numberOfLines={1}>{t('total_vault_savings')}</T>
          </View>
          <T weight="800" size={20} color={c.accent}>{money(totalVaultSaved, cur)}</T>
          <T size={11} muted>{money(availableBal, cur)} available</T>
        </Card>

        <Card style={{ flex: 1, padding: 14, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="trending-up-outline" size={17} color={c.blue} />
            <T size={12} muted numberOfLines={1}>{t('this_month_saved')}</T>
          </View>
          <T weight="800" size={20} color={c.text}>{money(thisMonthMembersTotal, cur)}</T>
          <T size={11} color={targetPct >= 100 ? c.accent : c.warn} weight="700">
            {monthlyTarget > 0 ? `${targetPct}% of goal` : 'Active'}
          </T>
        </Card>
      </View>

      {/* Main Monthly Savings Growth Chart Card */}
      <Card style={{ padding: 18 }}>
        {/* Header: Title + 6-Mo Total Badge */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <View style={{ gap: 2 }}>
            <T weight="800" size={17}>{t('saved_per_month')}</T>
            <T size={12} muted>6-Month savings trend for both partners</T>
          </View>
          <View style={{ alignItems: 'flex-end', backgroundColor: c.accent + '15', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
            <T size={10} color={c.accent} weight="700">6-Mo Total</T>
            <T size={14} weight="800" color={c.accent}>{money(sixMonthsTotal, cur)}</T>
          </View>
        </View>

        {/* Legend */}
        <View style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 14,
          marginBottom: 16,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderColor: c.border + '60',
        }}>
          {accountSavings > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} />
              <T size={12} weight="600" color={c.text}>
                {t('account_funds')}
              </T>
            </View>
          )}
          {members.map((m, idx) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: partnerColors[idx % partnerColors.length] }} />
              <T size={12} weight="600" color={c.text}>
                {m.id === me?.profile.id ? `${m.name} (${t('you_label')})` : m.name}
              </T>
            </View>
          ))}
        </View>

        {/* Chart Canvas with Subtle Grid Lines */}
        <View style={{ height: 180, justifyContent: 'flex-end', paddingTop: 12 }}>
          {/* Faint Horizontal Guidelines */}
          <View style={{ position: 'absolute', top: 20, left: 0, right: 0, bottom: 35, justifyContent: 'space-between' }}>
            <View style={{ height: 1, backgroundColor: c.border + '40', width: '100%' }} />
            <View style={{ height: 1, backgroundColor: c.border + '30', width: '100%' }} />
            <View style={{ height: 1, backgroundColor: c.border + '60', width: '100%' }} />
          </View>

          {/* Bar Columns Container */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 145 }}>
            {monthlyBuckets.map((bucket, idx) => {
              const isSelected = idx === activeSelectedIdx;
              const hasData = bucket.total > 0;
              const fillRatio = maxVal > 0 ? (bucket.total / maxVal) : 0;
              const barHeight = Math.max(hasData ? 18 : 4, fillRatio * 105);

              return (
                <Pressable
                  key={bucket.key}
                  onPress={() => setSelectedIdx(idx)}
                  style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                  
                  {/* Floating Compact Value Badge on top */}
                  <View style={{
                    minHeight: 18,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    borderRadius: 5,
                    backgroundColor: isSelected ? c.accent : hasData ? c.cardAlt : 'transparent',
                    marginBottom: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <T size={10} weight="800" color={isSelected ? c.onAccent : hasData ? c.text : c.muted}>
                      {formatCompact(bucket.total)}
                    </T>
                  </View>

                  {/* Slender Sleek Pillar Bar (No bulky hollow box!) */}
                  <View style={{
                    width: '100%',
                    maxWidth: 38,
                    height: 110,
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                  }}>
                    {hasData ? (
                      // Stacked filled rounded bar with vibrant colors and subtle shadow
                      <View style={{
                        width: '100%',
                        height: barHeight,
                        borderRadius: 8,
                        overflow: 'hidden',
                        borderWidth: isSelected ? 2 : 0,
                        borderColor: '#FFFFFF',
                        shadowColor: c.accent,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.35,
                        shadowRadius: 8,
                        elevation: 4,
                      }}>
                        {bucket.accountSavingsInMonth > 0 && (
                          <View
                            style={{
                              width: '100%',
                              height: (bucket.accountSavingsInMonth / bucket.total) * barHeight,
                              backgroundColor: c.accent,
                            }}
                          />
                        )}
                        {bucket.memberAmounts.map((amt, mIdx) => {
                          if (amt === 0) return null;
                          const partHeight = (amt / bucket.total) * barHeight;
                          return (
                            <View
                              key={mIdx}
                              style={{
                                width: '100%',
                                height: partHeight,
                                backgroundColor: partnerColors[mIdx % partnerColors.length],
                              }}
                            />
                          );
                        })}
                      </View>
                    ) : (
                      // Sleek minimalist track line
                      <View style={{
                        width: 4,
                        height: '100%',
                        backgroundColor: c.border + '50',
                        borderRadius: 2,
                        justifyContent: 'flex-end',
                      }}>
                        <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: c.border, marginLeft: -5 }} />
                      </View>
                    )}
                  </View>

                  {/* Month Label Under Bar */}
                  <View style={{ alignItems: 'center', marginTop: 8 }}>
                    <T size={11} weight={bucket.isCurrent || isSelected ? '800' : '600'} color={isSelected ? c.accent : bucket.isCurrent ? c.text : c.muted}>
                      {bucket.label}
                    </T>
                    {bucket.isCurrent && (
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.accent, marginTop: 3 }} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Selected Month Details Card */}
        {selectedBucket && (
          <View style={{
            marginTop: 18,
            padding: 12,
            borderRadius: 12,
            backgroundColor: c.cardAlt,
            borderWidth: 1,
            borderColor: selectedBucket.isCurrent ? c.accent + '40' : c.border,
            gap: 6,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="calendar-outline" size={15} color={c.accent} />
                <T size={12} weight="700" color={c.text}>{selectedBucket.fullTitle}</T>
              </View>
              <T size={15} weight="800" color={selectedBucket.total > 0 ? c.accent : c.muted}>
                {money(selectedBucket.total, cur)}
              </T>
            </View>

            {selectedBucket.total > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderColor: c.border + '40' }}>
                {selectedBucket.accountSavingsInMonth > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
                    <T size={12} muted>{t('account_funds')}: <T weight="700" color={c.text}>{money(selectedBucket.accountSavingsInMonth, cur)}</T> ({Math.round((selectedBucket.accountSavingsInMonth / selectedBucket.total) * 100)}%)</T>
                  </View>
                )}
                {members.map((m, idx) => {
                  const mAmount = selectedBucket.memberAmounts[idx] ?? 0;
                  const pct = selectedBucket.total > 0 ? Math.round((mAmount / selectedBucket.total) * 100) : 0;
                  return (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: partnerColors[idx % partnerColors.length] }} />
                      <T size={12} muted>{m.name}: <T weight="700" color={c.text}>{money(mAmount, cur)}</T> ({pct}%)</T>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Footer Metrics Row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: c.border + '60' }}>
          <View style={{ gap: 2 }}>
            <T size={11} muted>{t('monthly_avg')}</T>
            <T size={14} weight="700">{money(monthlyAvg, cur)} / mo</T>
          </View>
          {monthlyTarget > 0 && (
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <T size={11} muted>{t('analytics_target_progress')}</T>
              <T size={14} weight="700" color={targetPct >= 100 ? c.accent : c.blue}>
                {money(thisMonthMembersTotal, cur)} / {money(monthlyTarget, cur)}
              </T>
            </View>
          )}
        </View>
      </Card>

      {/* Partner Breakdown Card ("Who Saved What") */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T weight="700" size={16}>{t('who_saved_what')}</T>
          <T size={12} muted>{members.length} {members.length === 1 ? 'member' : 'members'}</T>
        </View>

        <ProgressBar parts={[
          ...(accountSavings > 0 ? [{ value: accountSavings, color: c.accent }] : []),
          ...members.map((m, i) => ({ value: m.total, color: partnerColors[i % partnerColors.length] })),
        ]} />

        <View style={{ gap: 10, marginTop: 4 }}>
          {accountSavings > 0 && (
            <View
              style={{
                backgroundColor: c.cardAlt,
                padding: 12,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderWidth: 1,
                borderColor: c.accent + '40',
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: c.accent + '20',
                  borderWidth: 1.5,
                  borderColor: c.accent,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                  <Ionicons name="wallet-outline" size={18} color={c.accent} />
                </View>
                <View style={{ gap: 2 }}>
                  <T weight="700" size={14}>{t('account_funds')}</T>
                  <T size={12} muted>General vault reserve</T>
                </View>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <T weight="800" size={15}>{money(accountSavings, cur)}</T>
                <View style={{ backgroundColor: c.accent + '20', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                  <T size={11} weight="700" color={c.accent}>
                    {totalVaultSaved > 0 ? Math.round((accountSavings / totalVaultSaved) * 100) : 0}%
                  </T>
                </View>
              </View>
            </View>
          )}

          {members.map((m, i) => {
            const pct = totalVaultSaved > 0 ? Math.round((m.total / totalVaultSaved) * 100) : 0;
            const pColor = partnerColors[i % partnerColors.length];
            const isMe = m.id === me?.profile.id;

            return (
              <View
                key={m.id}
                style={{
                  backgroundColor: c.cardAlt,
                  padding: 12,
                  borderRadius: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderWidth: 1,
                  borderColor: c.border,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: pColor + '20',
                    borderWidth: 1.5,
                    borderColor: pColor,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                    <T weight="800" color={pColor} size={15}>{m.name.charAt(0).toUpperCase()}</T>
                  </View>
                  <View style={{ gap: 2 }}>
                    <T weight="700" size={14}>{isMe ? `${m.name} (${t('you_label')})` : m.name}</T>
                    <T size={12} muted>{t('this_month_saved')}: {money(m.thisMonth, cur)}</T>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <T weight="800" size={15}>{money(m.total, cur)}</T>
                  <View style={{ backgroundColor: pColor + '20', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                    <T size={11} weight="700" color={pColor}>{pct}%</T>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      {/* Loans Out on Loan Card */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="swap-horizontal-outline" size={18} color={loanedOut > 0 ? c.warn : c.accent} />
            <T weight="700" size={16}>{t('money_out_on_loan')}</T>
          </View>
          {loanedOut > 0 && (
            <View style={{ backgroundColor: c.warn + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <T size={12} weight="700" color={c.warn}>{money(loanedOut, cur)}</T>
            </View>
          )}
        </View>

        {members.filter((m) => m.owed > 0).length === 0 ? (
          <View style={{ paddingVertical: 12, alignItems: 'center', gap: 4 }}>
            <Ionicons name="checkmark-circle-outline" size={32} color={c.accent} />
            <T size={13} muted>{t('no_loans_active')}</T>
          </View>
        ) : (
          <View style={{ gap: 8, marginTop: 4 }}>
            {members.filter((m) => m.owed > 0).map((m) => (
              <View
                key={m.id}
                style={{
                  backgroundColor: c.cardAlt,
                  padding: 12,
                  borderRadius: 10,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: c.warn + '40',
                }}>
                <View style={{ gap: 2 }}>
                  <T weight="700">{m.name}</T>
                  <T size={12} color={c.warn}>{t('owes_label', { name: m.name })}</T>
                </View>
                <T size={15} weight="800" color={c.warn}>{money(m.owed, cur)}</T>
              </View>
            ))}
          </View>
        )}
      </Card>
    </Screen>
  );
}

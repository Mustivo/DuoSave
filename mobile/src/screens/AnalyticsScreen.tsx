import React from 'react';
import { View } from 'react-native';
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
  if (val >= 1000) return `${Math.round(val / 1000)}k`;
  return `${val}`;
}

export default function AnalyticsScreen() {
  const { c } = useTheme();
  const { t } = useLanguage();
  const { me } = useAuth();

  const { data, loading, error, reload } = useLoad(async () => {
    const [summary, list] = await Promise.all([
      api.get<Summary>('/vault/summary'),
      api.get<Contribution[]>('/savings'),
    ]);
    return { summary, list };
  });

  const cur = data?.summary.vault.currency ?? 'RWF';
  const partnerColors = [c.accent, c.blue, '#9b5de5', '#f15bb5'];
  const members = data?.summary.members ?? [];
  const vault = data?.summary.vault;

  // Generate last 6 months
  const now = new Date();
  const currentMonthIdx = now.getMonth();
  const currentYear = now.getFullYear();

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    const isCurrent = d.getMonth() === currentMonthIdx && d.getFullYear() === currentYear;
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleString('en-US', { month: 'short' }),
      isCurrent,
    };
  });

  // Calculate per member per month
  const perMonthData = months.map((mo) => {
    const memberAmounts = members.map((m) => {
      const sum = (data?.list ?? [])
        .filter((x) => {
          if (x.user_id !== m.id || x.note === 'Account savings') return false;
          const d = new Date(x.created_at);
          return `${d.getFullYear()}-${d.getMonth()}` === mo.key;
        })
        .reduce((acc, x) => acc + Number(x.amount), 0);
      return sum;
    });
    const totalMonth = memberAmounts.reduce((a, b) => a + b, 0);
    return {
      month: mo,
      memberAmounts,
      totalMonth,
    };
  });

  const maxMonthVal = Math.max(1, ...perMonthData.map((p) => p.totalMonth));
  const totalSavedAllTime = data?.summary.totalDeposited ?? members.reduce((s, m) => s + m.total, 0);
  const thisMonthTotal = perMonthData[perMonthData.length - 1]?.totalMonth ?? 0;
  const monthlyTarget = vault?.monthly_target ?? 0;
  const targetPct = monthlyTarget > 0 ? Math.min(100, Math.round((thisMonthTotal / monthlyTarget) * 100)) : 100;
  const sixMonthsTotal = perMonthData.reduce((s, p) => s + p.totalMonth, 0);
  const monthlyAvg = Math.round(sixMonthsTotal / 6);
  const availableBal = data?.summary.available ?? 0;
  const loanedOut = data?.summary.loanedOut ?? 0;

  return (
    <Screen title={t('analytics_title')} onRefresh={reload} refreshing={loading}>
      <ErrorText msg={error} />

      {/* Top Quick Stats Grid */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card style={{ flex: 1, padding: 12, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="wallet-outline" size={16} color={c.accent} />
            <T size={11} muted numberOfLines={1}>{t('total_vault_savings')}</T>
          </View>
          <T weight="800" size={18} color={c.accent}>{money(totalSavedAllTime, cur)}</T>
          <T size={10} muted>{money(availableBal, cur)} available</T>
        </Card>

        <Card style={{ flex: 1, padding: 12, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="trending-up-outline" size={16} color={c.blue} />
            <T size={11} muted numberOfLines={1}>{t('this_month_saved')}</T>
          </View>
          <T weight="800" size={18} color={c.text}>{money(thisMonthTotal, cur)}</T>
          <T size={10} color={targetPct >= 100 ? c.accent : c.warn} weight="600">
            {monthlyTarget > 0 ? `${targetPct}% of goal` : 'Active'}
          </T>
        </Card>
      </View>

      {/* Main Visible Interactive Bar Chart */}
      <Card style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <View style={{ gap: 2 }}>
            <T weight="800" size={17}>{t('saved_per_month')}</T>
            <T size={12} muted>6-Month savings trends for both partners</T>
          </View>
          <View style={{ alignItems: 'flex-end', backgroundColor: c.accent + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
            <T size={10} color={c.accent} weight="700">6-Mo Total</T>
            <T size={13} weight="800" color={c.accent}>{money(sixMonthsTotal, cur)}</T>
          </View>
        </View>

        {/* Legend */}
        {members.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16, paddingBottom: 8, borderBottomWidth: 1, borderColor: c.border + '60' }}>
            {members.map((m, idx) => (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: partnerColors[idx % partnerColors.length] }} />
                <T size={12} weight="600" color={c.text}>
                  {m.id === me?.profile.id ? `${m.name} (${t('you_label')})` : m.name}
                </T>
              </View>
            ))}
          </View>
        )}

        {/* Graph Pillars Area */}
        <View style={{ height: 170, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 16 }}>
          {perMonthData.map((p, i) => {
            const isCurrent = p.month.isCurrent;
            const monthTotal = p.totalMonth;
            const barHeightPct = maxMonthVal > 0 ? (monthTotal / maxMonthVal) : 0;
            const pillarFilledHeight = Math.max(monthTotal > 0 ? 12 : 0, barHeightPct * 115);

            return (
              <View key={p.month.key} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                {/* Value on top of bar */}
                <T size={10} weight="700" color={monthTotal > 0 ? c.text : c.muted} style={{ marginBottom: 4 }}>
                  {formatCompact(monthTotal)}
                </T>

                {/* Visible Pillar Container */}
                <View style={{
                  width: '100%',
                  height: 120,
                  backgroundColor: isCurrent ? c.accent + '12' : c.cardAlt,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: isCurrent ? c.accent + '60' : c.border,
                  justifyContent: 'flex-end',
                  overflow: 'hidden',
                  padding: 2,
                }}>
                  {monthTotal === 0 ? (
                    // Subtle indicator when empty
                    <View style={{ alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      <View style={{ width: 10, height: 3, borderRadius: 1.5, backgroundColor: c.border }} />
                    </View>
                  ) : (
                    // Stacked partner contributions inside the pillar
                    <View style={{ width: '100%', height: pillarFilledHeight, justifyContent: 'flex-end', borderRadius: 6, overflow: 'hidden' }}>
                      {p.memberAmounts.map((amt, mIdx) => {
                        if (amt === 0) return null;
                        const partHeight = (amt / monthTotal) * pillarFilledHeight;
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
                  )}
                </View>

                {/* Month Label with Current Badge */}
                <View style={{ alignItems: 'center', marginTop: 6 }}>
                  <T size={11} weight={isCurrent ? '800' : '600'} color={isCurrent ? c.accent : c.muted}>
                    {p.month.label}
                  </T>
                  {isCurrent && (
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.accent, marginTop: 2 }} />
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Footer Metrics Row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderColor: c.border + '60' }}>
          <View style={{ gap: 2 }}>
            <T size={11} muted>{t('monthly_avg')}</T>
            <T size={14} weight="700">{money(monthlyAvg, cur)} / mo</T>
          </View>
          {monthlyTarget > 0 && (
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <T size={11} muted>{t('analytics_target_progress')}</T>
              <T size={14} weight="700" color={targetPct >= 100 ? c.accent : c.blue}>
                {money(thisMonthTotal, cur)} / {money(monthlyTarget, cur)}
              </T>
            </View>
          )}
        </View>
      </Card>

      {/* Partner Breakdown Card */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T weight="700" size={16}>{t('who_saved_what')}</T>
          <T size={12} muted>{members.length} {members.length === 1 ? 'member' : 'members'}</T>
        </View>

        <ProgressBar parts={members.map((m, i) => ({ value: m.total, color: partnerColors[i % partnerColors.length] }))} />

        <View style={{ gap: 10, marginTop: 4 }}>
          {members.map((m, i) => {
            const pct = totalSavedAllTime > 0 ? Math.round((m.total / totalSavedAllTime) * 100) : 0;
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
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: pColor + '20',
                    borderWidth: 1.5,
                    borderColor: pColor,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                    <T weight="800" color={pColor} size={14}>{m.name.charAt(0).toUpperCase()}</T>
                  </View>
                  <View style={{ gap: 2 }}>
                    <T weight="700" size={14}>{isMe ? `${m.name} (${t('you_label')})` : m.name}</T>
                    <T size={12} muted>{t('this_month_saved')}: {money(m.thisMonth, cur)}</T>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <T weight="800" size={15}>{money(m.total, cur)}</T>
                  <View style={{ backgroundColor: pColor + '20', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
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

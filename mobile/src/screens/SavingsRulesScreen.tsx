import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { Button, Card, ConfirmModal, ErrorText, Input, Screen, StatusModal, T } from '../ui';

export interface RuleSection {
  id: string;
  title: string;
  subtitle?: string;
  category?: 'Savings' | 'Loans' | 'Policy' | 'General';
  items: string[];
  isCustom?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const DEFAULT_RULES: RuleSection[] = [
  {
    id: 'contributions',
    title: 'Savings contribution',
    category: 'Savings',
    subtitle: 'The savings group started on 1 January 2025 and had saved more than RWF 80,000 by 9 October 2025.',
    items: [
      'Each member contributes RWF 3,000 every month.',
      'After three weeks of a new month, an unpaid contribution receives an additional RWF 1,500 charge.',
      'A member with a genuine difficulty may temporarily be excused from contributions until the issue is resolved. Members without such a difficulty must continue contributing.',
    ],
  },
  {
    id: 'loan_fees',
    title: 'Loan profit charges',
    category: 'Loans',
    items: [
      'RWF 0 – 5,000: no profit charge',
      'RWF 5,001 – 14,000: RWF 1,500 profit charge',
      'RWF 14,001 – 22,000: RWF 3,000 profit charge',
      'RWF 22,001 – 35,000: RWF 4,000 profit charge',
      'RWF 35,001 – 50,000: RWF 5,000 profit charge',
      'Above RWF 50,000: RWF 6,500 profit charge',
    ],
  },
  {
    id: 'loan_repayment',
    title: 'Loan repayment',
    category: 'Loans',
    items: [
      'A loan should be repaid on time. A member experiencing a genuine difficulty may receive a repayment extension of up to nine weeks, with at least 5% deducted or charged on the loan.',
      'If a loan remains unpaid after three weeks, an additional RWF 1,500 is added to the borrowed amount, including its profit charge.',
      'A member with an unpaid loan above RWF 50,000 may not take another loan unless there is a serious emergency.',
      'If a member lends group money to a friend, the member remains responsible for repaying it if the friend does not pay.',
    ],
  },
  {
    id: 'new_rules_2026',
    title: 'New rules — 28 September 2026',
    category: 'Policy',
    items: [
      'Open a BPR account for depositing the group’s savings.',
      'From 1 January 2027, the monthly contribution becomes RWF 5,000.',
      'Every member must take RWF 30,000 within five months. The amount is repaid with the agreed profit charge. A member who does not take it must pay the profit charge plus RWF 3,000.',
    ],
  },
];

export default function SavingsRulesScreen() {
  const { c } = useTheme();
  const { me } = useAuth();
  const storageKey = `duosave_rules_${me?.vault?.id ?? 'default'}`;

  // Only master admin (stevenmwizerwa1@gmail.com) has permission to add, edit, or delete rules
  const isVaultOwner = (me?.profile?.email?.toLowerCase() === 'stevenmwizerwa1@gmail.com') || !!me?.isAdmin;
  const adminName = isVaultOwner ? 'You (Master Admin)' : 'stevenmwizerwa1@gmail.com';

  const [rules, setRules] = useState<RuleSection[]>(DEFAULT_RULES);
  const [showAdd, setShowAdd] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [category, setCategory] = useState<'Savings' | 'Loans' | 'Policy' | 'General'>('General');
  const [ruleText, setRuleText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Modern Confirmation & Status Modal States
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

  // Load saved rules from persistent storage
  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRules(parsed);
          }
        }
      } catch (e) {
        console.warn('Failed to load saved rules:', e);
      }
    })();
  }, [storageKey]);

  const saveRulesToStorage = async (updated: RuleSection[]) => {
    setRules(updated);
    try {
      await SecureStore.setItemAsync(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to persist rules:', e);
    }
  };

  const startEditRule = (rule: RuleSection) => {
    if (!isVaultOwner) return;
    setEditingRuleId(rule.id);
    setTitle(rule.title);
    setSubtitle(rule.subtitle ?? '');
    setCategory(rule.category ?? 'General');
    setRuleText(rule.items.join('\n'));
    setShowAdd(true);
    setErr(null);
  };

  const cancelForm = () => {
    setEditingRuleId(null);
    setTitle('');
    setSubtitle('');
    setRuleText('');
    setCategory('General');
    setShowAdd(false);
    setErr(null);
  };

  const handleSaveRule = async () => {
    if (!isVaultOwner) {
      setStatusConfig({
        visible: true,
        title: 'Permission Denied',
        message: 'Only the vault admin can add or edit savings rules.',
        type: 'error',
      });
      return;
    }

    if (!title.trim()) {
      setErr('Please enter a title for the rule');
      return;
    }
    if (!ruleText.trim()) {
      setErr('Please enter at least one rule item or description');
      return;
    }

    setErr(null);
    const items = ruleText
      .split('\n')
      .map((line) => line.replace(/^[•\-\*]\s*/, '').trim())
      .filter((line) => line.length > 0);

    if (editingRuleId) {
      const updated = rules.map((r) => {
        if (r.id !== editingRuleId) return r;
        return {
          ...r,
          title: title.trim(),
          subtitle: subtitle.trim() || undefined,
          category,
          items: items.length > 0 ? items : [ruleText.trim()],
          updatedAt: new Date().toISOString(),
        };
      });
      await saveRulesToStorage(updated);
      setStatusConfig({
        visible: true,
        title: 'Rule Updated',
        message: `"${title.trim()}" has been updated successfully.`,
        type: 'success',
      });
    } else {
      const newRule: RuleSection = {
        id: `rule_${Date.now()}`,
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        category,
        items: items.length > 0 ? items : [ruleText.trim()],
        isCustom: true,
        createdAt: new Date().toISOString(),
      };
      const updated = [...rules, newRule];
      await saveRulesToStorage(updated);
      setStatusConfig({
        visible: true,
        title: 'Rule Added',
        message: `"${newRule.title}" has been saved to group rules.`,
        type: 'success',
      });
    }

    cancelForm();
  };

  const confirmDeleteRule = (ruleId: string, ruleTitle: string) => {
    if (!isVaultOwner) return;

    setConfirmConfig({
      visible: true,
      title: 'Delete Rule?',
      message: `Are you sure you want to delete "${ruleTitle}"? This rule will be permanently removed.`,
      icon: 'trash-outline',
      confirmLabel: 'Delete Rule',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        const updated = rules.filter((r) => r.id !== ruleId);
        await saveRulesToStorage(updated);
      },
    });
  };

  const confirmDeleteItem = (ruleId: string, itemIndex: number) => {
    if (!isVaultOwner) return;

    setConfirmConfig({
      visible: true,
      title: 'Remove Rule Point?',
      message: 'Are you sure you want to remove this bullet point from the rule?',
      icon: 'remove-circle-outline',
      confirmLabel: 'Remove Point',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        const updated = rules.map((r) => {
          if (r.id !== ruleId) return r;
          const newItems = r.items.filter((_, idx) => idx !== itemIndex);
          return { ...r, items: newItems };
        }).filter((r) => r.items.length > 0);
        await saveRulesToStorage(updated);
      },
    });
  };

  const resetToDefaults = () => {
    if (!isVaultOwner) return;

    setConfirmConfig({
      visible: true,
      title: 'Reset All Rules?',
      message: 'Restore the default group rules? Any custom rules you added will be cleared.',
      icon: 'refresh-circle-outline',
      confirmLabel: 'Reset to Defaults',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        await saveRulesToStorage(DEFAULT_RULES);
        setStatusConfig({
          visible: true,
          title: 'Reset Complete',
          message: 'Default savings rules have been restored.',
          type: 'success',
        });
      },
    });
  };

  const getCategoryColor = (cat?: string) => {
    switch (cat) {
      case 'Savings': return c.accent;
      case 'Loans': return c.warn;
      case 'Policy': return c.blue;
      default: return c.muted;
    }
  };

  return (
    <Screen title="Savings rules">
      {/* Top Banner indicating Admin permissions */}
      <View style={{
        backgroundColor: isVaultOwner ? c.accent + '15' : c.cardAlt,
        borderColor: isVaultOwner ? c.accent + '40' : c.border,
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <T size={12} weight="700" color={isVaultOwner ? c.accent : c.text}>
            {isVaultOwner ? '👑 Master Admin Mode' : `🛡️ Rules Managed by ${adminName}`}
          </T>
          <T size={11} muted>
            {isVaultOwner
              ? 'You have permission to add, edit, and delete rules.'
              : 'Only the vault admin can create, modify, or delete rules.'}
          </T>
        </View>

        {isVaultOwner && (
          <Pressable
            onPress={() => {
              if (showAdd) cancelForm();
              else setShowAdd(true);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: c.accent,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
            }}>
            <Ionicons name={showAdd ? 'close' : 'add'} size={16} color={c.onAccent} />
            <T size={12} weight="700" color={c.onAccent}>{showAdd ? 'Cancel' : 'Add Rule'}</T>
          </Pressable>
        )}
      </View>

      {/* Add / Edit Rule Form (Admin Only) */}
      {isVaultOwner && showAdd && (
        <Card style={{ borderColor: c.accent, borderWidth: 1.5 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T weight="700" size={16} color={c.accent}>
              {editingRuleId ? '✏️ Edit Applied Rule' : '➕ Add New Rule Applied'}
            </T>
            <Pressable onPress={cancelForm}>
              <Ionicons name="close-circle-outline" size={22} color={c.muted} />
            </Pressable>
          </View>
          <T size={12} muted>Specify the rule title and describe the requirements for both partners.</T>

          <Input
            label="Rule Title"
            placeholder="e.g. New rules — 15 November 2026"
            value={title}
            onChangeText={setTitle}
          />

          <Input
            label="Subtitle / Note (Optional)"
            placeholder="e.g. Approved by group members"
            value={subtitle}
            onChangeText={setSubtitle}
          />

          {/* Category selection */}
          <View style={{ gap: 6 }}>
            <T size={12} muted weight="600">Category</T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['Savings', 'Loans', 'Policy', 'General'] as const).map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 8,
                    alignItems: 'center',
                    backgroundColor: category === cat ? c.accent : c.cardAlt,
                  }}>
                  <T size={12} weight="600" color={category === cat ? c.onAccent : c.text}>{cat}</T>
                </Pressable>
              ))}
            </View>
          </View>

          <Input
            label="Rule Details (one rule per line)"
            placeholder="• Each member must contribute on the agreed date&#10;• Late penalties apply after 3 weeks"
            multiline
            numberOfLines={4}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
            value={ruleText}
            onChangeText={setRuleText}
          />

          <ErrorText msg={err} />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" variant="ghost" onPress={cancelForm} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={editingRuleId ? 'Update Rule' : 'Save Rule'} onPress={handleSaveRule} />
            </View>
          </View>
        </Card>
      )}

      {/* Render all rule cards */}
      {rules.map((rule) => {
        const catColor = getCategoryColor(rule.category);
        return (
          <Card key={rule.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <T weight="700" size={16}>{rule.title}</T>
                  {rule.category && (
                    <View style={{ backgroundColor: catColor + '20', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                      <T size={10} weight="700" color={catColor}>{rule.category}</T>
                    </View>
                  )}
                </View>
                {rule.subtitle ? <T muted size={13}>{rule.subtitle}</T> : null}
              </View>

              {/* Admin-only controls: Edit & Delete */}
              {isVaultOwner && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable
                    onPress={() => startEditRule(rule)}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}>
                    <Ionicons name="pencil-outline" size={18} color={c.accent} />
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDeleteRule(rule.id, rule.title)}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}>
                    <Ionicons name="trash-outline" size={18} color={c.danger} />
                  </Pressable>
                </View>
              )}
            </View>

            <View style={{ gap: 8, marginTop: 6 }}>
              {rule.items.map((item, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <T style={{ flex: 1 }}>• {item}</T>
                  {/* Delete individual bullet point (Admin only) */}
                  {isVaultOwner && (
                    <Pressable
                      onPress={() => confirmDeleteItem(rule.id, idx)}
                      hitSlop={6}
                      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.7, paddingTop: 2 })}>
                      <Ionicons name="close" size={16} color={c.muted} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          </Card>
        );
      })}

      {rules.length === 0 && (
        <Card>
          <T muted style={{ textAlign: 'center' }}>No savings rules currently defined.</T>
          {isVaultOwner && (
            <Button label="Restore Default Rules" variant="ghost" onPress={resetToDefaults} />
          )}
        </Card>
      )}

      <T muted size={12} style={{ textAlign: 'center', marginTop: 4 }}>
        All members must follow these rules so that our savings can grow.
      </T>

      {/* Admin option to reset to defaults */}
      {isVaultOwner && (
        <Pressable onPress={resetToDefaults} style={{ alignSelf: 'center', paddingVertical: 6 }}>
          <T size={12} color={c.muted} style={{ textDecorationLine: 'underline' }}>
            Reset rules to group defaults
          </T>
        </Pressable>
      )}

      {/* Custom Designed Confirmation Modal */}
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

      {/* Custom Designed Status/Alert Modal */}
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

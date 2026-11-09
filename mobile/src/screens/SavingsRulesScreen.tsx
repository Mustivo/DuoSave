import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { useLanguage } from '../i18n';
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

const DEFAULT_RULES_EN: RuleSection[] = [
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

const DEFAULT_RULES_RW: RuleSection[] = [
  {
    id: 'contributions',
    title: 'Ubwizigame bwa buri kwezi',
    category: 'Savings',
    subtitle: 'Itsinda ryatangiye tariki 1 Mutarama 2025 ryizigama arenga 80,000 RWF kugeza 9 Ukwakira 2025.',
    items: [
      'Buri munyamuryango yizigama 3,000 RWF buri kwezi.',
      'Nyuma y\'ibyumweru bitatu by\'ukwezi gushya, utarazigama acibwa amande y\'inyongera ya 1,500 RWF.',
      'Umunyamuryango ufite ikibazo cy\'ingutu ashobora kubabarirwa by\'agateganyo kugeza gikemutse. Abandi bakomeza kwizigama.',
    ],
  },
  {
    id: 'loan_fees',
    title: 'Inyungu ku nguzanyo',
    category: 'Loans',
    items: [
      '0 – 5,000 RWF: Nta nyungu icibwa (0 RWF)',
      '5,001 – 14,000 RWF: Inyungu ni 1,500 RWF',
      '14,001 – 22,000 RWF: Inyungu ni 3,000 RWF',
      '22,001 – 35,000 RWF: Inyungu ni 4,000 RWF',
      '35,001 – 50,000 RWF: Inyungu ni 5,000 RWF',
      'Hejuru ya 50,000 RWF: Inyungu ni 6,500 RWF',
    ],
  },
  {
    id: 'loan_repayment',
    title: 'Kwishyura inguzanyo',
    category: 'Loans',
    items: [
      'Inguzanyo igomba kwishyurwa ku gihe. Ufite ikibazo cy\'ingutu ashobora kongererwa kugeza ku byumweru 9, ariko acibwe byibura 5% by\'inguzanyo.',
      'Iyo inguzanyo itishyuwe mu byumweru 3, yongerwaho amande ya 1,500 RWF.',
      'Umunyamuryango ufite inguzanyo itarishyurwa irenze 50,000 RWF ntiyemerewe indi nguzanyo keretse mu kibazo cyihutirwa cyane.',
      'Iyo umunyamuryango agurije inshuti ye amafaranga y\'itsinda, aguma ari we ubyirengera iyo inshuti itishyuye.',
    ],
  },
  {
    id: 'new_rules_2026',
    title: 'Amategeko mashya — 28 Nzeri 2026',
    category: 'Policy',
    items: [
      'Gufungura konti muri BPR yo kubitsaho ubwizigame bw\'itsinda.',
      'Kuva tariki 1 Mutarama 2027, umugabane w\'ukwezi uzaba 5,000 RWF.',
      'Buri munyamuryango agomba gufata 30,000 RWF mu mezi 5. Ayishyurana n\'inyungu yemerewe. Utayifashe yishyura inyungu yayo hamwe n\'inyongera ya 3,000 RWF.',
    ],
  },
];

export default function SavingsRulesScreen() {
  const { c } = useTheme();
  const { lang, t } = useLanguage();
  const { me } = useAuth();
  const storageKey = `duosave_rules_${me?.vault?.id ?? 'default'}`;

  // Only master admin (stevenmwizerwa1@gmail.com) has permission to add, edit, or delete rules
  const isVaultOwner = me?.profile?.email?.toLowerCase() === 'stevenmwizerwa1@gmail.com';
  const adminName = isVaultOwner ? 'You (Master Admin)' : 'stevenmwizerwa1@gmail.com';

  const defaultRules = lang === 'rw' ? DEFAULT_RULES_RW : DEFAULT_RULES_EN;
  const [rules, setRules] = useState<RuleSection[]>(defaultRules);
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

  useEffect(() => {
    SecureStore.getItemAsync(storageKey)
      .then((saved) => {
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setRules(parsed);
              return;
            }
          } catch {}
        }
        setRules(lang === 'rw' ? DEFAULT_RULES_RW : DEFAULT_RULES_EN);
      })
      .catch(() => {
        setRules(lang === 'rw' ? DEFAULT_RULES_RW : DEFAULT_RULES_EN);
      });
  }, [storageKey, lang]);

  const saveRulesToStorage = async (updatedRules: RuleSection[]) => {
    setRules(updatedRules);
    try {
      await SecureStore.setItemAsync(storageKey, JSON.stringify(updatedRules));
    } catch (e: any) {
      console.warn('Could not persist rules to local storage:', e?.message);
    }
  };

  const startEditRule = (rule: RuleSection) => {
    if (!isVaultOwner) return;
    setEditingRuleId(rule.id);
    setTitle(rule.title);
    setSubtitle(rule.subtitle ?? '');
    setCategory(rule.category ?? 'General');
    setRuleText(rule.items.join('\n• '));
    setShowAdd(true);
    setErr(null);
  };

  const cancelForm = () => {
    setShowAdd(false);
    setEditingRuleId(null);
    setTitle('');
    setSubtitle('');
    setCategory('General');
    setRuleText('');
    setErr(null);
  };

  const handleSaveRule = async () => {
    if (!isVaultOwner) {
      setErr('Only master admin can add or modify rules.');
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
        title: t('rule_saved_title'),
        message: t('rule_saved_msg'),
        type: 'success',
      });
    }

    cancelForm();
  };

  const confirmDeleteRule = (ruleId: string, ruleTitle: string) => {
    if (!isVaultOwner) return;

    setConfirmConfig({
      visible: true,
      title: t('delete_rule_title'),
      message: t('delete_rule_msg'),
      icon: 'trash-outline',
      confirmLabel: t('delete'),
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        const updated = rules.filter((r) => r.id !== ruleId);
        await saveRulesToStorage(updated);
        setStatusConfig({
          visible: true,
          title: 'Rule Deleted',
          message: `"${ruleTitle}" was removed from group rules.`,
          type: 'info',
        });
      },
    });
  };

  const confirmDeleteItem = (ruleId: string, itemIndex: number) => {
    if (!isVaultOwner) return;

    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;

    const updated = rules.map((r) => {
      if (r.id !== ruleId) return r;
      return {
        ...r,
        items: r.items.filter((_, idx) => idx !== itemIndex),
        updatedAt: new Date().toISOString(),
      };
    });

    saveRulesToStorage(updated);
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
        await saveRulesToStorage(defaultRules);
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
    <Screen title={t('rules_title')}>
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
            <T size={12} weight="700" color={c.onAccent}>{showAdd ? t('cancel') : t('add_new_rule')}</T>
          </Pressable>
        )}
      </View>

      {/* Admin Add/Edit Rule Form */}
      {isVaultOwner && showAdd && (
        <Card style={{ borderColor: c.accent, borderWidth: 1.5 }}>
          <T weight="700" size={16}>{editingRuleId ? 'Edit Rule Section' : t('add_new_rule')}</T>

          <Input
            label={t('rule_title_label')}
            placeholder="e.g. Penalty for late attendance"
            value={title}
            onChangeText={setTitle}
          />

          <Input
            label={t('rule_subtitle_label')}
            placeholder="e.g. Effective starting October 2026"
            value={subtitle}
            onChangeText={setSubtitle}
          />

          {/* Category Selector */}
          <View style={{ gap: 6 }}>
            <T size={12} muted weight="600">{t('rule_category')}</T>
            <View style={{ flexDirection: 'row', gap: 6 }}>
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
                  <T size={11} weight="700" color={category === cat ? c.onAccent : c.text}>
                    {cat}
                  </T>
                </Pressable>
              ))}
            </View>
          </View>

          <Input
            label={t('rule_items_label')}
            placeholder={t('rule_placeholder')}
            value={ruleText}
            onChangeText={setRuleText}
            multiline
            numberOfLines={4}
          />

          <ErrorText msg={err} />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <Button label={t('save')} onPress={handleSaveRule} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t('cancel')} variant="ghost" onPress={cancelForm} />
            </View>
          </View>
        </Card>
      )}

      {/* Rules List */}
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
        {t('rules_subtitle')}
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

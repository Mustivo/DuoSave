import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { Button, Card, ErrorText, Input, Screen, T } from '../ui';

export interface RuleSection {
  id: string;
  title: string;
  subtitle?: string;
  items: string[];
  isCustom?: boolean;
  createdAt?: string;
}

const DEFAULT_RULES: RuleSection[] = [
  {
    id: 'contributions',
    title: 'Savings contribution',
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

  const [rules, setRules] = useState<RuleSection[]>(DEFAULT_RULES);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [ruleText, setRuleText] = useState('');
  const [err, setErr] = useState<string | null>(null);

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

  const handleAddRule = async () => {
    if (!title.trim()) {
      setErr('Please enter a title for the new rule');
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

    const newRule: RuleSection = {
      id: `rule_${Date.now()}`,
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      items: items.length > 0 ? items : [ruleText.trim()],
      isCustom: true,
      createdAt: new Date().toISOString(),
    };

    const updated = [...rules, newRule];
    await saveRulesToStorage(updated);

    // Reset form
    setTitle('');
    setSubtitle('');
    setRuleText('');
    setShowAdd(false);
    Alert.alert('Rule Added', `"${newRule.title}" has been added to applied rules.`);
  };

  const confirmDeleteRule = (ruleId: string, ruleTitle: string) => {
    Alert.alert(
      'Delete Rule',
      `Are you sure you want to delete "${ruleTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = rules.filter((r) => r.id !== ruleId);
            await saveRulesToStorage(updated);
          },
        },
      ]
    );
  };

  const confirmDeleteItem = (ruleId: string, itemIndex: number) => {
    Alert.alert('Delete Rule Item', 'Remove this bullet point?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = rules.map((r) => {
            if (r.id !== ruleId) return r;
            const newItems = r.items.filter((_, idx) => idx !== itemIndex);
            return { ...r, items: newItems };
          }).filter((r) => r.items.length > 0); // remove card if all items deleted
          await saveRulesToStorage(updated);
        },
      },
    ]);
  };

  const resetToDefaults = () => {
    Alert.alert(
      'Reset All Rules',
      'Restore the default group rules? Any custom rules will be cleared.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await saveRulesToStorage(DEFAULT_RULES);
            Alert.alert('Reset Complete', 'Default savings rules restored.');
          },
        },
      ]
    );
  };

  return (
    <Screen title="Savings rules">
      {/* Action header to add new applied rules */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T weight="700" size={16}>Applied Group Rules</T>
        <Pressable
          onPress={() => setShowAdd(!showAdd)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: c.accent + '22',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 10,
          }}>
          <Ionicons name={showAdd ? 'close-circle' : 'add-circle'} size={18} color={c.accent} />
          <T size={13} weight="700" color={c.accent}>{showAdd ? 'Close' : 'Add New Rule'}</T>
        </Pressable>
      </View>

      {/* Add Rule Form */}
      {showAdd && (
        <Card style={{ borderColor: c.accent, borderWidth: 1.5 }}>
          <T weight="700" size={16} color={c.accent}>Add New Rule Applied</T>
          <T size={13} muted>Specify the rule title (e.g. date, policy) and describe the requirements.</T>
          
          <Input
            label="Rule Title"
            placeholder="e.g. New rules — 15 November 2026"
            value={title}
            onChangeText={setTitle}
          />

          <Input
            label="Subtitle / Note (Optional)"
            placeholder="e.g. Agreed in the last group meeting"
            value={subtitle}
            onChangeText={setSubtitle}
          />

          <Input
            label="Rule Details (one per line)"
            placeholder="• Each member must deposit on time&#10;• Late penalty applies after day 20"
            multiline
            numberOfLines={4}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
            value={ruleText}
            onChangeText={setRuleText}
          />

          <ErrorText msg={err} />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" variant="ghost" onPress={() => setShowAdd(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Save Rule" onPress={handleAddRule} />
            </View>
          </View>
        </Card>
      )}

      {/* Render all rules */}
      {rules.map((rule) => (
        <Card key={rule.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <T weight="700" size={16}>{rule.title}</T>
            </View>
            {/* Delete rule button */}
            <Pressable
              onPress={() => confirmDeleteRule(rule.id, rule.title)}
              hitSlop={8}
              style={({ pressed }) => ({
                opacity: pressed ? 0.6 : 1,
                padding: 4,
              })}>
              <Ionicons name="trash-outline" size={20} color={c.danger} />
            </Pressable>
          </View>

          {rule.subtitle ? <T muted size={13}>{rule.subtitle}</T> : null}

          <View style={{ gap: 8, marginTop: 4 }}>
            {rule.items.map((item, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <T style={{ flex: 1 }}>• {item}</T>
                {/* Delete specific bullet point option */}
                <Pressable
                  onPress={() => confirmDeleteItem(rule.id, idx)}
                  hitSlop={6}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.7, paddingTop: 2 })}>
                  <Ionicons name="close" size={16} color={c.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        </Card>
      ))}

      {rules.length === 0 && (
        <Card>
          <T muted style={{ textAlign: 'center' }}>No savings rules currently defined.</T>
          <Button label="Restore Default Rules" variant="ghost" onPress={resetToDefaults} />
        </Card>
      )}

      <T muted size={12} style={{ textAlign: 'center', marginTop: 8 }}>
        All members must follow these rules so that our savings can grow.
      </T>

      <Pressable onPress={resetToDefaults} style={{ alignSelf: 'center', paddingVertical: 8 }}>
        <T size={12} color={c.muted} style={{ textDecorationLine: 'underline' }}>
          Reset rules to group defaults
        </T>
      </Pressable>
    </Screen>
  );
}

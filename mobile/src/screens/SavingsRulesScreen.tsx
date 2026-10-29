import React from 'react';
import { Card, Screen, T } from '../ui';

const loanFees = [
  'RWF 0 – 5,000: no profit charge',
  'RWF 5,001 – 14,000: RWF 1,500 profit charge',
  'RWF 14,001 – 22,000: RWF 3,000 profit charge',
  'RWF 22,001 – 35,000: RWF 4,000 profit charge',
  'RWF 35,001 – 50,000: RWF 5,000 profit charge',
  'Above RWF 50,000: RWF 6,500 profit charge',
];

export default function SavingsRulesScreen() {
  return (
    <Screen title="Savings rules">
      <Card>
        <T weight="700" size={16}>Savings contribution</T>
        <T muted size={13}>The savings group started on 1 January 2025 and had saved more than RWF 80,000 by 9 October 2025.</T>
        <T>• Each member contributes RWF 3,000 every month.</T>
        <T>• After three weeks of a new month, an unpaid contribution receives an additional RWF 1,500 charge.</T>
        <T>• A member with a genuine difficulty may temporarily be excused from contributions until the issue is resolved. Members without such a difficulty must continue contributing.</T>
      </Card>

      <Card>
        <T weight="700" size={16}>Loan profit charges</T>
        {loanFees.map((fee) => <T key={fee}>• {fee}</T>)}
      </Card>

      <Card>
        <T weight="700" size={16}>Loan repayment</T>
        <T>• A loan should be repaid on time. A member experiencing a genuine difficulty may receive a repayment extension of up to nine weeks, with at least 5% deducted or charged on the loan.</T>
        <T>• If a loan remains unpaid after three weeks, an additional RWF 1,500 is added to the borrowed amount, including its profit charge.</T>
        <T>• A member with an unpaid loan above RWF 50,000 may not take another loan unless there is a serious emergency.</T>
        <T>• If a member lends group money to a friend, the member remains responsible for repaying it if the friend does not pay.</T>
      </Card>

      <Card>
        <T weight="700" size={16}>New rules — 28 September 2026</T>
        <T>• Open a BPR account for depositing the group’s savings.</T>
        <T>• From 1 January 2027, the monthly contribution becomes RWF 5,000.</T>
        <T>• Every member must take RWF 30,000 within five months. The amount is repaid with the agreed profit charge. A member who does not take it must pay the profit charge plus RWF 3,000.</T>
      </Card>

      <T muted size={12} style={{ textAlign: 'center' }}>All members must follow these rules so that our savings can grow.</T>
    </Screen>
  );
}

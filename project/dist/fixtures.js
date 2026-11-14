window.bankingPresets = {
  fee_waiver: {
    id: 'fee_waiver',
    fileName: 'fee_waiver.cbl',
    label: 'Retail Banking · Monthly Maintenance Fee',
    title: 'Monthly Fee Waiver Bug',
    bugBadge: 'Planted Bug: Student under-25 check trapped inside $500 deposit IF-block',
    description: 'A monthly checking fee script accidentally hides the student fee waiver inside the direct-deposit requirement.',
    source: 'COBOL',
    target: 'Python',
    policy: [
      'Charge a $12 monthly maintenance fee by default.',
      'Waive the $12 fee ($0) if average balance is at least $1,500, or direct deposits total at least $500, or the customer is a student under age 25.',
      'Reject negative balances, negative deposits, or negative ages.'
    ],
    legacy: `       *> Faulty COBOL: Student waiver nested inside deposit check
           MOVE 12 TO MONTHLY-FEE
           IF AVG-BALANCE >= 1500
               MOVE 0 TO MONTHLY-FEE
           ELSE
               IF DEPOSITS >= 500
                   MOVE 0 TO MONTHLY-FEE
                   IF IS-STUDENT = 'Y' AND AGE < 25
                       MOVE 0 TO MONTHLY-FEE
                   END-IF
               END-IF
           END-IF`,
    rules: [
      'Charge a $12 monthly maintenance fee when no waiver applies.',
      'Waive the fee ($0) when average balance is at least $1,500.',
      'Waive the fee ($0) when qualifying direct deposits are at least $500.',
      'Waive the fee ($0) for any student under 25, even without $500 in direct deposits.',
      'Reject negative dollar amounts and invalid ages.'
    ],
    issue: 'The old COBOL code checks student status inside the $500 direct-deposit block (lines 8–10), charging eligible students $12 when they have no deposits. The bank policy makes the student waiver independent.',
    cases: [
      { name: 'High balance ($2,000 bal, $0 dep, non-student, 30)', x: [2000, 0, false, 30], old: '$0', expected: '$0' },
      { name: 'Qualifying deposit ($400 bal, $600 dep, non-student, 30)', x: [400, 600, false, 30], old: '$0', expected: '$0' },
      { name: 'Student under 25 ($400 bal, $0 dep, student, 21)', x: [400, 0, true, 21], old: '$12 (Bug)', expected: '$0' },
      { name: 'Standard fee ($400 bal, $0 dep, non-student, 30)', x: [400, 0, false, 30], old: '$12', expected: '$12' },
      { name: 'Balance boundary ($1,500 bal, $0 dep, non-student, 40)', x: [1500, 0, false, 40], old: '$0', expected: '$0' },
      { name: 'Deposit boundary ($100 bal, $500 dep, non-student, 40)', x: [100, 500, false, 40], old: '$0', expected: '$0' },
      { name: 'Student age 25 ($400 bal, $0 dep, student, 25)', x: [400, 0, true, 25], old: '$12', expected: '$12' },
      { name: 'Negative balance input (-$50 bal, $0 dep)', x: [-50, 0, false, 30], old: '$12 (Bug)', expected: 'Rejected' }
    ],
    code: `# Updated Python banking logic (verified against bank policy)
def monthly_fee(balance, deposits, student, age):
    if balance < 0 or deposits < 0 or age < 0:
        raise ValueError("Invalid negative input")
    if balance >= 1500 or deposits >= 500:
        return 0
    if student and age < 25:
        return 0
    return 12`,
    changes: [
      {
        id: 'CHG-01',
        kind: 'guard',
        kindLabel: 'Added Safety Check',
        oldRange: [1, 1],
        oldRefLabel: 'Old L1 (Missing check)',
        newRange: [3, 4],
        newRefLabel: 'New L3–L4',
        pointerText: '← CHG-01 · Added for Old L1 (Rejects negative inputs)',
        summary: 'Added a safety check to reject negative balances, deposits, or ages—preventing invalid customer data that the old COBOL did not guard against.'
      },
      {
        id: 'CHG-02',
        kind: 'keep',
        kindLabel: 'Preserved Rule',
        oldRange: [3, 7],
        oldRefLabel: 'Old L3–L7',
        newRange: [5, 6],
        newRefLabel: 'New L5–L6',
        pointerText: '← CHG-02 · From Old L3–L7 ($1,500 balance or $500 deposit)',
        summary: 'Preserved the $0 fee waiver when average balance is at least $1,500 (Old L3–L4) or direct deposits total at least $500 (Old L6–L7).'
      },
      {
        id: 'CHG-03',
        kind: 'fix',
        kindLabel: 'Bug Fixed',
        oldRange: [8, 10],
        oldRefLabel: 'Old L8–L10',
        newRange: [7, 8],
        newRefLabel: 'New L7–L8',
        pointerText: '← CHG-03 · Fixes Old L8–L10 (Un-nested student waiver)',
        summary: 'Moved the student under-25 waiver out from inside the $500 deposit IF-block (Old L8–L10) so eligible students receive the $0 fee on their own.'
      },
      {
        id: 'CHG-04',
        kind: 'keep',
        kindLabel: 'Preserved Default',
        oldRange: [2, 2],
        oldRefLabel: 'Old L2',
        newRange: [9, 9],
        newRefLabel: 'New L9',
        pointerText: '← CHG-04 · From Old L2 (Default $12 monthly fee)',
        summary: 'Keeps the standard $12 monthly fee when none of the three waiver conditions apply (replaces MOVE 12 TO MONTHLY-FEE in Old L2).'
      }
    ]
  },

  overdraft_trap: {
    id: 'overdraft_trap',
    fileName: 'overdraft_fee.cbl',
    label: 'Consumer Checking · Overdraft Protection',
    title: 'Overdraft Fee Trap Bug',
    bugBadge: 'Planted Bug: Charges $35 fee before checking linked savings & $50 cushion',
    description: 'An overdraft fee routine charges $35 immediately when checking is short, ignoring linked savings protection and the $50 cushion rule.',
    source: 'COBOL',
    target: 'Python',
    policy: [
      'Charge $0 when checking balance covers the purchase amount.',
      'Waive the overdraft fee ($0) when the shortfall is $50 or less under the $50 Cushion Rule.',
      'Waive the overdraft fee ($0) when the customer opted into Savings Protection and checking plus linked savings covers the purchase.',
      'Charge a $35 overdraft fee only when the shortfall exceeds $50 and linked savings cannot cover it. Reject negative balances or amounts.'
    ],
    legacy: `       *> Faulty COBOL: Charges $35 before savings transfer & cushion
           MOVE 0 TO OD-FEE
           IF CHECKING-BAL < TX-AMOUNT
               MOVE 35 TO OD-FEE
               IF OPTED-IN = 'Y' AND SAVINGS-BAL >= TX-AMOUNT
                   MOVE 0 TO OD-FEE
               END-IF
           ELSE
               MOVE 0 TO OD-FEE
           END-IF`,
    rules: [
      'Charge $0 when the checking balance covers the purchase amount.',
      'Waive the fee ($0) whenever the overdraft shortfall is $50 or less ($50 Cushion Rule).',
      'Waive the fee ($0) when opted into Savings Protection and combined checking + savings covers the purchase.',
      'Charge $35 only when the shortfall exceeds $50 and combined protection does not cover it.',
      'Reject negative account balances or negative transaction amounts.'
    ],
    issue: 'The old COBOL charges $35 on any checking shortfall (line 4), misses the $50 Cushion Rule completely, and checks if savings alone is >= TX-AMOUNT instead of combined CHECKING-BAL + SAVINGS-BAL (line 5).',
    cases: [
      { name: 'Checking covers purchase ($300 chk, $50 sav, $120 tx)', x: [300, 50, true, 120], old: '$0', expected: '$0' },
      { name: '$50 Cushion Rule ($100 chk, $0 sav, $140 tx — $40 short)', x: [100, 0, false, 140], old: '$35 (Bug)', expected: '$0' },
      { name: 'Combined savings covers ($100 chk, $150 sav, opted-in, $200 tx)', x: [100, 150, true, 200], old: '$35 (Bug)', expected: '$0' },
      { name: 'Unprotected overdraft > $50 ($50 chk, $0 sav, $150 tx)', x: [50, 0, false, 150], old: '$35', expected: '$35' },
      { name: 'Not opted-in to savings ($100 chk, $500 sav, opted-out, $200 tx)', x: [100, 500, false, 200], old: '$35', expected: '$35' },
      { name: 'Exact $50 cushion boundary ($100 chk, $0 sav, $150 tx)', x: [100, 0, false, 150], old: '$35 (Bug)', expected: '$0' },
      { name: 'Negative transaction amount ($100 chk, $50 sav, -$20 tx)', x: [100, 50, true, -20], old: '$0 (Bug)', expected: 'Rejected' }
    ],
    code: `# Updated Python overdraft fee logic (verified against bank policy)
def overdraft_fee(checking_bal, savings_bal, opted_in, tx_amount):
    if checking_bal < 0 or savings_bal < 0 or tx_amount < 0:
        raise ValueError("Invalid negative input")
    shortfall = tx_amount - checking_bal
    if shortfall <= 50:
        return 0
    if opted_in and (checking_bal + savings_bal) >= tx_amount:
        return 0
    return 35`,
    changes: [
      {
        id: 'CHG-01',
        kind: 'guard',
        kindLabel: 'Added Safety Check',
        oldRange: [1, 2],
        oldRefLabel: 'Old L1–L2 (Missing check)',
        newRange: [3, 4],
        newRefLabel: 'New L3–L4',
        pointerText: '← CHG-01 · Added for Old L1–L2 (Rejects negative amounts)',
        summary: 'Added input validation so negative checking balances, savings balances, or transaction amounts are immediately rejected.'
      },
      {
        id: 'CHG-02',
        kind: 'fix',
        kindLabel: 'Bug Fixed',
        oldRange: [3, 4],
        oldRefLabel: 'Old L3–L4',
        newRange: [5, 7],
        newRefLabel: 'New L5–L7',
        pointerText: '← CHG-02 · Fixes Old L3–L4 (Enforces $50 Cushion Rule)',
        summary: 'Calculates the exact shortfall and waives the fee ($0) when the shortfall is $50 or less, fixing Old L3–L4 which charged $35 on a $1 shortfall.'
      },
      {
        id: 'CHG-03',
        kind: 'fix',
        kindLabel: 'Bug Fixed',
        oldRange: [5, 7],
        oldRefLabel: 'Old L5–L7',
        newRange: [8, 9],
        newRefLabel: 'New L8–L9',
        pointerText: '← CHG-03 · Fixes Old L5–L7 (Uses combined checking + savings)',
        summary: 'Checks combined (checking_bal + savings_bal >= tx_amount) when opted in, fixing Old L5 which required savings alone to cover the entire purchase.'
      },
      {
        id: 'CHG-04',
        kind: 'keep',
        kindLabel: 'Preserved Fee',
        oldRange: [4, 4],
        oldRefLabel: 'Old L4',
        newRange: [10, 10],
        newRefLabel: 'New L10',
        pointerText: '← CHG-04 · From Old L4 ($35 fee when unprotected)',
        summary: 'Applies the $35 overdraft fee only after both the $50 Cushion Rule and Linked Savings Protection have been checked.'
      }
    ]
  },

  wire_limit: {
    id: 'wire_limit',
    fileName: 'wire_limit_check.cbl',
    label: 'Commercial Treasury · Wire Approvals',
    title: 'Wire Transfer Limit Bug',
    bugBadge: 'Planted Bug: International wires up to $25k auto-approved without $10k dual sign-off',
    description: 'A wire transfer approval script applies the $25,000 domestic auto-approval limit to international wires that require dual sign-off over $10,000.',
    source: 'COBOL',
    target: 'Python',
    policy: [
      'Auto-approve domestic wire transfers of $25,000 or less (return "APPROVED").',
      'Require dual-officer sign-off ("DUAL-APPROVAL") for international wires over $10,000, or domestic wires between $25,001 and $100,000.',
      'Hold any wire above $100,000 for executive compliance review ("EXEC-HOLD").',
      'Reject zero or negative wire transfer amounts.'
    ],
    legacy: `       *> Faulty COBOL: Ignores $10k international threshold under $25k
           IF WIRE-AMT > 100000
               MOVE 'EXEC-HOLD' TO WIRE-STATUS
           ELSE
               IF WIRE-AMT <= 25000
                   MOVE 'APPROVED' TO WIRE-STATUS
               ELSE
                   IF IS-INTL = 'Y' AND WIRE-AMT > 10000
                       MOVE 'DUAL-APPROVAL' TO WIRE-STATUS
                   ELSE
                       MOVE 'DUAL-APPROVAL' TO WIRE-STATUS
                   END-IF
               END-IF
           END-IF`,
    rules: [
      'Reject any wire transfer with a zero or negative dollar amount.',
      'Place any wire over $100,000 on executive compliance hold ("EXEC-HOLD").',
      'Require dual-officer approval ("DUAL-APPROVAL") for international wires above $10,000.',
      'Auto-approve ("APPROVED") international wires up to $10,000 and domestic wires up to $25,000.',
      'Require dual-officer approval ("DUAL-APPROVAL") for domestic wires between $25,001 and $100,000.'
    ],
    issue: 'Because Old L5 checks WIRE-AMT <= 25000 before checking IS-INTL = "Y" (Old L8), international wires between $10,001 and $25,000 are wrongly auto-approved without dual-officer sign-off.',
    cases: [
      { name: 'Domestic wire $15,000 (auto-approve)', x: [15000, false, 0, 0], old: 'APPROVED', expected: 'APPROVED' },
      { name: 'International wire $18,000 (needs dual approval)', x: [18000, true, 0, 0], old: 'APPROVED (Bug)', expected: 'DUAL-APPROVAL' },
      { name: 'International wire $8,500 (under $10k limit)', x: [8500, true, 0, 0], old: 'APPROVED', expected: 'APPROVED' },
      { name: 'Domestic wire $45,000 (over $25k domestic limit)', x: [45000, false, 0, 0], old: 'DUAL-APPROVAL', expected: 'DUAL-APPROVAL' },
      { name: 'High-value wire $150,000 (executive hold)', x: [150000, false, 0, 0], old: 'EXEC-HOLD', expected: 'EXEC-HOLD' },
      { name: 'Invalid negative wire (-$5,000)', x: [-5000, false, 0, 0], old: 'APPROVED (Bug)', expected: 'Rejected' }
    ],
    code: `# Updated Python wire approval logic (verified against bank policy)
def wire_status(wire_amt, is_intl):
    if wire_amt <= 0:
        raise ValueError("Invalid wire amount")
    if wire_amt > 100000:
        return "EXEC-HOLD"
    if is_intl and wire_amt > 10000:
        return "DUAL-APPROVAL"
    if wire_amt > 25000:
        return "DUAL-APPROVAL"
    return "APPROVED"`,
    changes: [
      {
        id: 'CHG-01',
        kind: 'guard',
        kindLabel: 'Added Safety Check',
        oldRange: [1, 1],
        oldRefLabel: 'Old L1 (Missing check)',
        newRange: [3, 4],
        newRefLabel: 'New L3–L4',
        pointerText: '← CHG-01 · Added for Old L1 (Rejects <= $0 wires)',
        summary: 'Rejects zero or negative wire amounts before evaluating approval thresholds (Old COBOL auto-approved negative amounts).'
      },
      {
        id: 'CHG-02',
        kind: 'keep',
        kindLabel: 'Preserved Cap',
        oldRange: [2, 3],
        oldRefLabel: 'Old L2–L3',
        newRange: [5, 6],
        newRefLabel: 'New L5–L6',
        pointerText: '← CHG-02 · From Old L2–L3 ($100k executive hold)',
        summary: 'Preserves the EXEC-HOLD compliance escalation for any wire transfer exceeding $100,000 (Old L2–L3).'
      },
      {
        id: 'CHG-03',
        kind: 'fix',
        kindLabel: 'Bug Fixed',
        oldRange: [5, 9],
        oldRefLabel: 'Old L5–L9',
        newRange: [7, 8],
        newRefLabel: 'New L7–L8',
        pointerText: '← CHG-03 · Fixes Old L5–L9 (Checks $10k intl limit first)',
        summary: 'Evaluates the $10,000 international wire limit before the $25,000 domestic check so $10k–$25k international wires require DUAL-APPROVAL.'
      },
      {
        id: 'CHG-04',
        kind: 'keep',
        kindLabel: 'Preserved Domestic Rule',
        oldRange: [5, 11],
        oldRefLabel: 'Old L5–L11',
        newRange: [9, 11],
        newRefLabel: 'New L9–L11',
        pointerText: '← CHG-04 · From Old L5–L11 ($25k domestic threshold)',
        summary: 'Requires DUAL-APPROVAL for domestic wires over $25,000 and returns APPROVED for qualifying lower-value wires.'
      }
    ]
  },

  loan_interest: {
    id: 'loan_interest',
    fileName: 'loan_interest_calc.cbl',
    label: 'Lending Operations · Grace Period & APR',
    title: 'Loan APR Penalty Bug',
    bugBadge: 'Planted Bug: Triggers 24% penalty APR on Day 1 late instead of after 15-day grace period',
    description: 'A personal loan rate calculator applies the 24.0% penalty APR on the very first day a payment is late, ignoring the mandatory 15-day grace period.',
    source: 'COBOL',
    target: 'Python',
    policy: [
      'Start from the customer base APR and subtract 0.5% when enrolled in Autopay, with a minimum APR floor of 4.0%.',
      'Honor a 15-day grace period: payments 1 to 15 days late keep their normal APR.',
      'Apply the 24.0% penalty APR only when a payment is more than 15 days late (days_late > 15).',
      'Reject negative base APRs or negative days late.'
    ],
    legacy: `       *> Faulty COBOL: Penalty APR triggered at DAYS-LATE > 0
           MOVE BASE-APR TO FINAL-APR
           IF DAYS-LATE > 0
               MOVE 24.0 TO FINAL-APR
           ELSE
               IF AUTOPAY = 'Y'
                   SUBTRACT 0.5 FROM FINAL-APR
               END-IF
           END-IF`,
    rules: [
      'Reject negative base APR values or negative days late.',
      'Apply the 24.0% penalty APR only after the 15-day grace period (when days late is greater than 15).',
      'Keep the customer eligible for the 0.5% Autopay discount during the 0–15 day grace period.',
      'Enforce a minimum APR floor of 4.0% after applying the 0.5% Autopay discount.'
    ],
    issue: 'Old L3 checks DAYS-LATE > 0 instead of DAYS-LATE > 15, penalizing customers who pay within the 15-day grace period and also missing the 4.0% minimum APR floor on Autopay discounts.',
    cases: [
      { name: 'On-time with Autopay (8.5% base, 0 days late, autopay)', x: [8.5, 0, true, 0], old: '8.0%', expected: '8.0%' },
      { name: 'Inside 15-day grace period (8.5% base, 7 days late, autopay)', x: [8.5, 7, true, 0], old: '24.0% (Bug)', expected: '8.0%' },
      { name: 'Day 15 grace boundary (9.0% base, 15 days late, no autopay)', x: [9.0, 15, false, 0], old: '24.0% (Bug)', expected: '9.0%' },
      { name: 'Past grace period (8.5% base, 19 days late, autopay)', x: [8.5, 19, true, 0], old: '24.0%', expected: '24.0%' },
      { name: 'Minimum 4.0% APR floor (4.2% promo base, 0 days late, autopay)', x: [4.2, 0, true, 0], old: '3.7% (Bug)', expected: '4.0%' },
      { name: 'Invalid negative days late (8.5% base, -3 days late)', x: [8.5, -3, false, 0], old: '8.5% (Bug)', expected: 'Rejected' }
    ],
    code: `# Updated Python loan APR calculation (verified against bank policy)
def effective_apr(base_apr, days_late, autopay):
    if base_apr < 0 or days_late < 0:
        raise ValueError("Invalid negative input")
    if days_late > 15:
        return 24.0
    if autopay:
        return max(4.0, round(base_apr - 0.5, 2))
    return round(base_apr, 2)`,
    changes: [
      {
        id: 'CHG-01',
        kind: 'guard',
        kindLabel: 'Added Safety Check',
        oldRange: [1, 2],
        oldRefLabel: 'Old L1–L2 (Missing check)',
        newRange: [3, 4],
        newRefLabel: 'New L3–L4',
        pointerText: '← CHG-01 · Added for Old L1–L2 (Rejects negative inputs)',
        summary: 'Added validation to reject negative base APRs or negative days-late counts.'
      },
      {
        id: 'CHG-02',
        kind: 'fix',
        kindLabel: 'Bug Fixed',
        oldRange: [3, 4],
        oldRefLabel: 'Old L3–L4',
        newRange: [5, 6],
        newRefLabel: 'New L5–L6',
        pointerText: '← CHG-02 · Fixes Old L3–L4 (Honors 15-day grace period)',
        summary: 'Changed penalty trigger from DAYS-LATE > 0 (Old L3) to days_late > 15 so customers paying within the 15-day grace period keep their standard rate.'
      },
      {
        id: 'CHG-03',
        kind: 'fix',
        kindLabel: 'Bug Fixed',
        oldRange: [6, 8],
        oldRefLabel: 'Old L6–L8',
        newRange: [7, 8],
        newRefLabel: 'New L7–L8',
        pointerText: '← CHG-03 · Fixes Old L6–L8 (Autopay discount + 4.0% floor)',
        summary: 'Applies the 0.5% Autopay discount during the grace period and enforces the 4.0% minimum APR floor.'
      },
      {
        id: 'CHG-04',
        kind: 'keep',
        kindLabel: 'Preserved Base Rate',
        oldRange: [2, 2],
        oldRefLabel: 'Old L2',
        newRange: [9, 9],
        newRefLabel: 'New L9',
        pointerText: '← CHG-04 · From Old L2 (Standard base APR)',
        summary: 'Returns the customer base APR when not enrolled in Autopay and within the 15-day grace period.'
      }
    ]
  }
};

// Keep backwards-compatible alias pointing to the active banking presets
window.demos = {
  bank: window.bankingPresets.fee_waiver
};

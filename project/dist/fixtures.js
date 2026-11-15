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
        oldRefLabel: 'Old Line 1 (Missing check)',
        newRange: [3, 4],
        newRefLabel: 'New Lines 3–4',
        pointerText: '← Note 1 · Added safety check (blocks negative inputs)',
        whatItDoes: 'Checks that average balance, deposits, and customer age are valid non-negative numbers before doing any math.',
        summary: 'Added a safety check to block negative balances, deposits, or ages so invalid customer numbers cannot slip through.'
      },
      {
        id: 'CHG-02',
        kind: 'keep',
        kindLabel: 'Kept Existing Rule',
        oldRange: [3, 7],
        oldRefLabel: 'Old Lines 3–7',
        newRange: [5, 6],
        newRefLabel: 'New Lines 5–6',
        pointerText: '← Note 2 · Kept $1,500 balance and $500 deposit waivers',
        whatItDoes: 'Waives the $12 monthly fee when average balance is at least $1,500 or direct deposits total at least $500.',
        summary: 'Kept the $0 fee waiver whenever average balance is at least $1,500 or direct deposits total at least $500.'
      },
      {
        id: 'CHG-03',
        kind: 'fix',
        kindLabel: 'Fixed Rule Mistake',
        oldRange: [8, 10],
        oldRefLabel: 'Old Lines 8–10',
        newRange: [7, 8],
        newRefLabel: 'New Lines 7–8',
        pointerText: '← Note 3 · Fixed student waiver check',
        whatItDoes: 'Waives the $12 monthly fee for students under age 25.',
        summary: 'Moved the student under-25 waiver out from inside the $500 direct-deposit check so qualifying students get their $0 fee automatically.'
      },
      {
        id: 'CHG-04',
        kind: 'keep',
        kindLabel: 'Kept Standard Fee',
        oldRange: [2, 2],
        oldRefLabel: 'Old Line 2',
        newRange: [9, 9],
        newRefLabel: 'New Line 9',
        pointerText: '← Note 4 · Kept standard $12 monthly fee',
        whatItDoes: 'Applies the normal $12 monthly checking fee when none of the three waiver rules apply.',
        summary: 'Keeps the standard $12 monthly fee when none of the three waiver rules apply.'
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
        oldRange: [1, 1],
        oldRefLabel: 'Old Line 1 (Missing check)',
        newRange: [3, 4],
        newRefLabel: 'New Lines 3–4',
        pointerText: '← Note 1 · Blocks negative amounts',
        whatItDoes: 'Checks that checking balance, savings balance, and purchase amount are non-negative before checking overdraft fees.',
        summary: 'Added a safety check so negative checking balances, savings balances, or purchase amounts are blocked right away.'
      },
      {
        id: 'CHG-02',
        kind: 'fix',
        kindLabel: 'Fixed Rule Mistake',
        oldRange: [2, 3],
        oldRefLabel: 'Old Lines 2–3',
        newRange: [5, 7],
        newRefLabel: 'New Lines 5–7',
        pointerText: '← Note 2 · Honors the $50 cushion rule',
        whatItDoes: 'Calculates the checking shortfall and waives the overdraft fee ($0) if the account is short by $50 or less.',
        summary: 'Checks how much checking is short and waives the fee ($0) when the shortfall is $50 or less, fixing the old rule that charged $35 even for a $1 shortfall.'
      },
      {
        id: 'CHG-03',
        kind: 'fix',
        kindLabel: 'Fixed Rule Mistake',
        oldRange: [5, 7],
        oldRefLabel: 'Old Lines 5–7',
        newRange: [8, 9],
        newRefLabel: 'New Lines 8–9',
        pointerText: '← Note 3 · Combines checking + savings balances',
        whatItDoes: 'Checks linked Savings Protection using combined checking plus savings balances when the customer opted in.',
        summary: 'Checks whether checking and savings combined cover the purchase when opted in, fixing the old rule that required savings alone to pay the full amount.'
      },
      {
        id: 'CHG-04',
        kind: 'keep',
        kindLabel: 'Kept Standard Fee',
        oldRange: [4, 4],
        oldRefLabel: 'Old Line 4',
        newRange: [10, 10],
        newRefLabel: 'New Line 10',
        pointerText: '← Note 4 · Charges $35 only when unprotected',
        whatItDoes: 'Charges the standard $35 overdraft fee only when the shortfall exceeds $50 and linked savings cannot cover it.',
        summary: 'Applies the $35 overdraft fee only after checking both the $50 cushion rule and linked savings protection.'
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
        oldRefLabel: 'Old Line 1 (Missing check)',
        newRange: [3, 4],
        newRefLabel: 'New Lines 3–4',
        pointerText: '← Note 1 · Blocks $0 or negative wires',
        whatItDoes: 'Checks that the wire transfer amount is greater than $0 before checking approval limits.',
        summary: 'Stops zero or negative wire amounts before checking approval limits (the old file mistakenly approved negative amounts).'
      },
      {
        id: 'CHG-02',
        kind: 'keep',
        kindLabel: 'Kept Review Limit',
        oldRange: [2, 3],
        oldRefLabel: 'Old Lines 2–3',
        newRange: [5, 6],
        newRefLabel: 'New Lines 5–6',
        pointerText: '← Note 2 · Kept $100k executive review hold',
        whatItDoes: 'Places any wire transfer over $100,000 on executive compliance hold ("EXEC-HOLD").',
        summary: 'Keeps the executive compliance hold for any wire transfer over $100,000.'
      },
      {
        id: 'CHG-03',
        kind: 'fix',
        kindLabel: 'Fixed Rule Mistake',
        oldRange: [8, 9],
        oldRefLabel: 'Old Lines 8–9',
        newRange: [7, 8],
        newRefLabel: 'New Lines 7–8',
        pointerText: '← Note 3 · Checks $10k international limit first',
        whatItDoes: 'Requires two-person sign-off ("DUAL-APPROVAL") for international wires over $10,000.',
        summary: 'Checks the $10,000 international wire limit before the $25,000 domestic check so $10k–$25k international wires require two-person sign-off.'
      },
      {
        id: 'CHG-04',
        kind: 'keep',
        kindLabel: 'Kept Domestic Rule',
        oldRange: [5, 6],
        oldRefLabel: 'Old Lines 5–6',
        newRange: [9, 11],
        newRefLabel: 'New Lines 9–11',
        pointerText: '← Note 4 · Kept $25k domestic limit',
        whatItDoes: 'Requires two-person sign-off above $25,000 and auto-approves smaller qualifying wires ("APPROVED").',
        summary: 'Requires two-person sign-off for domestic wires over $25,000 and auto-approves qualifying smaller wires.'
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
        oldRange: [1, 1],
        oldRefLabel: 'Old Line 1 (Missing check)',
        newRange: [3, 4],
        newRefLabel: 'New Lines 3–4',
        pointerText: '← Note 1 · Blocks negative rates or days late',
        whatItDoes: 'Checks that the base interest rate and days-late count are not negative before calculating.',
        summary: 'Added a safety check to block negative interest rates or negative days-late counts.'
      },
      {
        id: 'CHG-02',
        kind: 'fix',
        kindLabel: 'Fixed Rule Mistake',
        oldRange: [3, 4],
        oldRefLabel: 'Old Lines 3–4',
        newRange: [5, 6],
        newRefLabel: 'New Lines 5–6',
        pointerText: '← Note 2 · Restores 15-day grace period',
        whatItDoes: 'Applies the 24.0% penalty rate only when a payment is more than 15 days late.',
        summary: 'Changed the late penalty trigger so borrowers who pay within the 15-day grace period keep their normal interest rate instead of getting hit on Day 1.'
      },
      {
        id: 'CHG-03',
        kind: 'fix',
        kindLabel: 'Fixed Rule Mistake',
        oldRange: [6, 8],
        oldRefLabel: 'Old Lines 6–8',
        newRange: [7, 8],
        newRefLabel: 'New Lines 7–8',
        pointerText: '← Note 3 · Applies autopay discount + 4.0% floor',
        whatItDoes: 'Subtracts the 0.5% Autopay discount during the grace period while enforcing a 4.0% minimum rate.',
        summary: 'Applies the 0.5% Autopay discount during the grace period while making sure the rate never drops below the 4.0% minimum.'
      },
      {
        id: 'CHG-04',
        kind: 'keep',
        kindLabel: 'Kept Base Rate',
        oldRange: [2, 2],
        oldRefLabel: 'Old Line 2',
        newRange: [9, 9],
        newRefLabel: 'New Line 9',
        pointerText: '← Note 4 · Kept standard customer rate',
        whatItDoes: 'Returns the borrower’s standard base interest rate when not on Autopay and within the 15-day grace period.',
        summary: 'Keeps the borrower’s standard interest rate when they are not on Autopay and are within the 15-day grace period.'
      }
    ]
  }
};

// Keep backwards-compatible alias pointing to the active banking presets
window.demos = {
  bank: window.bankingPresets.fee_waiver
};

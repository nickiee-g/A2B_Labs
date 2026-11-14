# Fictional demo scenarios

These are designed fixtures, not real company systems. Tables describe expected behavior to verify, not results already observed from execution. Use exact decimal arithmetic for currency and document input validation and rounding assumptions.

## 1. Banking: COBOL → Python

### Intended policy

- Standard monthly fee: $12.
- Waive it if average monthly balance is at least $1,500, **or** qualifying monthly direct deposits total at least $500, **or** the customer is a student under 25.
- Multiple qualifying waivers still result in a $0 fee.
- Reject negative balance/deposit inputs and invalid ages in the fixture, or clearly document another chosen policy before generating tests.

### Planted defect

The legacy program checks the student waiver only inside the direct-deposit condition. A qualifying student with insufficient deposits and balance is incorrectly charged. Other waiver conditions should function independently.

| Case | Balance | Deposits | Student / age | Expected legacy fee | Expected policy fee |
| --- | ---: | ---: | --- | ---: | ---: |
| A | $2,000 | $0 | No / 30 | $0 | $0 |
| B | $400 | $600 | No / 30 | $0 | $0 |
| C | $400 | $0 | Yes / 21 | $12 | $0 |
| D | $400 | $0 | No / 30 | $12 | $12 |
| E | $1,500 | $0 | No / 30 | $0 | $0 |
| F | $400 | $0 | Yes / 25 | $12 | $12 |

Case C is an intentional behavior change after approval. Run the COBOL and generated Python if possible and record actual outputs separately from this table.

## 2. Retail inventory: Oracle PL/SQL → MySQL stored procedure

### Intended policy

- Available inventory = on-hand units minus reserved units.
- Reorder when available inventory is at or below the reorder point.
- Suggested quantity is max(0, target stock − available inventory).
- If reserved units exceed on-hand units, flag the item for review and do not create an automatic order.
- Treat units and thresholds as nonnegative whole numbers; reject invalid inputs or flag for review consistently.

### Planted defect

After checking for over-reservation, the legacy routine compares **on-hand** units, rather than **available** units, to the reorder point. When it does reorder, it calculates the quantity using available inventory. This can cause a missed reorder even when inventory is largely committed.

| Item | On hand | Reserved | Reorder point | Target | Expected legacy decision | Expected policy decision |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| A | 100 | 10 | 30 | 120 | No reorder | No reorder (90 available) |
| B | 50 | 30 | 25 | 100 | No reorder | Reorder 80 (20 available) |
| C | 20 | 0 | 25 | 100 | Reorder 80 | Reorder 80 |
| D | 10 | 15 | 25 | 100 | Review; no order | Review; no order |
| E | 25 | 0 | 25 | 100 | Reorder 75 | Reorder 75 |

Case B is an approved change. Include schema, sample rows, exact target MySQL version, reset instructions, and expected outputs. Do not call MySQL results passed unless the generated SQL actually ran against MySQL.

## Fixture generation prompt

> Generate a short, self-contained fictional legacy program for the following policy and language. Implement exactly the specified defect, while otherwise following the policy. Keep the program and policy separate. Provide the source, actual implemented rules, test inputs, independently understandable calculations for expected legacy and intended-policy outputs, and commands or setup to run it. Include normal, boundary, defect-triggering, and invalid-input cases. Use synthetic data. Do not claim to have executed anything unless you actually did. For database examples include schema, seed data, exact database version, and cleanup steps.
>
> Policy: [paste policy]  
> Source language: [COBOL or Oracle PL/SQL]  
> Planted defect: [paste defect]

Review generated code against every table row and run it where possible. A separate AI review can help, but it is not independent proof.

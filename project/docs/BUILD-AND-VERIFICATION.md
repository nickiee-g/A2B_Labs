# Build and verification guide

## Implementation sequence

1. **Create the shell:** A2B Labs title, concise explanation, four visible steps, and a prominent “Try a demo” button. Deploy early.
2. **Add a fixture:** Load the banking source and fictional policy separately. Start with a manually reviewed fixture; add retail once the main path works.
3. **Analyze:** Send source and policy to an AI endpoint. Return structured observed rules, relevant source references where available, potential policy conflicts, and uncertainty. Make clear that proposed issues require review.
4. **Review:** Provide editable rule cards with keep, edit, and drop actions. Show the approved specification before generation.
5. **Generate:** Send the approved specification and source context to the AI. Show generated code and any assumptions. Preserve the approved rule text used for that run.
6. **Compare:** Display source and target code; show tests and intentional behavior differences. Distinguish actual execution from expected or simulated results.
7. **Harden the demo:** Add loading and failure messages, retry, input limits, and a simple reset. Test the deployed link outside the creator's account.

Use a server-side endpoint for any AI call that requires a secret. Never put an API key in browser code, a public repository, or screenshots. Use only fictional data in the public demo. If source code is sent to a third-party model, state that fact; do not claim company-only or on-premises processing unless implemented and verified.

## Verification

- [ ] Two people review the intended policy and hand-calculate expected outputs.
- [ ] Run the legacy fixture where feasible; record the environment and actual outputs. If it cannot be run, label outcomes as reviewed expectations.
- [ ] Test the generated target against normal, boundary, defect-triggering, and invalid-input cases where supported. Record inputs, expected result, actual result, and environment.
- [ ] Confirm intentional changes match approved rules; unchanged cases should remain consistent where appropriate.
- [ ] Run a deliberately incorrect target implementation to confirm at least one check fails.
- [ ] Run a test after editing a rule to confirm generation uses the edited specification.
- [ ] Check error and loading states, sample reset, and public access on a second device.
- [ ] A nontechnical tester can explain what to do and identify which rule changed. Record feedback honestly; usability feedback is not proof of customer demand.

A second AI can review a fixture or generated code, but agreement between models does not prove correctness. Passing selected examples is evidence only for the cases and conditions tested.

## Execution safety

Do not execute arbitrary browser-submitted or model-generated code on the web server without proper isolation. A constrained, pre-approved fixture is a practical fallback. Be precise: a precomputed answer is not a live execution, and displaying code is not a successful compilation. If target code is not run, mark tests “not run,” not “passed.”

## Prompt for the builder

> Build a responsive A2B Labs prototype for a nontechnical policy reviewer. Guide the user through selecting a fictional legacy-code sample, reviewing source and intended policy, extracting observed rules and potential conflicts, keeping/editing/dropping rules, approving the specification, generating target code, and comparing code and test results. Start with the banking fixture in DEMO-SCENARIOS.md. Use clear language and accessible controls. Label simulated, expected, unverified, and actually executed results accurately. Do not claim automatic detection of all bugs or production privacy. Use server-side secrets for live AI calls. Explain how to deploy, run, and verify each feature. Build incrementally and test each step.

## Prompt for an independent review

> Review this legacy fixture against the separate policy and test table. Explain the actual control flow, identify cases where observed behavior differs from the policy, and check every expected result. Do not assume the described defect is present. Identify uncertainty and provide commands to execute the program if possible. Do not claim execution unless you actually run it.

## Optional estimates

If added, expose assumptions: baseline hours, assisted hours, and hourly cost; estimate savings as (baseline hours − assisted hours) × hourly cost. Label all values illustrative. Lines of code alone do not establish actual effort or savings.

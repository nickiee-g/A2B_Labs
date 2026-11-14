# Roadmap and scope

## Product and intended user

**Problem:** Business logic is buried in legacy programs. Direct translation can carry an existing mistake into a new system, while nontechnical policy owners may struggle to review the result.

**Initial user hypothesis:** A business operations analyst who understands policies but does not maintain the code. A modernization or technology lead would be a potential buyer. These are hypotheses, not verified customer research.

**Core promise:** Make observed behavior and proposed business rules understandable, let a person approve changes, and show evidence from tests of the resulting code.

## MVP

- [ ] A judge can open the deployed app and select a fictional demo.
- [ ] Show source code and the intended fictional policy separately.
- [ ] Use AI to explain observed behavior and extract individual, editable rules.
- [ ] Let the reviewer keep, edit, or drop rules and approve the resulting specification.
- [ ] Generate target code using the approved specification and source as context.
- [ ] Display source and generated code side by side.
- [ ] Display test inputs, expected outputs, actual outputs when executed, and pass/fail or clearly labeled unverified status. Explain intentional changes.
- [ ] Provide a usable error state and an understandable path through the sample.

Build banking first, then add the retail scenario if the first flow works. See [demo specifications](DEMO-SCENARIOS.md).

## Out of scope unless time remains

Broad language support, production enterprise tenancy, a secure arbitrary-code runner, autonomous correction of every bug, and real customer data. Time/cost savings are optional and should be clearly labeled illustrative assumptions, not verified savings. If used, show baseline hours, assisted hours, hourly rate, and calculation.

## Timeline

Deadlines below are as reported by the team; confirm time zone and exact organizer rules. Work can continue after the Saturday commit according to the current understanding.

| Checkpoint | Work | Exit condition |
| --- | --- | --- |
| Friday evening | Confirm requirements and roles; create fictional policies and expected outputs; start the Site and deployment. | Team agrees on the primary fixture and can open an initial deployment. |
| Saturday morning | Build the banking path, from sample selection through rule review; add generation and comparison. | At least one end-to-end path works or has a clearly labeled demo fallback. |
| Before Saturday 2 p.m. | Publish and submit the project link. Check in a private browser or on another device. | Judges can open the intended link without relying on your account. |
| Saturday afternoon | Improve AI integration and controlled tests; add retail only when banking is stable. | Expected versus actual results are accurate and execution status is honest. |
| Before Saturday 8 p.m. | Complete the organizer-required commit and verify its destination and timestamp. | Required commit is confirmed; do not assume a deployment substitutes for it. |
| Saturday night | Fix demo blockers, polish copy, prepare backup, gather usability feedback. | A teammate can run the demo without assistance. |
| Sunday morning | Check the deployed version, rehearse, and complete submission materials. | Submit before noon with time to resolve problems. |

## Divide the work

- **Person A — experience and deployment:** guided screens, copy, accessibility, link, and visual polish.
- **Person B — examples and verification:** policies, fixtures, AI prompts, expected outputs, and test evidence.
- **Both:** agree on interfaces and sample behavior, integrate, review each other's work, and rehearse.

## Scope cuts, in order

1. Remove the savings calculator.
2. Limit input to curated examples rather than arbitrary pasted code.
3. Defer the second scenario.
4. If source execution is unavailable, label legacy outputs as reviewed expectations. Do not label target outputs as passed without running them.

Preserve the central story: human-reviewed rules lead to generated code and honestly labeled evidence.

## Technology choices

Use Sites as the working app and deployment platform if public access is available. Its workflow maintains source history; whether that fulfills the hackathon's specific commit rule must be confirmed. VividSites can provide visual inspiration, but avoid building two independent frontends. Use an AI coding assistant and Google AI Ultra for development and review; live app calls require a separately configured API and server-side secret handling. Verify current API billing and limits at https://ai.google.dev/gemini-api/docs/google-ai-plans.

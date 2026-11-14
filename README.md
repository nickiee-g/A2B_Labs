# A2B Labs hackathon guide

A2B Labs helps teams turn legacy code into reviewable business rules, approve changes, and generate modern code with visible test evidence.

## Start here

1. [Roadmap](ROADMAP.md) — scope, ownership, milestones, and decisions.
2. [Demo scenarios](DEMO-SCENARIOS.md) — fictional banking and retail examples, policies, and expected results.
3. [Build and verification guide](BUILD-AND-VERIFICATION.md) — implementation steps, testing, security, and prompts.
4. [Submission and pitch checklist](SUBMISSION-AND-PITCH.md) — deadlines, judging criteria, and demo script.

## Central workflow

**Legacy code + intended policy → observed rules → human review → approved specification → generated code → test evidence.**

The policy is essential: code alone may reveal behavior, but it cannot establish the business owner's intent. AI identifies possible issues; a reviewer decides what should change. Test cases provide evidence for the cases run, not a guarantee of correctness.

## Decisions to confirm

- Confirm the precise 8 p.m. commit requirement and whether the Site's source history qualifies or a particular GitHub repository is required.
- Confirm whether the 2 p.m. link must contain a working app and whether judges can access the published Site without signing in.
- Confirm all submission requirements, time zone, and whether public publishing is available.
- Choose the AI provider and verify API access, pricing, and usage limits. A Google AI Ultra subscription does not automatically cover Gemini API billing.
- Retail inventory is the proposed second industry; healthcare administration remains an option.

All example programs and customer records must be fictional. This guide describes a hackathon prototype, not a production-ready system.

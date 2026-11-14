# A2B Labs — local development

A local application for reviewing legacy code and policy, approving AI-suggested rules, and generating target code. The planning guides are in `docs/`.

## Start with Gemini (default)

1. Get a Gemini API key from Google AI Studio (`https://aistudio.google.com/apikey`).
2. Save it privately to `project/.env` (or `~/Desktop/A2B-Labs-Gemini-Key.txt`) without echoing it to your terminal history:

```sh
printf "Enter GEMINI_API_KEY (typing hidden): " && read -s val && echo && echo "GEMINI_API_KEY=$val" >> .env && echo "Saved."
python3 server.py
```

The default Gemini model is `gemini-3.8-flash` (override with `A2B_MODEL`). Key changes in `.env` or `~/Desktop/A2B-Labs-Gemini-Key.txt` are picked up automatically on the next request without restarting the server.

## Use OpenAI instead

Alternatively, run with `A2B_PROVIDER=openai` and put your OpenAI key in `project/.env` (`OPENAI_API_KEY=...`), your shell environment, or `~/Desktop/A2B-Labs-API-Key.txt`:

```sh
A2B_PROVIDER=openai python3 server.py
```

3. Open http://localhost:8765. Stop with Ctrl+C. If that port is already occupied, start with `PORT=8766 python3 server.py` and open http://localhost:8766.

The key stays on the local server and is not sent to the browser. Do not paste a key into chat or commit it to a repository. API calls may incur provider charges. Optional: set `A2B_MODEL` to a model your API project can access (default `gemini-3.8-flash` for Gemini, `gpt-4.1-mini` for OpenAI).

## Current behavior and limits

- Choose and edit a fictional sample, or paste your own source and intended policy.
- Analyze with the configured provider; review, edit, and keep/drop rules.
- Generate code and suggested tests using the approved rules. Download the generated code.
- The banking results screen can run seven controlled JavaScript reference-model checks. These compare fixed legacy and policy models against fixed expectations; they do not execute the displayed code or reflect edits to rules. AI-suggested tests are **not run**. Generated code is not executed, compiled, or verified. The included source samples are excerpts, not complete runnable legacy applications.
- Source and policy are sent to the selected external provider. Use synthetic examples; this local development server has no user accounts, organization isolation, or production security controls. It binds to localhost only and is not intended for public deployment.
- AI output can be wrong or incomplete; a human must review the policy and test outcomes.

The app needs Python 3 and internet access for AI calls; it uses no third-party Python packages. To run without a key, the interface loads but AI requests clearly report setup is required.

## Run generated Python tests (banking fixture)

This optional local development feature requires Docker Desktop, running locally. Install it from https://www.docker.com/products/docker-desktop/ and start it, then run `docker pull python:3.12-alpine` once. Restart the A2B server after updating its code. On the banking result page, select **Test generated Python**.

The tests expect the generated code to provide `monthly_fee(balance, deposits, student, age)` and compare its results with the original sample policy. They do not execute the COBOL excerpt, and the fixed expectations do not change when rules are edited. Generated code runs in a disposable container without networking or host mounts, with a read-only filesystem, restricted resources, and a timeout. This is a local hackathon prototype, not a security guarantee or an internet-facing multi-tenant execution service. Container runs require a working Docker daemon. The image is not pulled automatically.

## Retail MySQL checks

Docker Desktop must be running and the `mysql:8.4` image must be present (`docker pull mysql:8.4`). The retail example requests a standalone `a2b_inventory` procedure with a fixed interface. The app runs five original-policy cases in a disposable network-isolated MySQL container. Edited policy choices may intentionally differ from those fixed expectations. SQL creation errors are shown as errors, not passes. These checks execute generated MySQL, not the original Oracle excerpt; AI-suggested additional checks remain unexecuted unless explicitly added to the test harness.

## Additional suggested checks

New generations include structured test inputs and expected values alongside plain-language suggestions. Select the suggestions whose expected outcomes you have reviewed, then choose **Run selected suggestions**. Selected cases execute against the generated code in the same Docker runners. The expected values are AI suggestions, not independently proven truth. Older generations without structured values must be regenerated before their suggestions can run. At most 20 cases may be submitted per run; the server validates types before using inputs in the runner.

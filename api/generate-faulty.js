import { callStructuredModel, jsonResponse, readJsonBody, verifySameOrigin } from './_ai.js';

export async function POST(request) {
  try {
    if (!verifySameOrigin(request)) {
      return jsonResponse(403, { error: 'Requests must originate from this app.' });
    }
    const { data, errorResponse } = await readJsonBody(request);
    if (errorResponse) return errorResponse;

    const scenarioHint = String(data.scenario || 'fee or threshold rule check').slice(0, 200);
    const context =
      `Scenario request: ${scenarioHint}\n` +
      'Create a short, realistic 10-to-14 line COBOL excerpt that contains an intentional business logic bug (such as a wrongly nested IF check, a missing threshold check, or an order-of-operations rule trap), along with the intended plain-English policy that the code was supposed to follow.';
    const instruction =
      'Return only JSON: {"fileName":"...","title":"...","bugBadge":"...","description":"...","source":"...","policy":"...","issue":"..."}. Write description, policy (3-4 sentences separated by newlines), and issue in clear, everyday plain English for non-technical reviewers.';

    return await callStructuredModel({ instruction, context });
  } catch (err) {
    console.error('POST /api/generate-faulty failed:', err);
    return jsonResponse(500, { error: 'Unexpected server error while generating sample.' });
  }
}

export default {
  fetch(request) {
    if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });
    return POST(request);
  }
};

import { activeModel, activeProvider, apiKey, jsonResponse } from './_ai.js';

export async function GET() {
  try {
    const provider = activeProvider();
    return jsonResponse(200, {
      configured: Boolean(apiKey(provider)),
      model: activeModel(provider),
      provider
    });
  } catch (err) {
    console.error('GET /api/status failed:', err);
    return jsonResponse(500, { configured: false, error: 'Failed to check AI status.' });
  }
}

export default {
  fetch(request) {
    if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' });
    return GET(request);
  }
};

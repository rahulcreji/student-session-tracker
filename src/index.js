import * as dashboard from '../functions/api/dashboard.js';
import * as students from '../functions/api/students.js';
import * as studentById from '../functions/api/students/[id].js';
import * as sessionById from '../functions/api/sessions/[id].js';
import * as sessionWeekend from '../functions/api/sessions/weekend.js';

async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  const makeContext = (params = {}) => ({
    request,
    env,
    params
  });

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  // GET /api/dashboard
  if (path === '/api/dashboard' && method === 'GET') {
    return dashboard.onRequestGet(makeContext());
  }

  // GET or POST /api/students
  if (path === '/api/students') {
    if (method === 'GET') return students.onRequestGet(makeContext());
    if (method === 'POST') return students.onRequestPost(makeContext());
  }

  // POST /api/sessions/weekend
  if (path === '/api/sessions/weekend' && method === 'POST') {
    return sessionWeekend.onRequestPost(makeContext());
  }

  // PATCH /api/sessions/:id
  const sessionMatch = path.match(/^\/api\/sessions\/(\d+)$/);
  if (sessionMatch) {
    const id = sessionMatch[1];
    if (method === 'PATCH') return sessionById.onRequestPatch(makeContext({ id }));
  }

  // GET or DELETE /api/students/:id
  const studentMatch = path.match(/^\/api\/students\/(\d+)$/);
  if (studentMatch) {
    const id = studentMatch[1];
    if (method === 'GET') return studentById.onRequestGet(makeContext({ id }));
    if (method === 'DELETE') return studentById.onRequestDelete(makeContext({ id }));
  }

  return new Response(JSON.stringify({ success: false, error: `Route not found: ${method} ${path}` }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route API requests through serverless handlers
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }

    // Serve static assets from public/
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  }
};

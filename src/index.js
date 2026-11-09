/**
 * Cloudflare Worker entry point (used by `npx wrangler deploy` / `npx wrangler dev`).
 *
 * Static files in ./public are served directly by Workers Static Assets.
 * Only /api/* requests reach this Worker (see run_worker_first in wrangler.toml),
 * and are dispatched to the same handlers in ./functions/api that Cloudflare Pages
 * would auto-route, so the code works on both platforms.
 */
import * as health from '../functions/api/health.js';
import * as dashboard from '../functions/api/dashboard.js';
import * as students from '../functions/api/students.js';
import * as studentById from '../functions/api/students/[id].js';
import * as sessionById from '../functions/api/sessions/[id].js';
import * as sessionWeekend from '../functions/api/sessions/weekend.js';
import * as sessionsCloseDays from '../functions/api/sessions/close-days.js';
import * as schedule from '../functions/api/schedule.js';
import { json } from '../functions/api/_utils.js';

// [pattern, { METHOD: handler }]
const routes = [
  [/^\/api\/health$/, { GET: health.onRequestGet }],
  [/^\/api\/dashboard$/, { GET: dashboard.onRequestGet }],
  [/^\/api\/students$/, { GET: students.onRequestGet, POST: students.onRequestPost }],
  [/^\/api\/students\/(?<id>\d+)$/, { GET: studentById.onRequestGet, DELETE: studentById.onRequestDelete }],
  [/^\/api\/schedule$/, { GET: schedule.onRequestGet }],
  [/^\/api\/sessions\/weekend$/, { POST: sessionWeekend.onRequestPost }],
  [/^\/api\/sessions\/close-days$/, { POST: sessionsCloseDays.onRequestPost }],
  [/^\/api\/sessions\/(?<id>\d+)$/, { PATCH: sessionById.onRequestPatch, DELETE: sessionById.onRequestDelete }],
];

async function handleApiRequest(request, env) {
  const { pathname } = new URL(request.url);
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  for (const [pattern, handlers] of routes) {
    const match = pathname.match(pattern);
    if (!match) continue;

    const handler = handlers[method];
    if (!handler) {
      return json(
        { success: false, error: `Method ${method} not allowed on ${pathname}` },
        405,
        { Allow: Object.keys(handlers).join(', ') }
      );
    }
    return handler({ request, env, params: { ...(match.groups || {}) } });
  }

  return json({ success: false, error: `Route not found: ${method} ${pathname}` }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApiRequest(request, env);
      } catch (err) {
        return json({ success: false, error: `Unexpected server error: ${err.message}` }, 500);
      }
    }

    // Non-API paths are normally served by static assets before reaching here.
    return new Response('Not found', { status: 404 });
  },
};

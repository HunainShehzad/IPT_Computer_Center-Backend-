/**
 * lib/cors.js
 *
 * Central CORS helper for every backend API route.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The frontend (http://localhost:3000) calls the backend (http://localhost:4000)
 * from the browser.  Browsers enforce the Same-Origin Policy, so every response
 * from the backend must include the correct Access-Control-* headers or the
 * browser will block the response and show a CORS error.
 *
 * HOW IT WORKS
 * ------------
 * 1.  corsHeaders()    — returns the header object. Reads FRONTEND_URL from env
 *                        so it works in production without code changes.
 * 2.  withCors()       — attaches those headers to any NextResponse before it
 *                        is returned from a route handler.
 * 3.  optionsResponse()— returns a bare 204 response for OPTIONS preflight
 *                        requests. The browser sends an OPTIONS request first
 *                        to ask "are you allowed to accept my real request?"
 *                        We must reply with 2xx + the right headers.
 *
 * EVERY route handler must:
 *   - export function OPTIONS() { return optionsResponse(); }
 *   - wrap every other response with withCors(...)
 */

/**
 * Returns the CORS headers that every response needs.
 *
 * Supports multiple allowed origins so the app works from both localhost and
 * any device on the local network (e.g. http://192.168.2.147:3000).
 *
 * FRONTEND_URL  — primary origin (set in .env.local)
 * FRONTEND_URL_LAN — optional LAN origin (e.g. http://192.168.2.147:3000)
 *
 * When the request carries an Origin header that matches one of the allowed
 * origins, we reflect that origin back. This is required for credentialed
 * cross-origin requests — browsers reject a wildcard (*) when credentials
 * are included.
 */

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL        || "http://localhost:3000",
  process.env.FRONTEND_URL_LAN    || "http://192.168.2.147:3000",
];

export function corsHeaders(requestOrigin) {
  // Reflect the requesting origin if it is in our allow-list, otherwise fall
  // back to the primary FRONTEND_URL so the header is always present.
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
      ? requestOrigin
      : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

/**
 * Attaches CORS headers to an existing NextResponse and returns it.
 *
 * @param {import("next/server").NextResponse} response
 * @param {string} [requestOrigin]  — value of the request's Origin header
 * @returns {import("next/server").NextResponse}
 */
export function withCors(response, requestOrigin) {
  const headers = corsHeaders(requestOrigin);
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

/**
 * Returns a minimal 204 No Content response for OPTIONS preflight requests.
 *
 * @param {string} [requestOrigin]  — value of the request's Origin header
 */
export function optionsResponse(requestOrigin) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(requestOrigin),
  });
}


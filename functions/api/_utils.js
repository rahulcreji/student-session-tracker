/**
 * Shared utility functions for Cloudflare Pages Functions
 */

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...headers,
    },
  });
}

export function error(message, status = 400, details = null) {
  return json(
    {
      success: false,
      error: message,
      ...(details ? { details } : {}),
    },
    status
  );
}

/**
 * Parses YYYY-MM-DD into a UTC Date object
 */
export function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  // Validate that the date values didn't roll over
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

/**
 * Formats a Date object as YYYY-MM-DD in UTC
 */
export function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Adds n days to a date in UTC
 */
export function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Checks if a date is a weekday (Monday = 1, Friday = 5)
 */
export function isWeekday(date) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

/**
 * Checks if a date is a weekend (Sunday = 0, Saturday = 6)
 */
export function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Returns the next available weekday (Mon-Fri) strictly after the given date
 */
export function getNextWeekday(fromDate) {
  let curr = addDays(fromDate, 1);
  while (!isWeekday(curr)) {
    curr = addDays(curr, 1);
  }
  return curr;
}


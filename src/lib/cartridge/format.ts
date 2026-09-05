/**
 * Deterministic formatting helpers used when rendering kind rules
 * (DESIGN.md §6a): HTML escaping, "N points", "Due Nov 15, 2026",
 * and base64 for data URIs. No locale or clock dependence.
 */

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Hints that let a UTC-ish Canvas timestamp be shown as the date the
 * instructor meant. Canvas exports due_at in UTC without a zone suffix;
 * all_day_date (when all_day is true) carries the local calendar date.
 */
export interface DueHints {
  allDayDate?: string;
  /** IANA zone (e.g. America/Los_Angeles) to render the timestamp in. */
  timeZone?: string;
}

/** Rails time-zone names Canvas writes into time_zone_edited → IANA. */
const RAILS_ZONES: Record<string, string> = {
  'Pacific Time (US & Canada)': 'America/Los_Angeles',
  'Mountain Time (US & Canada)': 'America/Denver',
  Arizona: 'America/Phoenix',
  'Central Time (US & Canada)': 'America/Chicago',
  'Eastern Time (US & Canada)': 'America/New_York',
  'Indiana (East)': 'America/Indiana/Indianapolis',
  Alaska: 'America/Anchorage',
  Hawaii: 'Pacific/Honolulu',
  'Atlantic Time (Canada)': 'America/Halifax',
  Saskatchewan: 'America/Regina',
  Newfoundland: 'America/St_Johns',
  'Mexico City': 'America/Mexico_City',
  Brasilia: 'America/Sao_Paulo',
  'Buenos Aires': 'America/Argentina/Buenos_Aires',
  UTC: 'UTC',
  London: 'Europe/London',
  Dublin: 'Europe/Dublin',
  Lisbon: 'Europe/Lisbon',
  Paris: 'Europe/Paris',
  Berlin: 'Europe/Berlin',
  Amsterdam: 'Europe/Amsterdam',
  Madrid: 'Europe/Madrid',
  Rome: 'Europe/Rome',
  Stockholm: 'Europe/Stockholm',
  Athens: 'Europe/Athens',
  Istanbul: 'Europe/Istanbul',
  Moscow: 'Europe/Moscow',
  Dubai: 'Asia/Dubai',
  Karachi: 'Asia/Karachi',
  Kolkata: 'Asia/Kolkata',
  'New Delhi': 'Asia/Kolkata',
  Mumbai: 'Asia/Kolkata',
  Bangkok: 'Asia/Bangkok',
  Jakarta: 'Asia/Jakarta',
  Singapore: 'Asia/Singapore',
  'Kuala Lumpur': 'Asia/Kuala_Lumpur',
  'Hong Kong': 'Asia/Hong_Kong',
  Beijing: 'Asia/Shanghai',
  Taipei: 'Asia/Taipei',
  Seoul: 'Asia/Seoul',
  Tokyo: 'Asia/Tokyo',
  Osaka: 'Asia/Tokyo',
  Manila: 'Asia/Manila',
  Perth: 'Australia/Perth',
  Adelaide: 'Australia/Adelaide',
  Brisbane: 'Australia/Brisbane',
  Sydney: 'Australia/Sydney',
  Melbourne: 'Australia/Melbourne',
  Hobart: 'Australia/Hobart',
  Auckland: 'Pacific/Auckland',
  Wellington: 'Pacific/Auckland',
};

/** Map a Rails zone name (or an IANA name passed through) to an IANA zone. */
export function ianaZone(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const n = name.trim();
  if (RAILS_ZONES[n]) return RAILS_ZONES[n];
  if (/^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(n) || n === 'UTC') return n;
  return undefined;
}

/**
 * Format an ISO-ish timestamp as "Oct 25, 2026". Deterministic: no
 * dependence on the machine's zone. Zone-less input is treated as UTC
 * (what Canvas exports), then rendered in hints.timeZone if given.
 */
export function formatDate(iso: string | undefined, hints: DueHints = {}): string | undefined {
  const ad = hints.allDayDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(hints.allDayDate.trim()) : null;
  if (ad) return dateLabel(+ad[1], +ad[2] - 1, +ad[3]);
  if (!iso) return undefined;
  const s = iso.trim();
  if (!s) return undefined;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) return dateLabel(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]);
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
  const d = new Date(hasZone ? s : `${s}Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  if (hints.timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: hints.timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      }).formatToParts(d);
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
      const y = get('year');
      const m = get('month');
      const day = get('day');
      if ([y, m, day].every(Number.isFinite)) return dateLabel(y, m - 1, day);
    } catch {
      /* unknown zone: fall through to UTC */
    }
  }
  return dateLabel(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function dateLabel(y: number, m0: number, d: number): string | undefined {
  const m = MONTHS[m0];
  if (!m || !Number.isFinite(y) || !Number.isFinite(d)) return undefined;
  return `${m} ${d}, ${y}`;
}

/** 25 → "25", 12.5 → "12.5", 1.333 → "1.33". */
export function formatPoints(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}

export function pointsLabel(points: number | undefined): string | undefined {
  if (points === undefined || !Number.isFinite(points)) return undefined;
  return `${formatPoints(points)} ${points === 1 ? 'point' : 'points'}`;
}

export function questionsLabel(count: number | undefined): string | undefined {
  if (count === undefined || !Number.isFinite(count) || count <= 0) return undefined;
  return `${count} ${count === 1 ? 'question' : 'questions'}`;
}

export function dueLabel(iso: string | undefined, hints?: DueHints): string | undefined {
  const d = formatDate(iso, hints);
  return d ? `Due ${d}` : undefined;
}

/** `<p class="sg-meta">a · b · c</p>` for the present parts, or "" when none. */
export function metaLine(parts: Array<string | undefined>): string {
  const p = parts.filter((x): x is string => !!x);
  return p.length ? `<p class="sg-meta">${p.map(escapeHtml).join(' · ')}</p>` : '';
}

/** Join non-empty HTML chunks with a newline. */
export function joinHtml(...chunks: string[]): string {
  return chunks.filter((c) => c !== '').join('\n');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64 (with padding). Pure JS so output is identical everywhere. */
export function toBase64(bytes: Uint8Array): string {
  const len = bytes.length;
  const chunks: string[] = [];
  let out = '';
  let i = 0;
  for (; i + 2 < len; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    if (out.length >= 0x10000) {
      chunks.push(out);
      out = '';
    }
  }
  if (i < len) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const n = (b0 << 16) | (b1 << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < len ? B64[(n >> 6) & 63] : '=';
    out += '=';
  }
  chunks.push(out);
  return chunks.join('');
}

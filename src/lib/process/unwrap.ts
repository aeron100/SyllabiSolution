/**
 * Step 5a: strip a full-document wrapper (<html><head>…</head><body>…</body>)
 * when a caller hands us one. Canvas page files are wrapped this way; the
 * cartridge module normally unwraps them, but we never rely on that.
 */
import { newInertDocument } from './dom';

const WRAPPER = /<\s*(html|head|body)[\s>]/i;

export function unwrapDocument(html: string): string {
  let s = html ?? '';
  // BOM and XML prolog
  s = s.replace(/^﻿/, '').replace(/^\s*<\?xml[^>]*\?>/i, '');
  if (!WRAPPER.test(s) && !/<!doctype/i.test(s)) return s;
  const doc = newInertDocument(s);
  return doc.body ? doc.body.innerHTML : s;
}

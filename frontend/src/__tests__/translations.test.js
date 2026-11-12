// Every translation key used in the code must exist in the English catalog, and the other
// catalogs may only contain keys that English has. Dynamic keys (built with template
// strings) are checked through the id lists that feed them.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../locales/en';
import hi from '../locales/hi';
import hiLatn from '../locales/hi-Latn';

const SRC = path.resolve(__dirname, '..');

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : files(full);
    return /\.(jsx?|mjs)$/.test(name) ? [full] : [];
  });
}

function has(catalog, key) {
  let node = catalog;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object' || !(part in node)) return false;
    node = node[part];
  }
  return true;
}

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

const source = files(SRC).map((f) => [f, readFileSync(f, 'utf8')]);

describe('translation keys', () => {
  it('every literal key used in code exists in English', () => {
    const missing = [];
    const pattern = /\bt\(\s*'([a-z0-9_.-]+)'/gi;
    for (const [file, text] of source) {
      for (const match of text.matchAll(pattern)) {
        const key = match[1];
        const pluralOk = has(en, `${key}_one`) && has(en, `${key}_other`);
        if (!has(en, key) && !pluralOk) missing.push(`${path.relative(SRC, file)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('dynamic keys built from known ids exist', () => {
    const signals = [
      'unsolicited_contact', 'claimed_persona', 'video_call_avoidance', 'gift_offer', 'love_bombing', 'guilt_pressure',
      'mature_for_age', 'secrecy_request', 'move_off_platform', 'isolation_attempt', 'personal_info_request', 'alone_check',
      'age_probe', 'intimate_request', 'sexual_talk', 'money_request', 'credential_request', 'remote_access_request',
      'investment_pitch', 'gift_card_crypto', 'prize_lure', 'loan_offer', 'urgency_pressure', 'account_threat', 'leak_threat',
      'threat_harm', 'self_harm_manipulation', 'authority_impersonation', 'rapid_intensity', 'repeated_pressure',
      'payment_details_shared', 'suspicious_link', 'identity_inconsistency', 'emotional_manipulation',
    ];
    for (const id of signals) {
      expect(has(en, `check.signals.${id}.title`), id).toBe(true);
      expect(has(en, `check.signals.${id}.why`), id).toBe(true);
    }
    const levels = ['low', 'medium', 'high', 'critical'];
    for (const level of levels) {
      expect(has(en, `levels.${level}`)).toBe(true);
      expect(has(en, `check.result.headline.level_${level}`)).toBe(true);
    }
    const linkStatuses = ['safe', 'suspicious', 'high_risk', 'unable_to_verify', 'invalid'];
    for (const s of linkStatuses) {
      expect(has(en, `check.link.status.${s}`)).toBe(true);
      expect(has(en, `check.link.status_body.${s}`)).toBe(true);
    }
    for (const s of ['clean', 'match', 'not_configured', 'error']) expect(has(en, `check.link.checked_threat_${s}`)).toBe(true);
  });

  it('other languages only use keys that exist in English', () => {
    for (const [name, catalog] of [['hi', hi], ['hi-Latn', hiLatn]]) {
      const extra = flatten(catalog).filter((key) => !has(en, key));
      expect(extra, name).toEqual([]);
    }
  });

  it('user-facing English copy has no em dashes', () => {
    const strings = (obj, prefix = '') =>
      Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? strings(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]));
    const withDash = strings(en)
      .filter(([, value]) => typeof value === 'string' && value.includes('—'))
      .map(([key]) => key);
    expect(withDash).toEqual([]);
  });
});

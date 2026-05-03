import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArNumber, normalizeCode, isJunkRow } from '../scripts/lib/normalizers.js';

test('normaliza precios argentinos', () => {
  assert.equal(parseArNumber('$ 1.234,56'), 1234.56);
  assert.equal(parseArNumber('1.234,56'), 1234.56);
  assert.equal(parseArNumber('1234.56'), 1234.56);
});

test('normaliza codigo', () => {
  assert.equal(normalizeCode(' ab- 12 '), 'AB-12');
});

test('detecta fila invalida/titulo', () => {
  assert.equal(isJunkRow({ a: 'LISTA DE PRECIOS FERRETERIA' }), true);
  assert.equal(isJunkRow({ a: 'TOR001', b: 'Tornillo' }), false);
});

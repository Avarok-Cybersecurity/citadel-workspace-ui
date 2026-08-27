/**
 * The peer list read `full_name` and `is_online`. The generated
 * `PeerInformation` declares `name` and `online_status`, so both reads were
 * `undefined` on every peer — the sidebar showed every discovered peer as
 * offline and unnamed. Optional fields kept tsc silent.
 *
 * And `peer_information` is a Rust HashMap, which crosses the WASM boundary as a
 * JS Map: `Object.values()` on one returns [], so the primary discovery path
 * found nothing at all and fell through to a fallback that only sees peers on
 * the same internal service.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { wireMapValues, wireMapEntries } from '@/lib/wire-map';

describe('wireMapEntries', () => {
  it('reads a Map, which is what the WASM boundary actually delivers', () => {
    const wire = new Map<bigint, { cid: bigint }>([[7n, { cid: 7n }]]);
    expect(wireMapValues(wire, 'test')).toEqual([{ cid: 7n }]);
    expect(wireMapEntries(wire, 'test')).toEqual([['7', { cid: 7n }]]);
  });

  it('still reads a plain object, which JSON-parsed payloads really are', () => {
    expect(wireMapValues({ '7': { cid: 7n } }, 'test')).toEqual([{ cid: 7n }]);
  });

  it('returns nothing for null rather than throwing', () => {
    expect(wireMapValues(null, 'test')).toEqual([]);
  });
});

describe('the peer discovery reader', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/components/p2p/peer-discovery-requests.ts'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('reads the field names the generated PeerInformation declares', () => {
    expect(source).toContain('online_status');
    expect(source).toContain('p.name');
  });

  it('does not read the fields that never existed', () => {
    expect(source, 'full_name is not a field of PeerInformation').not.toContain('full_name');
    expect(source, 'is_online is not a field of PeerInformation').not.toMatch(/p\.is_online/);
  });

  it('does not treat a wire HashMap as a plain object', () => {
    expect(source).not.toMatch(/Object\.(values|keys|entries)\(\s*response\./);
  });
});

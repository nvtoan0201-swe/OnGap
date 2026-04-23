#!/usr/bin/env node
// Rough availability probe — resolves DNS for candidate domains.
// Does NOT replace a registrar whois check, but gives a quick signal:
// domains that resolve are almost certainly taken.

import { promises as dns } from 'node:dns';

const candidates = [
  'ongap.com',
  'ongap.vn',
  'ongap.app',
  'ongap.io',
  'ongap.edu.vn',
];

async function probe(domain) {
  try {
    const records = await dns.resolve(domain);
    return { domain, status: 'RESOLVES (likely taken)', records };
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
      return { domain, status: 'NO DNS RECORD (possibly available — verify on registrar)' };
    }
    return { domain, status: `ERROR: ${err.code}` };
  }
}

const results = await Promise.all(candidates.map(probe));
console.log('\nDomain availability probe (DNS only — confirm via registrar):\n');
for (const r of results) {
  console.log(`  ${r.domain.padEnd(20)} → ${r.status}`);
}
console.log('\nNext step: verify each "possibly available" on Namecheap/Tenten/PA Vietnam.\n');

// RESULT 2026-04-23:
// ongap.com         → ERROR: ECONNREFUSED
// ongap.vn          → ERROR: ECONNREFUSED
// ongap.app         → ERROR: ECONNREFUSED
// ongap.io          → ERROR: ECONNREFUSED
// ongap.edu.vn      → ERROR: ECONNREFUSED
// NOTE: "NO DNS RECORD" means possibly available — human must verify on registrar
//       (Namecheap for .com/.app/.io, Tenten.vn or PA Vietnam for .vn)
// NOTE 2: All probes returned ECONNREFUSED in this run — DNS egress was blocked
//         in the sandbox environment. Re-run this script from an unrestricted
//         network before drawing any conclusions about availability.

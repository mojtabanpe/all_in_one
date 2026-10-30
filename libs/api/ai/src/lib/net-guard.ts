import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Agent } from 'undici';

/** Addresses a user-supplied url must not reach (SSRF), unless the operator allows it. */
const PRIVATE_V4 = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const)
  PRIVATE_V4.addSubnet(net, bits, 'ipv4');
const PRIVATE_V6 = new BlockList();
for (const [net, bits] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  PRIVATE_V6.addSubnet(net, bits, 'ipv6');

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return true;
  if (family === 6 && address.toLowerCase().startsWith('::ffff:')) {
    const v4 = address.slice(7);
    if (isIP(v4) === 4) return PRIVATE_V4.check(v4, 'ipv4');
  }
  return family === 4
    ? PRIVATE_V4.check(address, 'ipv4')
    : PRIVATE_V6.check(address, 'ipv6');
}

export const PRIVATE_NETWORK_MESSAGE = 'این نشانی به شبکه داخلی سرور می‌رسد';

/**
 * A DNS lookup that refuses private and loopback addresses. It runs for the
 * address actually connected to, so DNS rebinding can't slip past it.
 */
export function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, '', 0);
      const list = addresses as LookupAddress[];
      if (
        !list.length ||
        (!allowPrivate && list.some((a) => isPrivateAddress(a.address)))
      )
        return callback(new Error(PRIVATE_NETWORK_MESSAGE), '', 0);
      if (options.all)
        return (callback as unknown as (e: null, a: LookupAddress[]) => void)(
          null,
          list,
        );
      callback(null, list[0].address, list[0].family);
    });
  };
}

/** Throws for urls that name a private address directly (the lookup never runs for IPs). */
export function assertPublicUrl(url: URL, allowPrivate: boolean): void {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate && isIP(host) && isPrivateAddress(host))
    throw new Error(PRIVATE_NETWORK_MESSAGE);
}

const agents = new Map<boolean, Agent>();
/** An undici dispatcher using the guarded lookup. */
export function guardedAgent(allowPrivate: boolean): Agent {
  let agent = agents.get(allowPrivate);
  if (!agent) {
    agent = new Agent({ connect: { lookup: guardedLookup(allowPrivate) } });
    agents.set(allowPrivate, agent);
  }
  return agent;
}

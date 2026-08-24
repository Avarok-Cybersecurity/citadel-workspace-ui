import { debugLog } from '@/lib/debug-config';
import { NETWORK } from './timeout-constants';
/**
 * Address Resolver
 *
 * Resolves server addresses for Connect/Register commands.
 * - If address is already IPv4 or IPv6, returns as-is
 * - If address is a hostname, resolves via DNS
 * - Default port is 12349 if not specified
 */

const DEFAULT_PORT = NETWORK.WORKSPACE_SERVER_PORT;

// IPv4 regex: matches 0-255 in each octet
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// IPv6 regex: simplified pattern that matches common IPv6 formats
const IPV6_REGEX = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}$|^(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}$|^(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}$|^:(?::[0-9a-fA-F]{1,4}){1,7}$|^::$|^\[(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\]$/;

/**
 * Check if a string is a valid IPv4 address
 */
function isIPv4(address: string): boolean {
  return IPV4_REGEX.test(address);
}

/**
 * Check if a string is a valid IPv6 address
 * Handles both bare and bracketed formats
 */
function isIPv6(address: string): boolean {
  // Remove brackets if present
  const cleaned = address.startsWith('[') && address.endsWith(']')
    ? address.slice(1, -1)
    : address;
  return IPV6_REGEX.test(cleaned) || IPV6_REGEX.test(`[${cleaned}]`);
}

/**
 * Check if a string is an IP address (IPv4 or IPv6)
 */
function isIPAddress(address: string): boolean {
  return isIPv4(address) || isIPv6(address);
}

/**
 * Parse address into host and port components
 * Handles:
 * - hostname
 * - hostname:port
 * - IPv4
 * - IPv4:port
 * - [IPv6]
 * - [IPv6]:port
 */
/**
 * Parse the port half of an address, strictly.
 *
 * parseInt is too forgiving for this: parseInt('12349abc', 10) is 12349, so a
 * typo used to be accepted silently and the client connected to a port the user
 * never typed. That does not surface as a parse error — it surfaces as a
 * connection timing out against an address nobody entered, which is a far worse
 * thing to debug. Out-of-range values had the same problem.
 */
function parsePort(rawPort: string, address: string): number {
  // Surrounding whitespace is unambiguous, and parseInt used to tolerate it —
  // rejecting "host: 12349" would be a regression for a typo that has exactly
  // one sensible reading. Anything else is genuinely ambiguous and refused.
  const portStr = rawPort.trim();

  if (!/^\d+$/.test(portStr)) {
    throw new Error(`Invalid port in address: ${address}`);
  }
  const port = Number(portStr);
  if (port < 1 || port > 65535) {
    throw new Error(`Invalid port in address: ${address} (must be 1-65535)`);
  }
  return port;
}

function parseAddress(address: string): { host: string; port: number | null } {
  // Handle IPv6 with brackets: [::1] or [::1]:port
  if (address.startsWith('[')) {
    const closeBracket = address.indexOf(']');
    if (closeBracket === -1) {
      throw new Error(`Invalid IPv6 address format: ${address}`);
    }
    const host = address.slice(1, closeBracket);
    const afterBracket = address.slice(closeBracket + 1);

    if (afterBracket === '') {
      return { host, port: null };
    } else if (afterBracket.startsWith(':')) {
      return { host, port: parsePort(afterBracket.slice(1), address) };
    } else {
      throw new Error(`Invalid IPv6 address format: ${address}`);
    }
  }

  // Handle IPv4 or hostname with optional port
  const lastColon = address.lastIndexOf(':');

  // No colon = no port
  if (lastColon === -1) {
    return { host: address, port: null };
  }

  // Check if it's IPv6 without brackets (multiple colons)
  const colonCount = (address.match(/:/g) || []).length;
  if (colonCount > 1) {
    // Bare IPv6 address without port
    return { host: address, port: null };
  }

  // Single colon = IPv4:port or hostname:port
  const host = address.slice(0, lastColon);
  return { host, port: parsePort(address.slice(lastColon + 1), address) };
}

/**
 * Well-known hostnames that resolve locally
 */
const LOCAL_HOSTNAMES: Record<string, string> = {
  'localhost': '127.0.0.1',
  'localhost.localdomain': '127.0.0.1',
};

/**
 * Resolve a hostname to an IP address using Google's DNS-over-HTTPS API.
 *
 * Special cases:
 * 1. Well-known local hostnames (localhost -> 127.0.0.1) are resolved locally
 * 2. Other hostnames are resolved via Google's DNS-over-HTTPS API
 *
 * @param hostname - The hostname to resolve
 * @returns The resolved IPv4 address
 * @throws Error if DNS resolution fails
 */
async function resolveDNS(hostname: string): Promise<string> {
  const lowerHostname = hostname.toLowerCase();

  // Check well-known local hostnames first
  if (lowerHostname in LOCAL_HOSTNAMES) {
    const resolved = LOCAL_HOSTNAMES[lowerHostname];
    debugLog('AddressResolver', `DNS resolved (local): ${hostname} -> ${resolved}`);
    return resolved;
  }

  // Use Google's DNS-over-HTTPS API for real hostnames
  // See: https://developers.google.com/speed/public-dns/docs/doh/json
  const dnsUrl = `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`;

  debugLog('AddressResolver', `DNS resolution: Querying Google DNS for '${hostname}'...`);

  try {
    const response = await fetch(dnsUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/dns-json',
      },
    });

    if (!response.ok) {
      throw new Error(`DNS query failed with status ${response.status}`);
    }

    const data = await response.json();

    // Check for DNS errors
    if (data.Status !== 0) {
      // DNS RCODE: 0=NOERROR, 1=FORMERR, 2=SERVFAIL, 3=NXDOMAIN, etc.
      const errorMessages: Record<number, string> = {
        1: 'Format error',
        2: 'Server failure',
        3: 'Non-existent domain',
        4: 'Not implemented',
        5: 'Query refused',
      };
      const errorMsg = errorMessages[data.Status] || `DNS error code ${data.Status}`;
      throw new Error(`DNS resolution failed for '${hostname}': ${errorMsg}`);
    }

    // Extract the first A record (IPv4)
    const answers = data.Answer;
    if (!answers || answers.length === 0) {
      throw new Error(`No DNS records found for '${hostname}'`);
    }

    // Find the first A record (type 1)
    const aRecord = answers.find((record: { type: number; data: string }) => record.type === 1);
    if (!aRecord) {
      throw new Error(`No A (IPv4) record found for '${hostname}'`);
    }

    const resolvedIP = aRecord.data;
    debugLog('AddressResolver', `DNS resolved (Google DoH): ${hostname} -> ${resolvedIP}`);
    return resolvedIP;
  } catch (error) {
    if (error instanceof Error) {
      debugLog('AddressResolver', `DNS resolution error for '${hostname}':`, error.message);
      throw new Error(`Cannot resolve hostname '${hostname}': ${error.message}`);
    }
    throw error;
  }
}

/**
 * Resolve a server address for Connect/Register commands.
 *
 * @param serverAddr - The original server address (hostname, hostname:port, IP, IP:port)
 * @returns The resolved address in IP:port format
 * @throws Error if DNS resolution fails
 *
 * Examples:
 *   "example.com" -> "93.184.216.34:12349"
 *   "example.com:8080" -> "93.184.216.34:8080"
 *   "192.168.1.1" -> "192.168.1.1:12349"
 *   "192.168.1.1:8080" -> "192.168.1.1:8080"
 *   "localhost:12349" -> DNS resolved IP:12349
 */
export async function resolveServerAddress(serverAddr: string): Promise<string> {
  const trimmed = serverAddr.trim();

  if (!trimmed) {
    throw new Error('Server address cannot be empty');
  }

  const { host, port } = parseAddress(trimmed);
  const effectivePort = port ?? DEFAULT_PORT;

  // If already an IP address, return with port
  if (isIPAddress(host)) {
    const result = isIPv6(host) ? `[${host}]:${effectivePort}` : `${host}:${effectivePort}`;
    debugLog('AddressResolver', `Address resolver: ${serverAddr} -> ${result} (already IP)`);
    return result;
  }

  // Resolve hostname via DNS
  debugLog('AddressResolver', `Address resolver: Resolving hostname ${host}...`);
  const resolvedIP = await resolveDNS(host);
  const result = `${resolvedIP}:${effectivePort}`;
  debugLog('AddressResolver', `Address resolver: ${serverAddr} -> ${result} (DNS resolved)`);
  return result;
}

// Export for testing
export { isIPv4, isIPv6, isIPAddress, parseAddress, DEFAULT_PORT };

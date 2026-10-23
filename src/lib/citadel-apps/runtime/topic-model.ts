/**
 * The rules of an app topic, apart from any transport (p2p-demo-design §7): which names an install
 * may open (its grant's `topics`, the manifest's shape), the sender-side limits (the manifest's
 * `limits.topics`, under the SDK's ceilings), the envelope a topic message travels in, and what an
 * arriving group message means to the app. A body that is not a topic envelope for an open topic
 * is not the app's: chat traffic can never reach it. Pure.
 */
import { decodeCbor, encodeCbor, isCborMap, type Decoded } from '../host/cbor';
import type { Refused } from '../host/ports';
import { TokenBucket } from '../host/token-bucket';
import type { TopicLimits } from 'citadel-workspace-client-ts';
import { isTopicName } from '../manifest/topic-names';
import { LIMIT_TOPIC_BYTES, LIMIT_TOPIC_RATE, MAX_TOPICS, TOPIC_MAX_MSG_BYTES_CEILING, TOPIC_MAX_MSGS_PER_S_CEILING } from '../sdk/generated/AbiConstants';

/** `limits.topics` of the manifest. */
export type { TopicLimits };

/** The envelope's version tag: a group message without it is not a topic message. */
export const TOPIC_ENVELOPE: string = 'citadel-topic/1';

/** Why the manifest's topic limits cannot be used; null when they can. */
export function topicLimitsProblem(l: TopicLimits): string | null {
  if (!Number.isInteger(l.max_msg_bytes) || l.max_msg_bytes < 1 || l.max_msg_bytes > TOPIC_MAX_MSG_BYTES_CEILING) return 'max_msg_bytes';
  if (!Number.isInteger(l.max_msgs_per_s) || l.max_msgs_per_s < 1 || l.max_msgs_per_s > TOPIC_MAX_MSGS_PER_S_CEILING) return 'max_msgs_per_s';
  return null;
}

/** Whether `name` is one of the install's granted topics (at most MAX_TOPICS, each well-formed). */
export function mayOpen(name: string, granted: readonly string[]): boolean {
  return granted.length <= MAX_TOPICS && isTopicName(name) && granted.includes(name);
}

/** The sender's side of the limits, one per open topic. */
export class TopicSender {
  private readonly bucket: TokenBucket;

  constructor(private readonly limits: TopicLimits, now: number) {
    this.bucket = new TokenBucket(limits.max_msgs_per_s, now);
  }

  /** Null: send it. Otherwise the refusal the app reads, at once. */
  admit(body: Uint8Array, now: number): Refused | null {
    if (body.byteLength > this.limits.max_msg_bytes) return { limit: LIMIT_TOPIC_BYTES };
    return this.bucket.take(now) ? null : { limit: LIMIT_TOPIC_RATE };
  }
}

export const encodeTopicMessage = (name: string, body: Uint8Array): Uint8Array => encodeCbor({ t: TOPIC_ENVELOPE, name, body });

/** A group message's topic and body, when it is a topic envelope for one of `open`; null otherwise. */
export function readTopicMessage(bytes: Uint8Array, open: ReadonlySet<string>, limits: TopicLimits): { readonly name: string; readonly body: Uint8Array } | null {
  if (bytes.byteLength > limits.max_msg_bytes + 128) return null;
  const decoded: Decoded = decodeCbor(bytes);
  if (!decoded.ok || !isCborMap(decoded.value)) return null;
  const { t, name, body } = decoded.value as Record<string, unknown>;
  // isView, not instanceof: bytes decoded in another realm (a worker, the wasm client) are not this realm's Uint8Array.
  if (t !== TOPIC_ENVELOPE || typeof name !== 'string' || !open.has(name) || !ArrayBuffer.isView(body)) return null;
  const view: Uint8Array = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  return view.byteLength > limits.max_msg_bytes ? null : { name, body: view };
}

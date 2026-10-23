/**
 * The rules of an app topic: only granted, well-formed names open; the sender is held to the
 * manifest's size and rate (refused at once, as `topic_bytes` / `topic_rate`); and only a topic
 * envelope for an open topic reaches the app, so a chat message in the same group never does.
 */
import { describe, expect, it } from 'vitest';
import { encodeCbor } from '../../host/cbor';
import { encodeTopicMessage, mayOpen, readTopicMessage, topicLimitsProblem, TopicSender, type TopicLimits } from '../topic-model';

const LIMITS: TopicLimits = { max_msg_bytes: 8, max_msgs_per_s: 2 };

describe('a topic carries only its own messages', () => {
  it('opens only a granted, well-formed name', () => {
    expect(mayOpen('pool', ['pool'])).toBe(true);
    expect(mayOpen('chat', ['pool'])).toBe(false);
    expect(mayOpen('Pool', ['Pool'])).toBe(false);
    expect(mayOpen('a'.repeat(33), ['a'.repeat(33)])).toBe(false);
    expect(mayOpen('a', ['a', 'b', 'c', 'd', 'e'])).toBe(false);
  });

  it('holds the sender to the size, then the rate (control: under both it sends)', () => {
    const s: TopicSender = new TopicSender(LIMITS, 0);
    expect(s.admit(new Uint8Array(9), 0)).toEqual({ limit: 'topic_bytes' });
    expect(s.admit(new Uint8Array(8), 0)).toBeNull();
    expect(s.admit(new Uint8Array(1), 0)).toBeNull();
    expect(s.admit(new Uint8Array(1), 0)).toEqual({ limit: 'topic_rate' });
    expect(s.admit(new Uint8Array(1), 600)).toBeNull();
  });

  it('reads back its own envelope for an open topic, and nothing else', () => {
    const open: ReadonlySet<string> = new Set(['pool']);
    expect(readTopicMessage(encodeTopicMessage('pool', new Uint8Array([1, 2])), open, LIMITS)).toEqual({ name: 'pool', body: new Uint8Array([1, 2]) });
    expect(readTopicMessage(encodeTopicMessage('other', new Uint8Array([1])), open, LIMITS)).toBeNull();
    expect(readTopicMessage(encodeCbor({ group_id: '7:42', content: 'hello' }), open, LIMITS)).toBeNull();
    expect(readTopicMessage(encodeTopicMessage('pool', new Uint8Array(9)), open, LIMITS)).toBeNull();
  });

  it('refuses limits past the SDK ceilings', () => {
    expect(topicLimitsProblem(LIMITS)).toBeNull();
    expect(topicLimitsProblem({ max_msg_bytes: 16385, max_msgs_per_s: 1 })).toBe('max_msg_bytes');
    expect(topicLimitsProblem({ max_msg_bytes: 1, max_msgs_per_s: 5 })).toBe('max_msgs_per_s');
  });
});

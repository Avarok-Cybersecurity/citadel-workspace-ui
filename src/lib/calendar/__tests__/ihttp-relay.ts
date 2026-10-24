/**
 * TEST FAKE: the workspace server's ihttp relay between members' Calendar instances. A client
 * frame to `user:<name>` reaches that member's instance stamped with the sender as `Caller` (the
 * kernel's word, never the body's); a frame back reaches the caller stamped with the server. A
 * member who is not online is `no_host`, as the relay answers. Delivery is asynchronous, as it is
 * over a session; frames between two members keep their order.
 */
import type { IhttpPort, InboundIhttpFrame, PortAnswer } from '@/lib/citadel-apps/host/ports';
import type { Caller } from '@/lib/citadel-apps/sdk/generated/Caller';
import type { IhttpFrame } from '@/lib/citadel-apps/sdk/generated/IhttpFrame';

const APP: string = 'net.avarok.calendar';

export class IhttpRelay {
  private readonly listeners: Map<string, (f: InboundIhttpFrame) => void> = new Map();
  /** Every frame the relay carried, in order, for a test that counts them. */
  readonly carried: { from: string; to: string; frame: IhttpFrame }[] = [];

  private caller(username: string): Caller {
    return { username, cid: BigInt(username.length), app_id: APP, install_id: `install-${username}`, via: 'relay' };
  }

  private deliver(from: string, to: string, frame: IhttpFrame): PortAnswer<null> {
    const listener = this.listeners.get(to);
    if (listener === undefined) return { refused: { unavailable: 'no_host' } };
    this.carried.push({ from, to, frame });
    setTimeout((): void => listener({ from: this.caller(from), frame }), 0);
    return { ok: null };
  }

  /** `username`'s instances have all closed: the relay answers `no_host` for them. */
  offline(username: string): void {
    this.listeners.delete(username);
  }

  /** The ihttp port of `username`'s instance; it is online once the instance listens. */
  port(username: string): IhttpPort {
    return {
      IhttpServe: () => ({ ok: null }),
      IhttpCall: ({ to, frame }) => ('user' in to ? this.deliver(username, to.user.username, frame) : { refused: { unavailable: 'no_host' } }),
      respond: (peer: Caller, frame: IhttpFrame) => this.deliver(username, peer.username, frame),
      onFrame: (listener: (f: InboundIhttpFrame) => void) => {
        this.listeners.set(username, listener);
        return (): void => { this.listeners.delete(username); };
      },
    };
  }
}

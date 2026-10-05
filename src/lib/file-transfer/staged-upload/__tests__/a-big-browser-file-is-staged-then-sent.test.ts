/**
 * Through an agent that stages uploads, a browser file over the old 16 MiB frame is
 * staged chunk by chunk and then sent as `StagedUpload` -- no frame carries the file.
 * Through one that does not, the same file is still refused before any frame leaves.
 *
 * Real: executeSendFile, the stager, the socket port's wire shape. Stood in: the
 * agent's greeting (the capability) and the socket, which answers each chunk the way
 * the agent does -- the two edges this process has no agent for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventEmitter } from '@/lib/event-emitter';

const world: { stages: boolean; frames: Array<Record<string, unknown>> } = vi.hoisted(() => ({ stages: true, frames: [] }));

vi.mock('@/lib/agent-conversations/capabilities', () => ({ agentStagesUploads: async (): Promise<boolean> => world.stages }));
vi.mock('@/lib/websocket-service', () => ({
  websocketService: {
    sendMessage: async (r: Record<string, unknown>): Promise<void> => {
      world.frames.push(r);
      const chunk: Record<string, unknown> | undefined = r.StageUploadChunk as Record<string, unknown> | undefined;
      if (!chunk) return;
      const received: bigint = (chunk.offset as bigint) + BigInt((chunk.data as number[]).length);
      queueMicrotask(() => eventEmitter.emit('websocket-message', { StageUploadChunkSuccess: { request_id: chunk.request_id, received } }));
    },
    sendRequest: async (r: Record<string, unknown>): Promise<void> => {
      world.frames.push(r);
      const id: unknown = (r.SendFile as Record<string, unknown>).request_id;
      queueMicrotask(() => eventEmitter.emit('websocket-message', { SendFileRequestSuccess: { request_id: id } }));
    },
  },
}));

// jsdom's Blob has no arrayBuffer(); the browser's does. Read through FileReader instead.
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader: FileReader = new FileReader();
      reader.onload = (): void => resolve(reader.result as ArrayBuffer);
      reader.onerror = (): void => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

const { executeSendFile } = await import('../../send-operations');

const MB: number = 1024 * 1024;
const video: File = new File([new Uint8Array(17 * MB)], 'video.mov');

beforeEach((): void => { world.frames = []; });

describe('a browser file through a staging agent', () => {
  it('is staged in chunks no larger than 1 MiB, then sent by its upload id', async () => {
    world.stages = true;
    await executeSendFile({ source: video, cid: 7n, peerCid: 42n, transferId: 't1' } as Parameters<typeof executeSendFile>[0]);

    const chunks: Array<Record<string, unknown>> = world.frames.filter((f) => 'StageUploadChunk' in f).map((f) => f.StageUploadChunk as Record<string, unknown>);
    const send: Record<string, unknown> = world.frames.find((f) => 'SendFile' in f)?.SendFile as Record<string, unknown>;
    expect(chunks).toHaveLength(17);
    expect(chunks.every((c) => (c.data as number[]).length <= MB)).toBe(true);
    expect(send.source).toEqual({ StagedUpload: { upload_id: chunks[0].upload_id } });
    expect(world.frames.indexOf(world.frames.find((f) => 'SendFile' in f)!)).toBe(17);
  });
});

describe('the same file through an older agent', () => {
  it('is refused before any frame leaves', async () => {
    world.stages = false;
    await expect(executeSendFile({ source: video, cid: 7n, peerCid: 42n, transferId: 't2' } as Parameters<typeof executeSendFile>[0]))
      .rejects.toThrow(/inline browser uploads are capped/);
    expect(world.frames).toHaveLength(0);
  });
});

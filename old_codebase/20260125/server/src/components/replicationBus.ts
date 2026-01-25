/**
 * Replication Bus Component
 * Manages Redis streams and replication across gardens
 */

import { EventEmitter } from "events";

export interface StreamMessage {
  id: string;
  fields: Record<string, string>;
}

export class ReplicationBusComponent extends EventEmitter {
  private streams: Map<string, StreamMessage[]> = new Map();
  private streamCounters: Map<string, number> = new Map();
  private consumerGroups: Map<string, Map<string, string>> = new Map();

  constructor() {
    super();
  }

  /**
   * Add a message to a stream
   */
  async xAdd(streamKey: string, id: string, fields: Record<string, string>): Promise<string> {
    if (!this.streams.has(streamKey)) {
      this.streams.set(streamKey, []);
      this.streamCounters.set(streamKey, 0);
    }

    const stream = this.streams.get(streamKey)!;
    let messageId: string;

    if (id === "*") {
      const counter = this.streamCounters.get(streamKey)!;
      this.streamCounters.set(streamKey, counter + 1);
      const timestamp = Date.now();
      messageId = `${timestamp}-${counter}`;
    } else {
      messageId = id;
    }

    stream.push({ id: messageId, fields });
    this.emit('message', { streamKey, messageId, fields });
    return messageId;
  }

  /**
   * Read messages from streams
   */
  async xRead(
    streams: Array<{ key: string; id: string }>,
    options?: { BLOCK?: number; COUNT?: number }
  ): Promise<Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> | null> {
    const results: Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> = [];

    for (const streamReq of streams) {
      const stream = this.streams.get(streamReq.key);
      if (!stream || stream.length === 0) {
        if (options?.BLOCK) {
          await new Promise(resolve => setTimeout(resolve, Math.min(options.BLOCK || 0, 1000)));
          return null;
        }
        continue;
      }

      const messages: Array<{ id: string; message: Record<string, string> }> = [];
      let startIndex = 0;

      if (streamReq.id === "$") {
        startIndex = stream.length;
      } else if (streamReq.id !== "0") {
        startIndex = stream.findIndex(msg => msg.id === streamReq.id);
        if (startIndex === -1) startIndex = 0;
        else startIndex += 1;
      }

      const count = options?.COUNT || stream.length;
      const endIndex = Math.min(startIndex + count, stream.length);

      for (let i = startIndex; i < endIndex; i++) {
        messages.push({
          id: stream[i].id,
          message: { ...stream[i].fields }
        });
      }

      if (messages.length > 0) {
        results.push({
          name: streamReq.key,
          messages
        });
      }
    }

    return results.length > 0 ? results : null;
  }

  /**
   * Create a consumer group
   */
  async xGroupCreate(
    streamKey: string,
    groupName: string,
    id: string,
    options?: { MKSTREAM?: boolean }
  ): Promise<void> {
    if (!this.streams.has(streamKey)) {
      if (options?.MKSTREAM) {
        this.streams.set(streamKey, []);
        this.streamCounters.set(streamKey, 0);
      } else {
        throw new Error("NOGROUP");
      }
    }
    
    if (!this.consumerGroups.has(streamKey)) {
      this.consumerGroups.set(streamKey, new Map());
    }
    
    const groups = this.consumerGroups.get(streamKey)!;
    if (groups.has(groupName)) {
      throw new Error("BUSYGROUP");
    }
    
    groups.set(groupName, id);
  }

  /**
   * Get stream by key
   */
  getStream(streamKey: string): StreamMessage[] | undefined {
    return this.streams.get(streamKey);
  }

  /**
   * Get all stream keys
   */
  getAllStreamKeys(): string[] {
    return Array.from(this.streams.keys());
  }
}


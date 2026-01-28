export type ChatRole = "USER" | "ASSISTANT" | "SYSTEM";
export interface ChatMessage {
    id: string;
    conversationId: string;
    role: ChatRole;
    content: string;
    timestamp: number;
    userEmail?: string;
    mode?: string;
    scope?: string;
    gardenId?: string;
    serviceType?: string;
    linkedTransactionId?: string;
    status?: "active" | "forgiven";
}
export declare function appendChatMessage(msg: Omit<ChatMessage, "id" | "timestamp"> & {
    id?: string;
    timestamp?: number;
}): ChatMessage;
export declare function getConversationMessages(conversationId: string, limit?: number, beforeTs?: number): ChatMessage[];
export declare function listConversations(prefix?: string): string[];
export declare function deleteConversation(conversationId: string): boolean;
export declare function buildConversationId(scope: 'garden' | 'service', id: string, mode?: string): string;
//# sourceMappingURL=chatHistory.d.ts.map
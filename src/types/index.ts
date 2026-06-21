// src/types/index.ts

export type MessageRole = 'system' | 'user' | 'assistant';

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}

export interface ConversationStartResponse {
  conversationId: string;
  personalityName: string;
}

export interface TranscribeResponse {
  transcript: string;
}

export interface TranscriptHandleResponse {
  assistantReply: string;
  unDetected: boolean;
  unseiDetected: boolean;
}

export interface FortuneResponse {
  message: string;
}

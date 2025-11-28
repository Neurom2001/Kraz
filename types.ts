export interface ActivityLog {
  timestamp: number;
  action: 'LOGIN' | 'LOGOUT' | 'REGISTER' | 'UPDATE_PROFILE';
}

export interface User {
  id: string;
  password?: string; // Stored for mock auth
  isOnline: boolean;
  avatar?: string;
  activityLogs: ActivityLog[];
}

export interface Message {
  id: string;
  senderId: string;
  senderAvatar?: string;
  content: string;
  timestamp: number;
  isSystem?: boolean;
  isAi?: boolean;
  roomId?: string; // null/undefined means public
}

export interface Room {
  id: string;
  key: string; // The access key
  creatorId: string;
  name: string;
  createdAt: number;
}

export type ChatEvent = 
  | { type: 'NEW_MESSAGE'; message: Message }
  | { type: 'DELETE_MESSAGE'; messageId: string; roomId?: string };

export enum ViewState {
  AUTH = 'AUTH',
  DASHBOARD = 'DASHBOARD',
  PUBLIC_CHAT = 'PUBLIC_CHAT',
  PRIVATE_ROOM = 'PRIVATE_ROOM',
  PROFILE = 'PROFILE'
}
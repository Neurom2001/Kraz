export interface UserProfile {
  id: string;
  username: string;
  email?: string;
}

export interface Message {
  id: string;
  content: string;
  user_id: string;
  username: string;
  room_id: string | null;
  created_at: string;
  is_ai?: boolean;
  isSystem?: boolean;
  senderAvatar?: string;
}

export interface Room {
  id: string;
  key: string;
  name: string;
  creator_id: string;
  created_at?: string;
}

export enum ViewState {
  AUTH = 'AUTH',
  DASHBOARD = 'DASHBOARD',
  PUBLIC_CHAT = 'PUBLIC_CHAT',
  PRIVATE_ROOM = 'PRIVATE_ROOM',
  PROFILE = 'PROFILE'
}

export interface ActivityLog {
  timestamp: number;
  action: string;
}

export interface User {
  id: string;
  password?: string;
  isOnline?: boolean;
  activityLogs: ActivityLog[];
  avatar?: string;
  username?: string;
}

export type ChatEvent = 
  | { type: 'NEW_MESSAGE'; message: Message }
  | { type: 'DELETE_MESSAGE'; messageId: string; roomId?: string | null };
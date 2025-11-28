export interface UserProfile {
  id: string; // UUID from Supabase Auth
  username: string;
  email?: string;
}

export interface Message {
  id: string;
  content: string;
  user_id: string; // Sender UUID
  username: string; // Display name
  room_id: string | null; // null = public chat
  created_at: string;
  is_ai?: boolean;
}

export interface Room {
  id: string; // Room Code (e.g., RM-123)
  key: string; // Secret Key
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
}export enum ViewState {
  AUTH = 'AUTH',
  DASHBOARD = 'DASHBOARD',
  PUBLIC_CHAT = 'PUBLIC_CHAT',
  PRIVATE_ROOM = 'PRIVATE_ROOM',
  PROFILE = 'PROFILE'
}

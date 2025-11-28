import { Room, Message, User, ActivityLog, ChatEvent } from '../types';

// In-memory storage simulation
let users: User[] = [];
let rooms: Room[] = [];
let allMessages: Message[] = [
  {
    id: 'sys-1',
    user_id: 'SYSTEM',
    username: 'SYSTEM',
    content: 'SYSTEM INITIALIZED. PUBLIC CHANNEL OPEN.',
    created_at: new Date().toISOString(),
    isSystem: true,
    room_id: null
  }
];

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substr(2, 9).toUpperCase();
const generateKey = () => Math.random().toString(36).substr(2, 6).toUpperCase();

// Event emitter for message broadcasting
type Listener = (event: ChatEvent) => void;
const listeners: Listener[] = [];

const notifyListeners = (event: ChatEvent) => {
  listeners.forEach(l => l(event));
};

export const AuthService = {
  register: (userId: string, password: string): User => {
    const existing = users.find(u => u.id.toLowerCase() === userId.toLowerCase());
    if (existing) {
      throw new Error("USER_ID_TAKEN");
    }
    const newUser: User = { 
      id: userId, 
      username: userId,
      password, // In a real app, hash this!
      isOnline: true,
      activityLogs: [{ timestamp: Date.now(), action: 'REGISTER' }]
    };
    users.push(newUser);
    return newUser;
  },

  login: (userId: string, password: string): User => {
    const user = users.find(u => u.id.toLowerCase() === userId.toLowerCase());
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }
    if (user.password !== password) {
      throw new Error("INVALID_PASSWORD");
    }
    
    // Update logs
    user.activityLogs.push({ timestamp: Date.now(), action: 'LOGIN' });
    user.isOnline = true;
    
    return user;
  },

  logout: (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      user.isOnline = false;
      user.activityLogs.push({ timestamp: Date.now(), action: 'LOGOUT' });
    }
  },

  updateAvatar: (userId: string, avatarUrl: string): User => {
    const user = users.find(u => u.id === userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    user.avatar = avatarUrl;
    user.activityLogs.push({ timestamp: Date.now(), action: 'UPDATE_PROFILE' });
    return user;
  },

  changePassword: (userId: string, oldPass: string, newPass: string): User => {
    const user = users.find(u => u.id === userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.password !== oldPass) throw new Error("INVALID_OLD_PASSWORD");
    user.password = newPass;
    user.activityLogs.push({ timestamp: Date.now(), action: 'UPDATE_PROFILE' });
    return user;
  }
};

export const RoomService = {
  createRoom: (creatorId: string, name: string): Room => {
    const newRoom: Room = {
      id: `RM-${generateId().substring(0, 6)}`,
      key: generateKey(), // Secure access key
      creator_id: creatorId,
      name,
      created_at: new Date().toISOString()
    };
    rooms.push(newRoom);
    return newRoom;
  },

  getRoom: (roomId: string): Room | undefined => {
    return rooms.find(r => r.id === roomId);
  },

  getUserRooms: (userId: string): Room[] => {
    return rooms.filter(r => r.creator_id === userId);
  },

  updateRoomKey: (roomId: string, userId: string, newKey: string): Room => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.creator_id !== userId) throw new Error("UNAUTHORIZED");
    
    room.key = newKey;
    return room;
  },

  validateRoomAccess: (roomId: string, key: string): boolean => {
    const room = rooms.find(r => r.id === roomId);
    return room ? room.key === key.toUpperCase() : false;
  }
};

export const ChatService = {
  getPublicMessages: () => allMessages.filter(m => !m.room_id),
  
  getRoomMessages: (roomId: string) => allMessages.filter(m => m.room_id === roomId),
  
  subscribe: (callback: Listener) => {
    listeners.push(callback);
    return () => {
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    };
  },

  sendPublicMessage: (sender: User | string, content: string, isAi = false) => {
    const senderId = typeof sender === 'string' ? sender : sender.id;
    const username = typeof sender === 'string' ? sender : (sender.username || sender.id);
    const senderAvatar = typeof sender === 'string' ? undefined : sender.avatar;

    const msg: Message = {
      id: generateId(),
      user_id: senderId,
      username,
      senderAvatar,
      content,
      created_at: new Date().toISOString(),
      is_ai: isAi,
      isSystem: false,
      room_id: null
    };
    allMessages.push(msg);
    notifyListeners({ type: 'NEW_MESSAGE', message: msg });
    return msg;
  },

  sendPrivateMessage: (sender: User, content: string, roomId: string) => {
    const msg: Message = {
      id: generateId(),
      user_id: sender.id,
      username: sender.username || sender.id,
      senderAvatar: sender.avatar,
      content,
      created_at: new Date().toISOString(),
      room_id: roomId,
      isSystem: false
    };
    allMessages.push(msg);
    notifyListeners({ type: 'NEW_MESSAGE', message: msg });
    return msg;
  },

  deleteMessage: (messageId: string, userId: string) => {
    const index = allMessages.findIndex(m => m.id === messageId);
    if (index === -1) return;
    
    const msg = allMessages[index];
    if (msg.user_id !== userId) throw new Error("UNAUTHORIZED_DELETE");

    // Remove from storage
    allMessages.splice(index, 1);
    
    // Notify clients
    notifyListeners({ type: 'DELETE_MESSAGE', messageId, roomId: msg.room_id });
  }
};
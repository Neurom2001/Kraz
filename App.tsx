import React, { useState, useEffect, useRef } from 'react';
import { ViewState, User, Room, Message, ChatEvent } from './types';
import { AuthService, RoomService, ChatService } from './services/mockBackend';
import { getGeminiResponse } from './services/geminiService';
import { 
  Send, Lock, Globe, Terminal, LogOut, Key, Hash, 
  User as UserIcon, Loader2, Copy, Check, ArrowRight, 
  Plus, MessageSquare, Trash2, Settings, Shield, 
  Edit2, X
} from 'lucide-react';

const App: React.FC = () => {
  // State
  const [view, setView] = useState<ViewState>(ViewState.AUTH);
  const [user, setUser] = useState<User | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const activeRoomRef = useRef<string | null>(null); 
  
  // Auth Inputs
  const [isRegistering, setIsRegistering] = useState(false);
  const [userIdInput, setUserIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  
  // Profile Inputs
  const [oldPassInput, setOldPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomKeyInput, setEditRoomKeyInput] = useState('');

  // Message Inputs
  const [messageInput, setMessageInput] = useState('');
  
  // Room Inputs
  const [roomNameInput, setRoomNameInput] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinRoomKey, setJoinRoomKey] = useState('');
  const [joinError, setJoinError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyFeedbackId, setCopyFeedbackId] = useState<string | null>(null);

  // Messages
  const [publicMessages, setPublicMessages] = useState<Message[]>([]);
  const [privateMessages, setPrivateMessages] = useState<Message[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync ref for socket callbacks
  useEffect(() => {
    activeRoomRef.current = activeRoom ? activeRoom.id : null;
  }, [activeRoom]);

  // Initialize Chat Subscription
  useEffect(() => {
    setPublicMessages(ChatService.getPublicMessages());

    const unsubscribe = ChatService.subscribe((event: ChatEvent) => {
      if (event.type === 'NEW_MESSAGE') {
        const msg = event.message;
        if (!msg.roomId) {
          setPublicMessages(prev => [...prev, msg]);
        } else {
          if (activeRoomRef.current === msg.roomId) {
            setPrivateMessages(prev => [...prev, msg]);
          }
        }
      } else if (event.type === 'DELETE_MESSAGE') {
        const { messageId, roomId } = event;
        if (!roomId) {
          setPublicMessages(prev => prev.filter(m => m.id !== messageId));
        } else if (activeRoomRef.current === roomId) {
          setPrivateMessages(prev => prev.filter(m => m.id !== messageId));
        }
      }
    });
    return unsubscribe;
  }, []);

  // Auto scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [publicMessages, privateMessages, view, isAiThinking]);

  // --- Handlers ---

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!userIdInput.trim() || !passwordInput.trim()) {
      setAuthError('CREDENTIALS_REQUIRED');
      return;
    }

    if (isRegistering && passwordInput.trim().length < 8) {
      setAuthError('PASSWORD MUST BE AT LEAST 8 CHARACTERS');
      return;
    }

    try {
      let loggedUser;
      if (isRegistering) {
        loggedUser = AuthService.register(userIdInput.trim(), passwordInput.trim());
      } else {
        loggedUser = AuthService.login(userIdInput.trim(), passwordInput.trim());
      }
      setUser(loggedUser);
      setView(ViewState.DASHBOARD);
      setPasswordInput('');
    } catch (err: any) {
      setAuthError(err.message || 'AUTH_FAILED');
    }
  };

  const handleLogout = () => {
    if (user) AuthService.logout(user.id);
    setUser(null);
    setActiveRoom(null);
    setView(ViewState.AUTH);
    setUserIdInput('');
    setPasswordInput('');
    setAuthError('');
  };

  const handleChangePassword = () => {
    if (!user) return;
    try {
      const updatedUser = AuthService.changePassword(user.id, oldPassInput, newPassInput);
      setUser({...updatedUser});
      setOldPassInput('');
      setNewPassInput('');
      setProfileMessage('ACCESS CREDENTIALS ROTATED');
      setTimeout(() => setProfileMessage(''), 2000);
    } catch (e: any) {
      setProfileMessage(`ERROR: ${e.message}`);
    }
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !roomNameInput.trim()) return;
    const room = RoomService.createRoom(user.id, roomNameInput.trim());
    enterRoom(room, true);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError('');
    if (!joinRoomId.trim() || !joinRoomKey.trim()) {
      setJoinError('MISSING CREDENTIALS');
      return;
    }
    const isValid = RoomService.validateRoomAccess(joinRoomId.trim(), joinRoomKey.trim());
    if (isValid) {
      const room = RoomService.getRoom(joinRoomId.trim());
      if (room) {
        enterRoom(room);
      } else {
        setJoinError('ROOM NOT FOUND');
      }
    } else {
      setJoinError('ACCESS DENIED: INVALID ID OR KEY');
    }
  };

  const handleUpdateRoomKey = (roomId: string) => {
    if(!user || !editRoomKeyInput.trim()) return;
    try {
      RoomService.updateRoomKey(roomId, user.id, editRoomKeyInput.trim());
      setEditingRoomId(null);
      setEditRoomKeyInput('');
      setProfileMessage('ROOM KEY UPDATED');
      setTimeout(() => setProfileMessage(''), 2000);
    } catch (e) {
      setProfileMessage('UPDATE FAILED');
    }
  };

  const enterRoom = (room: Room, isNew = false) => {
    setActiveRoom(room);
    const history = ChatService.getRoomMessages(room.id);
    const sysMsg: Message = {
      id: `sys-${Date.now()}`,
      senderId: 'SYSTEM',
      content: isNew ? `ROOM CREATED. SECURE CHANNEL ESTABLISHED.` : `CONNECTED TO SECURE ROOM: ${room.name}`,
      timestamp: Date.now(),
      isSystem: true,
      roomId: room.id
    };
    
    // Simple check to avoid spamming system messages on re-entry
    const msgs = history.length === 0 || isNew ? [...history, sysMsg] : history;
    setPrivateMessages(msgs);
    
    setRoomNameInput('');
    setJoinRoomId('');
    setJoinRoomKey('');
    setView(ViewState.PRIVATE_ROOM);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !user) return;
    const content = messageInput.trim();
    setMessageInput('');

    if (view === ViewState.PUBLIC_CHAT) {
      ChatService.sendPublicMessage(user, content);
      if (content.toLowerCase().startsWith('/ai')) {
        setIsAiThinking(true);
        const prompt = content.replace('/ai', '').trim();
        try {
          const aiResponse = await getGeminiResponse(prompt);
          ChatService.sendPublicMessage('AI_CORE', aiResponse, true);
        } finally {
          setIsAiThinking(false);
        }
      }
    } else if (view === ViewState.PRIVATE_ROOM && activeRoom) {
      ChatService.sendPrivateMessage(user, content, activeRoom.id);
    }
  };

  const handleDeleteMessage = (msgId: string) => {
    if (!user) return;
    try {
      ChatService.deleteMessage(msgId, user.id);
    } catch (e) {
      console.error("Failed to delete message");
    }
  };

  const copyRoomInfo = () => {
    if (!activeRoom) return;
    const info = `ID: ${activeRoom.id} | KEY: ${activeRoom.key}`;
    navigator.clipboard.writeText(info);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMessage = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopyFeedbackId(id);
    setTimeout(() => setCopyFeedbackId(null), 1000);
  };

  const handleDeleteRequest = (msg: Message) => {
    if (!user || msg.senderId !== user.id || msg.isSystem) return;
    if (window.confirm("CONFIRM DELETE: Permanently remove this message?")) {
      handleDeleteMessage(msg.id);
    }
  };

  // --- Render Functions ---

  const renderAuth = () => (
    <div className="flex flex-col items-center justify-center h-full p-4 animate-in fade-in duration-700">
      <div className="w-full max-w-md border border-terminal-green/50 p-8 bg-terminal-gray/10 shadow-[0_0_15px_rgba(0,255,65,0.1)]">
        <div className="flex justify-center mb-6">
          <Terminal size={48} className="text-terminal-green animate-pulse" />
        </div>
        <h1 className="text-2xl font-bold mb-2 text-center tracking-widest text-terminal-green">CHAT FROM ANYWHERE</h1>
        <div className="flex justify-center gap-4 mb-6 text-sm">
           <button 
             onClick={() => { setIsRegistering(false); setAuthError(''); }}
             className={`px-4 py-1 transition-colors ${!isRegistering ? 'text-terminal-green border-b border-terminal-green' : 'text-terminal-dim hover:text-terminal-text'}`}
           >
             LOGIN
           </button>
           <button 
             onClick={() => { setIsRegistering(true); setAuthError(''); }}
             className={`px-4 py-1 transition-colors ${isRegistering ? 'text-terminal-green border-b border-terminal-green' : 'text-terminal-dim hover:text-terminal-text'}`}
           >
             REGISTER
           </button>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-terminal-dim text-xs mb-1 tracking-wider">USER ID</label>
            <div className="relative">
              <UserIcon size={16} className="absolute left-3 top-3 text-terminal-green" />
              <input
                type="text"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                className="w-full bg-terminal-gray border border-terminal-green/30 text-terminal-text pl-10 pr-4 py-2 focus:outline-none focus:border-terminal-green focus:shadow-[0_0_10px_rgba(0,255,65,0.2)] placeholder-terminal-dim/50"
                placeholder={isRegistering ? "CREATE UNIQUE ID" : "ENTER USER ID"}
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-terminal-dim text-xs mb-1 tracking-wider">PASSWORD</label>
            <div className="relative">
              <Key size={16} className="absolute left-3 top-3 text-terminal-green" />
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-terminal-gray border border-terminal-green/30 text-terminal-text pl-10 pr-4 py-2 focus:outline-none focus:border-terminal-green focus:shadow-[0_0_10px_rgba(0,255,65,0.2)] placeholder-terminal-dim/50"
                placeholder={isRegistering ? "CREATE PASSWORD (MIN 8 CHARS)" : "ENTER PASSWORD"}
              />
            </div>
          </div>
          
          {authError && (
            <div className="text-terminal-alert text-xs text-center border border-terminal-alert/30 p-2 bg-terminal-alert/5">
              ERROR: {authError}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-terminal-green text-terminal-dark font-bold py-2 hover:bg-opacity-90 transition-all flex items-center justify-center gap-2 group"
          >
            {isRegistering ? 'INITIALIZE USER' : 'AUTHENTICATE'}
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </form>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="flex flex-col h-full max-w-4xl mx-auto p-4 w-full">
      <header className="flex justify-between items-center py-6 border-b border-terminal-green/20 mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 border border-terminal-green rounded flex items-center justify-center bg-terminal-gray/20">
            <UserIcon className="text-terminal-green" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider text-terminal-green">CHAT FROM ANYWHERE</h1>
            <p className="text-xs text-terminal-dim">USER: <span className="text-terminal-text">{user?.id}</span></p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView(ViewState.PROFILE)} className="text-terminal-text hover:text-terminal-green flex items-center gap-2 text-sm px-3 py-1 border border-terminal-dim/30 hover:border-terminal-green transition-colors">
            <Settings size={14} /> SYSTEM CONFIG
          </button>
          <button onClick={handleLogout} className="text-terminal-alert hover:text-white flex items-center gap-2 text-sm px-3 py-1 border border-terminal-alert/30 hover:bg-terminal-alert/10 transition-colors">
            <LogOut size={14} /> LOGOUT
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 items-start">
        <button 
          onClick={() => setView(ViewState.PUBLIC_CHAT)}
          className="group relative h-48 border border-terminal-green/30 bg-terminal-gray/20 hover:bg-terminal-gray/40 hover:border-terminal-green transition-all p-6 text-left flex flex-col justify-between overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Globe size={100} />
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-terminal-green/10 rounded">
              <MessageSquare className="text-terminal-green" size={24} />
            </div>
            <h3 className="text-lg font-bold text-terminal-text">PUBLIC CHANNEL</h3>
          </div>
          <div>
            <p className="text-terminal-dim text-sm mb-2">Global access point. AI core active.</p>
            <span className="text-terminal-green text-xs flex items-center gap-1 group-hover:gap-2 transition-all">
              CONNECT <ArrowRight size={12} />
            </span>
          </div>
        </button>

        <div className="space-y-6">
          <div className="border border-terminal-green/30 bg-terminal-gray/20 p-6">
             <div className="flex items-center gap-3 mb-4">
                <Plus className="text-terminal-green" size={20} />
                <h3 className="font-bold text-terminal-text">INITIATE SECURE ROOM</h3>
             </div>
             <form onSubmit={handleCreateRoom} className="flex gap-2">
                <input 
                  type="text" 
                  value={roomNameInput}
                  onChange={e => setRoomNameInput(e.target.value)}
                  placeholder="ROOM IDENTIFIER"
                  className="flex-1 bg-terminal-dark border border-terminal-dim/30 px-3 py-2 text-sm focus:border-terminal-green focus:outline-none text-terminal-text placeholder-terminal-dim/40"
                />
                <button type="submit" className="bg-terminal-green/10 text-terminal-green border border-terminal-green/50 px-4 py-2 text-sm hover:bg-terminal-green hover:text-terminal-dark transition-colors font-bold">
                  CREATE
                </button>
             </form>
          </div>

          <div className="border border-terminal-green/30 bg-terminal-gray/20 p-6">
             <div className="flex items-center gap-3 mb-4">
                <Hash className="text-terminal-green" size={20} />
                <h3 className="font-bold text-terminal-text">JOIN ENCRYPTED NET</h3>
             </div>
             <form onSubmit={handleJoinRoom} className="space-y-3">
                <input 
                  type="text" 
                  value={joinRoomId}
                  onChange={e => setJoinRoomId(e.target.value)}
                  placeholder="ROOM ID (e.g. RM-X9F2)"
                  className="w-full bg-terminal-dark border border-terminal-dim/30 px-3 py-2 text-sm focus:border-terminal-green focus:outline-none text-terminal-text placeholder-terminal-dim/40"
                />
                <div className="flex gap-2">
                  <input 
                    type="password" 
                    value={joinRoomKey}
                    onChange={e => setJoinRoomKey(e.target.value)}
                    placeholder="ACCESS KEY"
                    className="flex-1 bg-terminal-dark border border-terminal-dim/30 px-3 py-2 text-sm focus:border-terminal-green focus:outline-none text-terminal-text placeholder-terminal-dim/40"
                  />
                  <button type="submit" className="bg-terminal-green/10 text-terminal-green border border-terminal-green/50 px-4 py-2 text-sm hover:bg-terminal-green hover:text-terminal-dark transition-colors font-bold">
                    JOIN
                  </button>
                </div>
                {joinError && <p className="text-terminal-alert text-xs border-l-2 border-terminal-alert pl-2">{joinError}</p>}
             </form>
          </div>
        </div>
      </div>
    </div>
  );

  const renderProfile = () => {
    if (!user) return null;
    const userRooms = RoomService.getUserRooms(user.id);

    return (
      <div className="flex flex-col h-full max-w-5xl mx-auto p-4 w-full overflow-y-auto">
        <header className="flex items-center gap-4 py-6 border-b border-terminal-green/20 mb-8">
           <button onClick={() => setView(ViewState.DASHBOARD)} className="text-terminal-dim hover:text-terminal-green transition-colors">
             <ArrowRight size={24} className="rotate-180" />
           </button>
           <h1 className="text-xl font-bold tracking-wider text-terminal-green flex items-center gap-2">
             <Settings size={20} /> SYSTEM CONFIGURATION
           </h1>
        </header>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           {/* Security */}
           <div className="border border-terminal-green/30 bg-terminal-gray/20 p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                 <Shield size={100} />
              </div>
              <h3 className="font-bold text-terminal-text mb-4 flex items-center gap-2 border-b border-terminal-dim/20 pb-2">
                 <Key size={16} className="text-terminal-green" /> SECURITY CREDENTIALS
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-xs text-terminal-dim">CURRENT PASSWORD</label>
                   <input 
                     type="password" 
                     value={oldPassInput}
                     onChange={e => setOldPassInput(e.target.value)}
                     className="w-full bg-terminal-dark border border-terminal-dim/30 px-3 py-2 text-sm text-terminal-text focus:border-terminal-green focus:outline-none"
                   />
                </div>
                <div className="space-y-1">
                   <label className="text-xs text-terminal-dim">NEW PASSWORD</label>
                   <input 
                     type="password" 
                     value={newPassInput}
                     onChange={e => setNewPassInput(e.target.value)}
                     className="w-full bg-terminal-dark border border-terminal-dim/30 px-3 py-2 text-sm text-terminal-text focus:border-terminal-green focus:outline-none"
                   />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                 <button onClick={handleChangePassword} className="bg-terminal-alert/10 text-terminal-alert border border-terminal-alert/30 px-6 py-2 hover:bg-terminal-alert hover:text-black transition-colors text-xs font-bold tracking-wider">
                   UPDATE PASSWORD
                 </button>
              </div>
              {profileMessage && <div className="mt-2 text-center text-xs text-terminal-green animate-pulse bg-terminal-green/5 py-1">{profileMessage}</div>}
           </div>

           <div className="grid grid-cols-1 gap-6">
              {/* Rooms Manager */}
              <div className="border border-terminal-green/30 bg-terminal-gray/20 p-6 flex flex-col h-64">
                 <h3 className="font-bold text-terminal-text mb-4 flex items-center gap-2 pb-2 border-b border-terminal-dim/20">
                    <Hash size={16} className="text-terminal-green" /> OWNED ROOMS
                 </h3>
                 <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                    {userRooms.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-terminal-dim opacity-50">
                         <Hash size={24} className="mb-2" />
                         <span className="text-xs">NO ASSETS FOUND</span>
                      </div>
                    )}
                    {userRooms.map(room => {
                      return (
                        <div key={room.id} className="bg-terminal-dark p-3 border border-terminal-dim/20 hover:border-terminal-green/50 transition-colors group">
                          <div className="flex justify-between items-center mb-1">
                             <span className="font-bold text-sm text-terminal-text truncate">{room.name}</span>
                             <button onClick={() => setEditingRoomId(editingRoomId === room.id ? null : room.id)} className="text-terminal-dim hover:text-terminal-green">
                               {editingRoomId === room.id ? <X size={14}/> : <Edit2 size={14} />}
                             </button>
                          </div>
                          <div className="text-[10px] text-terminal-dim font-mono mb-2">ID: {room.id}</div>
                          
                          {editingRoomId === room.id ? (
                             <div className="flex gap-1 animate-in fade-in">
                               <input 
                                 value={editRoomKeyInput}
                                 onChange={e => setEditRoomKeyInput(e.target.value)}
                                 className="flex-1 bg-terminal-gray text-[10px] px-2 py-1 border border-terminal-green/30"
                                 placeholder="NEW KEY"
                               />
                               <button onClick={() => handleUpdateRoomKey(room.id)} className="bg-terminal-green text-black px-2 py-0.5 text-[10px] font-bold">SAVE</button>
                             </div>
                          ) : (
                             <div className="flex items-center gap-2 text-[10px] bg-terminal-gray/50 p-1 px-2 rounded w-fit">
                               <Key size={10} className="text-terminal-green"/>
                               <span className="select-all font-bold">{room.key}</span>
                             </div>
                          )}
                        </div>
                      );
                    })}
                 </div>
              </div>

              {/* Logs */}
              <div className="border border-terminal-green/30 bg-black p-4 flex flex-col h-64 font-mono text-xs">
                 <h3 className="text-terminal-green mb-2 flex items-center gap-2">
                    <Terminal size={12} /> SYSTEM_LOGS
                 </h3>
                 <div className="flex-1 overflow-y-auto space-y-1 text-terminal-dim/80 pr-1">
                    {user.activityLogs.slice().reverse().map((log, i) => (
                      <div key={i} className="flex gap-2">
                         <span className="text-terminal-dim">[{new Date(log.timestamp).toLocaleTimeString([], {hour12:false})}]</span>
                         <span className={log.action === 'LOGIN' ? 'text-terminal-green' : 'text-terminal-text'}>
                           {log.action}_OK
                         </span>
                      </div>
                    ))}
                    <div className="text-terminal-green animate-pulse">_</div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    );
  };

  const renderChat = (isPublic: boolean) => {
    const messages = isPublic ? publicMessages : privateMessages;
    const title = isPublic ? "PUBLIC CHANNEL" : activeRoom?.name || "UNKNOWN ROOM";

    return (
      <div className="flex flex-col h-full w-full max-w-5xl mx-auto shadow-2xl overflow-hidden bg-terminal-bg border-x border-terminal-dim/20">
        <header className="bg-terminal-gray/50 border-b border-terminal-green/30 p-4 flex justify-between items-center backdrop-blur-sm sticky top-0 z-10">
           <div className="flex items-center gap-4">
             <button onClick={() => setView(ViewState.DASHBOARD)} className="text-terminal-dim hover:text-terminal-green transition-colors">
               <ArrowRight size={20} className="rotate-180" />
             </button>
             <div>
               <h2 className="font-bold text-lg flex items-center gap-2 text-terminal-green tracking-wide">
                 {isPublic ? <Globe size={18} /> : <Lock size={18} />}
                 {title.toUpperCase()}
               </h2>
               {!isPublic && activeRoom && (
                 <div className="flex items-center gap-4 text-xs text-terminal-dim mt-1">
                   <span className="flex items-center gap-1">ID: <span className="text-terminal-text font-mono select-all">{activeRoom.id}</span></span>
                   <button onClick={copyRoomInfo} className="text-terminal-green hover:underline flex items-center gap-1 ml-2">
                     {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'COPIED' : 'COPY KEY'}
                   </button>
                 </div>
               )}
             </div>
           </div>
           <div className="flex items-center gap-3">
             <div className="h-2 w-2 rounded-full bg-terminal-green animate-blink"></div>
             <span className="text-xs text-terminal-green font-mono">LIVE_FEED</span>
           </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 font-mono scroll-smooth">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col animate-in slide-in-from-bottom-2 duration-300 group hover:bg-terminal-gray/20 p-2 rounded relative transition-colors ${msg.senderId === user?.id ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold ${msg.isSystem ? 'text-terminal-alert' : (msg.isAi ? 'text-blue-400' : (msg.senderId === user?.id ? 'text-terminal-green' : 'text-orange-400'))}`}>
                  {msg.isSystem ? 'SYSTEM' : (msg.senderId === user?.id ? 'YOU' : msg.senderId)}
                </span>
                <span className="text-[10px] text-terminal-dim">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                
                {/* Delete Action (Hover) */}
                {!msg.isSystem && msg.senderId === user?.id && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteMessage(msg.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-terminal-alert hover:text-red-500 ml-2 p-1"
                    title="Delete Message"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              <div 
                onClick={() => handleCopyMessage(msg.content, msg.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleDeleteRequest(msg);
                }}
                title={msg.senderId === user?.id ? "Click to Copy | Double-Click to Delete" : "Click to Copy"}
                className={`max-w-[85%] px-3 py-2 rounded text-sm whitespace-pre-wrap break-words border cursor-pointer select-none active:scale-[0.99] transition-all hover:brightness-110 hover:shadow-[0_0_10px_rgba(0,255,65,0.05)] ${
                msg.isSystem 
                  ? 'border-terminal-alert/30 bg-terminal-alert/5 text-terminal-alert' 
                  : (msg.senderId === user?.id 
                      ? 'bg-terminal-green/10 border-terminal-green/30 text-terminal-text ml-auto' 
                      : 'bg-terminal-gray/40 border-terminal-dim/20 text-terminal-text mr-auto')
                }`}
              >
                {msg.content}
                {copyFeedbackId === msg.id && (
                  <div className="absolute -top-6 right-0 bg-terminal-green text-black text-[10px] px-2 py-1 rounded font-bold animate-in fade-in zoom-in duration-200">
                    COPIED
                  </div>
                )}
              </div>
            </div>
          ))}
          {isAiThinking && (
             <div className="flex items-start gap-2 animate-pulse px-2">
                <span className="text-blue-400 text-xs font-bold">AI_CORE</span>
                <div className="bg-blue-400/10 border border-blue-400/30 px-3 py-2 rounded text-sm text-blue-300 flex items-center">
                  <Loader2 size={14} className="animate-spin mr-2"/>
                  PROCESSING...
                </div>
             </div>
          )}
        </div>

        <form onSubmit={handleSendMessage} className="p-4 bg-terminal-gray/50 border-t border-terminal-green/30 backdrop-blur-sm">
          <div className="flex gap-2 relative">
             <input 
               type="text" 
               value={messageInput}
               onChange={e => setMessageInput(e.target.value)}
               placeholder={isPublic ? "SEND TO PUBLIC CHANNEL (USE /ai FOR ASSISTANT)" : "SEND ENCRYPTED MESSAGE"}
               className="flex-1 bg-terminal-dark border border-terminal-dim/30 px-4 py-3 focus:outline-none focus:border-terminal-green text-terminal-text placeholder-terminal-dim/40 font-mono text-sm"
               autoFocus
             />
             <button type="submit" className="bg-terminal-green text-terminal-dark font-bold px-6 hover:bg-opacity-90 transition-opacity flex items-center gap-2 text-sm">
                SEND <Send size={16} />
             </button>
          </div>
        </form>
      </div>
    );
  };

  return (
    <div className="h-screen w-screen bg-terminal-bg text-terminal-text font-sans selection:bg-terminal-green selection:text-terminal-dark overflow-hidden flex flex-col relative">
       {/* Background Grid */}
       <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0.9)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0.9)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none z-0 opacity-20"></div>
       <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,65,0.03),transparent_70%)] pointer-events-none z-0"></div>
       
       <div className="relative z-10 h-full w-full">
         {view === ViewState.AUTH && renderAuth()}
         {view === ViewState.DASHBOARD && renderDashboard()}
         {view === ViewState.PROFILE && renderProfile()}
         {view === ViewState.PUBLIC_CHAT && renderChat(true)}
         {view === ViewState.PRIVATE_ROOM && renderChat(false)}
       </div>
    </div>
  );
};

export default App;
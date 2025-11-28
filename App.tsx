import React, { useState, useEffect, useRef } from 'react';
import { ViewState, UserProfile, Room, Message } from './types';
import { supabase } from './services/supabaseClient';
import { getGeminiResponse } from './services/geminiService';
import { 
  Send, Lock, Globe, Terminal, LogOut, Key, Hash, 
  User as UserIcon, Loader2, Copy, Check, ArrowRight, 
  Plus, MessageSquare, Trash2, Settings, Shield, X
} from 'lucide-react';

const App: React.FC = () => {
  // View State
  const [view, setView] = useState<ViewState>(ViewState.AUTH);
  
  // Data State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userRooms, setUserRooms] = useState<Room[]>([]);
  
  // Inputs
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);

  const [messageInput, setMessageInput] = useState('');
  const [roomNameInput, setRoomNameInput] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinRoomKey, setJoinRoomKey] = useState('');
  const [joinError, setJoinError] = useState('');

  const [isAiThinking, setIsAiThinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- 1. Authentication & Initialization ---

  useEffect(() => {
    // Check active session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetchUserProfile(session.user.id, session.user.email);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchUserProfile(session.user.id, session.user.email);
      } else {
        setUser(null);
        setView(ViewState.AUTH);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId: string, email?: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      setUser({ ...data, email });
      setView(ViewState.DASHBOARD);
      fetchUserRooms(userId);
    } else if (email) {
      // Fallback if profile doesn't exist yet
      setUser({ id: userId, username: email.split('@')[0], email });
      setView(ViewState.DASHBOARD);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setLoading(true);

    try {
      if (isRegistering) {
        // 1. Sign Up
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: emailInput,
          password: passwordInput,
        });
        if (authError) throw authError;

        if (authData.user) {
          // 2. Create Profile
          const { error: profileError } = await supabase
            .from('profiles')
            .insert([{ id: authData.user.id, username: usernameInput }]);
          
          if (profileError) {
             console.error("Profile creation failed:", profileError);
          }
          alert("Registration successful! You can now login.");
          setIsRegistering(false);
        }
      } else {
        // Login
        const { error } = await supabase.auth.signInWithPassword({
          email: emailInput,
          password: passwordInput,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMessages([]);
  };

  // --- 2. Data Fetching & Realtime ---

  const fetchUserRooms = async (userId: string) => {
    const { data } = await supabase.from('rooms').select('*').eq('creator_id', userId);
    if (data) setUserRooms(data);
  };

  const fetchMessages = async () => {
    let query = supabase.from('messages').select('*').order('created_at', { ascending: true });
    
    if (view === ViewState.PUBLIC_CHAT) {
      query = query.is('room_id', null);
    } else if (view === ViewState.PRIVATE_ROOM && activeRoom) {
      query = query.eq('room_id', activeRoom.id);
    } else {
      return;
    }

    const { data } = await query;
    if (data) setMessages(data);
  };

  useEffect(() => {
    if (view === ViewState.PUBLIC_CHAT || view === ViewState.PRIVATE_ROOM) {
      fetchMessages();

      // Realtime Subscription
      const channel = supabase
        .channel('realtime_messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const newMsg = payload.new as Message;
          // Filter incoming messages based on current view
          if (view === ViewState.PUBLIC_CHAT && !newMsg.room_id) {
            setMessages(prev => [...prev, newMsg]);
          } else if (view === ViewState.PRIVATE_ROOM && activeRoom && newMsg.room_id === activeRoom.id) {
            setMessages(prev => [...prev, newMsg]);
          }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [view, activeRoom]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isAiThinking]);

  // --- 3. Actions ---

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !user) return;
    const content = messageInput.trim();
    setMessageInput('');

    // Insert into DB
    const { error } = await supabase.from('messages').insert([{
      content: content,
      user_id: user.id,
      username: user.username,
      room_id: view === ViewState.PRIVATE_ROOM && activeRoom ? activeRoom.id : null
    }]);

    if (error) console.error("Send failed:", error);

    // AI Handler
    if (view === ViewState.PUBLIC_CHAT && content.toLowerCase().startsWith('/ai')) {
      setIsAiThinking(true);
      const prompt = content.replace('/ai', '').trim();
      const aiResponse = await getGeminiResponse(prompt);
      
      await supabase.from('messages').insert([{
        content: aiResponse,
        user_id: '00000000-0000-0000-0000-000000000000', // Fake ID for AI
        username: 'AI_CORE',
        is_ai: true,
        room_id: null
      }]);
      setIsAiThinking(false);
    }
  };

  const handleDeleteMessage = async (msgId: string, senderId: string) => {
    if (!user || user.id !== senderId) return;
    if (window.confirm("Delete this message permanently?")) {
      await supabase.from('messages').delete().eq('id', msgId);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !roomNameInput.trim()) return;
    
    // Generate simple ID like RM-X9F
    const roomId = `RM-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const roomKey = Math.random().toString(36).substr(2, 6).toUpperCase();

    const { data, error } = await supabase.from('rooms').insert([{
      id: roomId,
      key: roomKey,
      name: roomNameInput.trim(),
      creator_id: user.id
    }]).select().single();

    if (error) {
      alert("Failed to create room: " + error.message);
    } else if (data) {
      setRoomNameInput('');
      fetchUserRooms(user.id);
      enterRoom(data);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError('');
    
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', joinRoomId.trim())
      .single();

    if (error || !data) {
      setJoinError('ROOM NOT FOUND');
    } else {
      if (data.key === joinRoomKey.trim()) {
        enterRoom(data);
      } else {
        setJoinError('INVALID KEY');
      }
    }
  };

  const enterRoom = (room: Room) => {
    setActiveRoom(room);
    setJoinRoomId('');
    setJoinRoomKey('');
    setView(ViewState.PRIVATE_ROOM);
  };

  // --- Render Helpers ---

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Views ---

  if (view === ViewState.AUTH) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-terminal-bg text-terminal-text">
        <div className="w-full max-w-md border border-terminal-green/50 p-8 bg-terminal-gray/10 shadow-[0_0_15px_rgba(0,255,65,0.1)]">
          <div className="flex justify-center mb-6">
            <Terminal size={48} className="text-terminal-green animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold mb-6 text-center tracking-widest text-terminal-green">SECURE TERMINAL</h1>
          
          <div className="flex gap-4 mb-6 text-sm justify-center">
             <button onClick={() => setIsRegistering(false)} className={`pb-1 ${!isRegistering ? 'text-terminal-green border-b border-terminal-green' : 'text-terminal-dim'}`}>LOGIN</button>
             <button onClick={() => setIsRegistering(true)} className={`pb-1 ${isRegistering ? 'text-terminal-green border-b border-terminal-green' : 'text-terminal-dim'}`}>REGISTER</button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {isRegistering && (
              <div>
                <label className="text-xs text-terminal-dim block mb-1">USERNAME</label>
                <input type="text" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} className="w-full bg-terminal-dark border border-terminal-green/30 p-2 text-terminal-text focus:border-terminal-green outline-none" placeholder="Display Name" />
              </div>
            )}
            <div>
              <label className="text-xs text-terminal-dim block mb-1">EMAIL</label>
              <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} className="w-full bg-terminal-dark border border-terminal-green/30 p-2 text-terminal-text focus:border-terminal-green outline-none" placeholder="user@example.com" />
            </div>
            <div>
              <label className="text-xs text-terminal-dim block mb-1">PASSWORD</label>
              <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} className="w-full bg-terminal-dark border border-terminal-green/30 p-2 text-terminal-text focus:border-terminal-green outline-none" placeholder="******" />
            </div>
            
            {authError && <div className="text-terminal-alert text-xs p-2 border border-terminal-alert/30">{authError}</div>}
            
            <button disabled={loading} className="w-full bg-terminal-green text-black font-bold py-2 hover:bg-opacity-90 flex justify-center">
              {loading ? <Loader2 className="animate-spin"/> : (isRegistering ? 'INITIALIZE USER' : 'AUTHENTICATE')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === ViewState.DASHBOARD) {
    return (
      <div className="min-h-screen bg-terminal-bg text-terminal-text p-4">
        <div className="max-w-4xl mx-auto">
          <header className="flex justify-between items-center py-6 border-b border-terminal-green/20 mb-8">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 border border-terminal-green rounded flex items-center justify-center bg-terminal-gray/20">
                <UserIcon className="text-terminal-green" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-wider text-terminal-green">DASHBOARD</h1>
                <p className="text-xs text-terminal-dim">USER: <span className="text-terminal-text">{user?.username}</span></p>
              </div>
            </div>
            <button onClick={handleLogout} className="text-terminal-alert border border-terminal-alert/30 px-3 py-1 text-sm hover:bg-terminal-alert/10 flex items-center gap-2">
              <LogOut size={14} /> LOGOUT
            </button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button onClick={() => setView(ViewState.PUBLIC_CHAT)} className="group h-48 border border-terminal-green/30 bg-terminal-gray/10 hover:bg-terminal-gray/20 p-6 text-left flex flex-col justify-between relative overflow-hidden transition-all">
              <Globe className="absolute top-4 right-4 text-terminal-green/10 group-hover:text-terminal-green/20 transition-all" size={80} />
              <div className="flex items-center gap-3 z-10">
                <MessageSquare className="text-terminal-green" size={24} />
                <h3 className="text-lg font-bold">PUBLIC CHANNEL</h3>
              </div>
              <p className="text-terminal-dim text-sm z-10">Global access point. AI enabled.</p>
            </button>

            <div className="space-y-6">
              <div className="border border-terminal-green/30 bg-terminal-gray/10 p-6">
                 <h3 className="font-bold text-terminal-text mb-4 flex gap-2"><Plus size={20} className="text-terminal-green"/> CREATE ROOM</h3>
                 <form onSubmit={handleCreateRoom} className="flex gap-2">
                    <input type="text" value={roomNameInput} onChange={e => setRoomNameInput(e.target.value)} placeholder="ROOM NAME" className="flex-1 bg-terminal-dark border border-terminal-dim/30 px-3 py-2 text-sm text-white outline-none focus:border-terminal-green"/>
                    <button className="bg-terminal-green/20 text-terminal-green border border-terminal-green/50 px-4 py-2 text-sm font-bold hover:bg-terminal-green hover:text-black">CREATE</button>
                 </form>
              </div>

              <div className="border border-terminal-green/30 bg-terminal-gray/10 p-6">
                 <h3 className="font-bold text-terminal-text mb-4 flex gap-2"><Hash size={20} className="text-terminal-green"/> JOIN ROOM</h3>
                 <form onSubmit={handleJoinRoom} className="space-y-2">
                    <input type="text" value={joinRoomId} onChange={e => setJoinRoomId(e.target.value)} placeholder="ROOM ID (e.g. RM-ABC)" className="w-full bg-terminal-dark border border-terminal-dim/30 px-3 py-2 text-sm text-white outline-none focus:border-terminal-green"/>
                    <div className="flex gap-2">
                      <input type="password" value={joinRoomKey} onChange={e => setJoinRoomKey(e.target.value)} placeholder="ACCESS KEY" className="flex-1 bg-terminal-dark border border-terminal-dim/30 px-3 py-2 text-sm text-white outline-none focus:border-terminal-green"/>
                      <button className="bg-terminal-green/20 text-terminal-green border border-terminal-green/50 px-4 py-2 text-sm font-bold hover:bg-terminal-green hover:text-black">JOIN</button>
                    </div>
                    {joinError && <p className="text-terminal-alert text-xs">{joinError}</p>}
                 </form>
              </div>
            </div>
            
            {/* My Rooms List */}
             <div className="md:col-span-2 border border-terminal-green/30 bg-terminal-gray/10 p-6">
                <h3 className="font-bold text-terminal-text mb-4">MY ROOMS</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {userRooms.map(r => (
                    <div key={r.id} className="bg-terminal-dark border border-terminal-dim/20 p-3 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-sm">{r.name}</div>
                        <div className="text-[10px] text-terminal-dim font-mono">ID: {r.id} | KEY: {r.key}</div>
                      </div>
                      <button onClick={() => enterRoom(r)} className="text-terminal-green text-xs hover:underline">ENTER &rarr;</button>
                    </div>
                  ))}
                  {userRooms.length === 0 && <p className="text-terminal-dim text-xs">No active rooms.</p>}
                </div>
             </div>
          </div>
        </div>
      </div>
    );
  }

  // Chat View (Public or Private)
  const isPublic = view === ViewState.PUBLIC_CHAT;
  return (
    <div className="flex flex-col h-screen bg-terminal-bg text-terminal-text">
      <header className="p-4 border-b border-terminal-green/30 bg-terminal-gray/10 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md">
         <div className="flex items-center gap-4">
           <button onClick={() => setView(ViewState.DASHBOARD)} className="hover:text-terminal-green"><ArrowRight className="rotate-180" size={20}/></button>
           <div>
             <h2 className="font-bold text-terminal-green flex items-center gap-2">
               {isPublic ? <Globe size={18}/> : <Lock size={18}/>} 
               {isPublic ? "PUBLIC CHANNEL" : activeRoom?.name}
             </h2>
             {!isPublic && activeRoom && (
               <div className="text-[10px] text-terminal-dim flex gap-2">
                 <span>ID: {activeRoom.id}</span>
                 <button onClick={() => copyToClipboard(activeRoom.key)} className="text-terminal-green hover:underline">
                   {copied ? "COPIED" : "COPY KEY"}
                 </button>
               </div>
             )}
           </div>
         </div>
         <div className="flex items-center gap-2 text-xs text-terminal-green animate-pulse">
            <div className="w-2 h-2 bg-terminal-green rounded-full"></div> LIVE
         </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.user_id === user?.id ? 'items-end' : 'items-start'}`}>
             <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold ${msg.is_ai ? 'text-blue-400' : (msg.user_id === user?.id ? 'text-terminal-green' : 'text-orange-400')}`}>
                  {msg.is_ai ? 'AI_CORE' : (msg.user_id === user?.id ? 'YOU' : msg.username)}
                </span>
                {msg.user_id === user?.id && (
                  <button onClick={() => handleDeleteMessage(msg.id, msg.user_id)} className="text-terminal-dim hover:text-red-500"><Trash2 size={10}/></button>
                )}
             </div>
             <div 
               onClick={() => copyToClipboard(msg.content)}
               onDoubleClick={() => handleDeleteMessage(msg.id, msg.user_id)}
               className={`px-3 py-2 rounded text-sm max-w-[85%] border cursor-pointer ${
                 msg.is_ai 
                 ? 'border-blue-500/30 bg-blue-900/10 text-blue-100' 
                 : (msg.user_id === user?.id ? 'border-terminal-green/30 bg-terminal-green/10 text-white' : 'border-terminal-dim/30 bg-terminal-gray/20 text-gray-200')
               }`}
             >
               {msg.content}
             </div>
          </div>
        ))}
        {isAiThinking && (
          <div className="flex items-center gap-2 text-blue-400 text-xs px-2">
             <Loader2 size={12} className="animate-spin"/> AI PROCESSING...
          </div>
        )}
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t border-terminal-green/30 bg-terminal-gray/10">
        <div className="flex gap-2">
           <input 
             value={messageInput}
             onChange={e => setMessageInput(e.target.value)}
             className="flex-1 bg-terminal-dark border border-terminal-dim/30 px-4 py-2 text-white outline-none focus:border-terminal-green font-mono"
             placeholder={isPublic ? "Message public channel..." : "Message secure room..."}
             autoFocus
           />
           <button type="submit" className="bg-terminal-green text-black px-4 py-2 font-bold hover:bg-opacity-90"><Send size={18}/></button>
        </div>
      </form>
    </div>
  );
};

export default App;
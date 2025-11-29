import React, { useState, useEffect, useRef } from 'react';
import { ViewState, UserProfile, Room, Message } from './types';
import { supabase } from './services/supabaseClient';
import { 
  Send, Lock, Globe, LogOut, Hash, 
  Loader2, ArrowRight, 
  Plus, MessageSquare, Trash2, Eye, EyeOff, AlertTriangle
} from 'lucide-react';

// Internal Logo Component with Fallback
const Logo = ({ className }: { className?: string }) => {
  const [error, setError] = useState(false);

  if (error) {
    // Fallback if /logo.png is missing or broken
    return <MessageSquare className={`${className} text-terminal-green`} />;
  }

  return (
    <img 
      src="/logo.png" 
      alt="Chat Logo" 
      className={`${className} object-contain`}
      onError={() => setError(true)} 
    />
  );
};

const App: React.FC = () => {
  // View State
  const [view, setView] = useState<ViewState>(ViewState.AUTH);
  
  // Data State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userRooms, setUserRooms] = useState<Room[]>([]);
  
  // Inputs
  const [passwordInput, setPasswordInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);

  const [messageInput, setMessageInput] = useState('');
  const [roomNameInput, setRoomNameInput] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinRoomKey, setJoinRoomKey] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Ref to prevent auth listener from firing during registration flow
  const isProcessingRegistration = useRef(false);

  // --- Notification System ---
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 2000); // Disappear after 2 seconds
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
  };

  // --- 1. Authentication & Initialization ---

  useEffect(() => {
    // Check active session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !isProcessingRegistration.current) {
        fetchUserProfile(session.user.id);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // If we are in the middle of a registration flow (SignUp -> SignOut), 
      // ignore these events to prevent the dashboard from flashing.
      if (isProcessingRegistration.current) return;

      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        // Session ended
        setUser(null);
        setView(ViewState.AUTH);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      setUser(data);
      setView(ViewState.DASHBOARD);
      fetchUserRooms(userId);
    } else {
      // Fallback for immediate UI update if profile fetch lags
      setUser({ id: userId, username: 'User' });
      setView(ViewState.DASHBOARD);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const sanitizedUsername = usernameInput.trim().toLowerCase().replace(/\s+/g, '');
    const fakeEmail = `${sanitizedUsername}@monochat.local`;

    if (!sanitizedUsername || !passwordInput) {
      showToast("USERNAME AND PASSWORD REQUIRED", 'error');
      setLoading(false);
      return;
    }

    try {
      if (isRegistering) {
        // BLOCK the auth listener to prevent flashing dashboard
        isProcessingRegistration.current = true;

        // 1. Sign Up
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: fakeEmail,
          password: passwordInput,
        });
        if (authError) throw authError;

        if (authData.user) {
          // 2. Create Profile
          const { error: profileError } = await supabase
            .from('profiles')
            .insert([{ id: authData.user.id, username: usernameInput.trim() }]);
          
          if (profileError) console.error("Profile creation failed:", profileError);
          
          // 3. Force Manual Login Logic
          // Supabase auto-logs in after signup. We sign out immediately.
          await supabase.auth.signOut();
          
          // Registration complete, allow listener again (though we are now signed out)
          isProcessingRegistration.current = false;

          setIsRegistering(false); // Switch to Login View
          setPasswordInput(''); // Clear password field
          showToast("REGISTRATION SUCCESSFUL. PLEASE LOGIN.", 'success');
        }
      } else {
        // Login
        const { error } = await supabase.auth.signInWithPassword({
          email: fakeEmail,
          password: passwordInput,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      isProcessingRegistration.current = false; // Reset on error
      let msg = err.message;
      if (msg.includes("Invalid login credentials")) msg = "INVALID USERNAME OR PASSWORD";
      if (msg.includes("User already registered")) msg = "USERNAME ALREADY TAKEN";
      showToast(msg.toUpperCase(), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // scope: 'local' ensures the session is removed from the browser immediately
      // even if the server request fails or hangs.
      await supabase.auth.signOut({ scope: 'local' });
      showToast("LOGGED OUT SUCCESSFULLY", 'info');
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      // Force local state reset regardless of API response
      setUser(null);
      setMessages([]);
      setUsernameInput('');
      setPasswordInput('');
      setView(ViewState.AUTH);
    }
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

      const channel = supabase
        .channel('realtime_messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const newMsg = payload.new as Message;
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
  }, [messages]);

  // --- 3. Actions ---

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !user) return;
    const content = messageInput.trim();
    setMessageInput('');

    const { error } = await supabase.from('messages').insert([{
      content: content,
      user_id: user.id,
      username: user.username,
      room_id: view === ViewState.PRIVATE_ROOM && activeRoom ? activeRoom.id : null
    }]);

    if (error) {
      showToast("FAILED TO SEND MESSAGE", 'error');
      console.error(error);
    }
  };

  const handleDeleteMessage = async (msgId: string, senderId: string) => {
    if (!user || user.id !== senderId) return;
    if (window.confirm("Delete this message permanently?")) {
      const { error } = await supabase.from('messages').delete().eq('id', msgId);
      if (error) {
        showToast("FAILED TO DELETE", 'error');
      } else {
        showToast("MESSAGE DELETED", 'success');
      }
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !roomNameInput.trim()) return;
    
    const roomId = `RM-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const roomKey = Math.random().toString(36).substr(2, 6).toUpperCase();

    const { data, error } = await supabase.from('rooms').insert([{
      id: roomId,
      key: roomKey,
      name: roomNameInput.trim(),
      creator_id: user.id
    }]).select().single();

    if (error) {
      showToast("FAILED: " + error.message, 'error');
    } else if (data) {
      setRoomNameInput('');
      fetchUserRooms(user.id);
      enterRoom(data);
      showToast("ROOM CREATED SUCCESSFULLY", 'success');
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', joinRoomId.trim())
      .single();

    if (error || !data) {
      showToast('ROOM NOT FOUND', 'error');
    } else {
      if (data.key === joinRoomKey.trim()) {
        enterRoom(data);
        showToast("JOINED ROOM", 'success');
      } else {
        showToast('INVALID ACCESS KEY', 'error');
      }
    }
  };

  const enterRoom = (room: Room) => {
    setActiveRoom(room);
    setJoinRoomId('');
    setJoinRoomKey('');
    setView(ViewState.PRIVATE_ROOM);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("COPIED TO CLIPBOARD", 'success');
  };

  const formatTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // --- Views ---

  return (
    <div className="flex flex-col h-screen bg-terminal-bg text-terminal-text relative">
      
      {/* GLOBAL TOAST NOTIFICATION - TOP RIGHT */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 pointer-events-none animate-in slide-in-from-right-10 fade-in duration-300">
          <div className={`pointer-events-auto min-w-[250px] max-w-sm px-5 py-4 border shadow-[0_0_20px_rgba(0,0,0,0.5)] backdrop-blur-md text-center font-bold tracking-widest text-sm ${
            toast.type === 'success' ? 'bg-terminal-green/10 border-terminal-green text-terminal-green' :
            toast.type === 'error' ? 'bg-red-900/40 border-terminal-alert text-terminal-alert' :
            'bg-terminal-gray/90 border-terminal-dim text-white'
          }`}>
            <div className="flex items-center gap-3">
              {toast.type === 'success' ? <div className="w-2 h-2 bg-terminal-green rounded-full animate-pulse"/> : 
               toast.type === 'error' ? <AlertTriangle size={16} /> : 
               <div className="w-2 h-2 bg-white rounded-full animate-pulse"/>}
              <span>{toast.msg}</span>
            </div>
          </div>
        </div>
      )}

      {view === ViewState.AUTH && (
        <div className="flex flex-col items-center justify-center flex-1 p-4">
          <div className={`w-full max-w-md border p-8 shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-colors duration-300 ${isRegistering ? 'border-yellow-600 bg-yellow-900/10' : 'border-terminal-green/50 bg-terminal-gray/10'}`}>
            
            <div className="mb-8 text-center">
              <div className="flex items-center justify-center gap-4 mb-2">
                <Logo className="h-16 w-16" />
                <h1 className={`text-4xl font-bold tracking-[0.2em] ${isRegistering ? 'text-yellow-500' : 'text-terminal-green'}`}>
                  CHAT
                </h1>
              </div>
              <p className={`text-xs tracking-wider font-mono ${isRegistering ? 'text-yellow-500/70' : 'text-terminal-green/70'}`}>
                connect easier to everywhere
              </p>
            </div>
            
            <div className="flex gap-4 mb-8 text-sm justify-center border-b border-gray-800 pb-1">
               <button 
                 onClick={() => { setIsRegistering(false); }} 
                 className={`px-4 py-2 transition-colors ${!isRegistering ? 'text-terminal-green border-b-2 border-terminal-green' : 'text-terminal-dim hover:text-gray-400'}`}
               >
                 LOGIN
               </button>
               <button 
                 onClick={() => { setIsRegistering(true); }} 
                 className={`px-4 py-2 transition-colors ${isRegistering ? 'text-yellow-500 border-b-2 border-yellow-500' : 'text-terminal-dim hover:text-gray-400'}`}
               >
                 REGISTER
               </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
              <div>
                <label className={`text-xs block mb-1 font-bold ${isRegistering ? 'text-yellow-500/70' : 'text-terminal-green/70'}`}>USERNAME</label>
                <input 
                  type="text" 
                  value={usernameInput} 
                  onChange={e => setUsernameInput(e.target.value)} 
                  className={`w-full bg-terminal-dark border p-3 text-terminal-text outline-none focus:border-opacity-100 transition-colors ${isRegistering ? 'border-yellow-600/30 focus:border-yellow-500' : 'border-terminal-green/30 focus:border-terminal-green'}`}
                  placeholder="Enter username" 
                  required
                />
              </div>
              
              <div>
                <label className={`text-xs block mb-1 font-bold ${isRegistering ? 'text-yellow-500/70' : 'text-terminal-green/70'}`}>PASSWORD</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={passwordInput} 
                    onChange={e => setPasswordInput(e.target.value)} 
                    className={`w-full bg-terminal-dark border p-3 text-terminal-text outline-none focus:border-opacity-100 pr-10 transition-colors ${isRegistering ? 'border-yellow-600/30 focus:border-yellow-500' : 'border-terminal-green/30 focus:border-terminal-green'}`}
                    placeholder="******" 
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute right-3 top-3 hover:opacity-100 transition-opacity ${isRegistering ? 'text-yellow-500/70' : 'text-terminal-green/70'}`}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Warning Message for Registration */}
              {isRegistering && (
                <div className="flex items-start gap-3 bg-yellow-950/40 border border-yellow-600/40 p-3 text-xs text-yellow-500 rounded">
                  <AlertTriangle size={20} className="shrink-0" />
                  <div>
                    <span className="font-bold block mb-1 text-sm">IMPORTANT WARNING</span>
                    Passwords cannot be recovered if lost. Please memorize your credentials or save them in a secure location.
                  </div>
                </div>
              )}
              
              <button 
                disabled={loading} 
                className={`w-full font-bold py-3 hover:bg-opacity-90 flex justify-center transition-colors ${
                  isRegistering ? 'bg-yellow-600 text-black' : 'bg-terminal-green text-black'
                }`}
              >
                {loading ? <Loader2 className="animate-spin"/> : (isRegistering ? 'CREATE SECURE ID' : 'AUTHENTICATE ACCESS')}
              </button>
            </form>
          </div>
        </div>
      )}

      {view === ViewState.DASHBOARD && (
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-4xl mx-auto">
            {/* UPDATED DASHBOARD HEADER: LOGO + BRAND NAME */}
            <header className="flex justify-between items-center py-6 border-b border-terminal-green/20 mb-8">
              <div className="flex items-center gap-4">
                <Logo className="h-10 w-10" />
                <div className="flex flex-col">
                  <h1 className="text-2xl font-bold tracking-wider text-terminal-green leading-none">CHAT</h1>
                  <span className="text-[10px] text-terminal-dim font-mono tracking-widest uppercase">connect easier to everywhere</span>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <span className="hidden sm:inline-block text-[10px] text-terminal-dim border border-terminal-dim/30 px-2 py-1 rounded">USER: {user?.username}</span>
                <button onClick={handleLogout} className="text-terminal-alert border border-terminal-alert/30 px-3 py-1 text-sm hover:bg-terminal-alert/10 flex items-center gap-2 transition-colors">
                  <LogOut size={14} /> <span className="hidden sm:inline">LOGOUT</span>
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button onClick={() => setView(ViewState.PUBLIC_CHAT)} className="group h-48 border border-terminal-green/30 bg-terminal-gray/10 hover:bg-terminal-gray/20 p-6 text-left flex flex-col justify-between relative overflow-hidden transition-all">
                <Globe className="absolute top-4 right-4 text-terminal-green/10 group-hover:text-terminal-green/20 transition-all" size={80} />
                <div className="flex items-center gap-3 z-10">
                  <MessageSquare className="text-terminal-green" size={24} />
                  <h3 className="text-lg font-bold">PUBLIC CHANNEL</h3>
                </div>
                <p className="text-terminal-dim text-sm z-10">Global access point.</p>
              </button>

              <div className="space-y-6">
                <div className="border border-terminal-green/30 bg-terminal-gray/10 p-6">
                   <h3 className="font-bold text-terminal-text mb-4 flex gap-2"><Plus size={20} className="text-terminal-green"/> CREATE ROOM</h3>
                   <form onSubmit={handleCreateRoom} className="flex gap-2 flex-col">
                      <div className="flex gap-2">
                        <input type="text" value={roomNameInput} onChange={e => setRoomNameInput(e.target.value)} placeholder="ROOM NAME" className="flex-1 bg-terminal-dark border border-terminal-dim/30 px-3 py-2 text-sm text-white outline-none focus:border-terminal-green"/>
                        <button className="bg-terminal-green/20 text-terminal-green border border-terminal-green/50 px-4 py-2 text-sm font-bold hover:bg-terminal-green hover:text-black">CREATE</button>
                      </div>
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
                   </form>
                </div>
              </div>
              
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
      )}

      {(view === ViewState.PUBLIC_CHAT || view === ViewState.PRIVATE_ROOM) && (
        <>
          <header className="p-4 border-b border-terminal-green/30 bg-terminal-gray/10 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md">
             <div className="flex items-center gap-4">
               <button onClick={() => setView(ViewState.DASHBOARD)} className="hover:text-terminal-green"><ArrowRight className="rotate-180" size={20}/></button>
               <div>
                 <h2 className="font-bold text-terminal-green flex items-center gap-2">
                   {view === ViewState.PUBLIC_CHAT ? <Globe size={18}/> : <Lock size={18}/>} 
                   {view === ViewState.PUBLIC_CHAT ? "PUBLIC CHANNEL" : activeRoom?.name}
                 </h2>
                 {view === ViewState.PRIVATE_ROOM && activeRoom && (
                   <div className="text-[10px] text-terminal-dim flex gap-2">
                     <span>ID: {activeRoom.id}</span>
                     <button onClick={() => copyToClipboard(activeRoom.key)} className="text-terminal-green hover:underline">
                       COPY KEY
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
                    <span className="text-[10px] text-terminal-dim flex items-center gap-1">
                      {formatTime(msg.created_at)}
                    </span>
                    {msg.user_id === user?.id && (
                      <button onClick={() => handleDeleteMessage(msg.id, msg.user_id)} className="text-terminal-dim hover:text-red-500 ml-1"><Trash2 size={10}/></button>
                    )}
                 </div>
                 <div 
                   onClick={() => copyToClipboard(msg.content)}
                   onDoubleClick={() => handleDeleteMessage(msg.id, msg.user_id)}
                   className={`px-3 py-2 rounded text-sm max-w-[85%] border cursor-pointer hover:bg-opacity-20 transition-colors ${
                     msg.is_ai 
                     ? 'border-blue-500/30 bg-blue-900/10 text-blue-100' 
                     : (msg.user_id === user?.id ? 'border-terminal-green/30 bg-terminal-green/10 text-white hover:bg-terminal-green/20' : 'border-terminal-dim/30 bg-terminal-gray/20 text-gray-200 hover:bg-terminal-gray/30')
                   }`}
                 >
                   {msg.content}
                 </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendMessage} className="p-4 border-t border-terminal-green/30 bg-terminal-gray/10">
            <div className="flex gap-2">
               <input 
                 value={messageInput}
                 onChange={e => setMessageInput(e.target.value)}
                 className="flex-1 bg-terminal-dark border border-terminal-dim/30 px-4 py-2 text-white outline-none focus:border-terminal-green font-mono"
                 placeholder={view === ViewState.PUBLIC_CHAT ? "Message public channel..." : "Message secure room..."}
                 autoFocus
               />
               <button type="submit" className="bg-terminal-green text-black px-4 py-2 font-bold hover:bg-opacity-90"><Send size={18}/></button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export default App;
import React, { useState, useEffect, useCallback } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';

const buildChatMessage = (message, sender, role, idOverride) => ({
  id: idOverride || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  text: message,
  sender: sender || 'Anonymous',
  role: role || 'candidate',
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
});

export const ChatPanel = ({ roomId, messages = [], onMessagesChange = () => {} }) => {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [inputMessage, setInputMessage] = useState('');
  const [chatMessages, setChatMessages] = useState(messages.length ? messages : []);

  useEffect(() => {
    if (messages?.length) {
      setChatMessages((prev) => {
        const incoming = messages.filter((entry) => !prev.some((item) => item.id === entry.id));
        return incoming.length ? [...prev, ...incoming] : prev;
      });
    }
  }, [messages]);

  useEffect(() => {
    onMessagesChange(chatMessages);
  }, [chatMessages, onMessagesChange]);

  const addMessage = useCallback((msg) => {
    const normalizedText = msg?.text ?? msg?.message;
    if (!normalizedText) return;

    setChatMessages((prev) => {
      const alreadyExists = prev.some((entry) => entry.id === msg.id || (entry.text === normalizedText && entry.sender === msg.sender && entry.timestamp === msg.timestamp));
      if (alreadyExists) return prev;
      return [...prev, { ...msg, text: normalizedText }];
    });
  }, []);

  const getMessageToneClasses = (message) => {
    const role = String(message?.role || '').trim().toLowerCase();
    const isCurrentUser = message?.sender === user?.name;

    if (isCurrentUser) {
      return 'bg-indigo-950/60 border border-indigo-800/40 text-indigo-100 ml-4';
    }

    if (role === 'interviewer') {
      return 'bg-amber-950/60 border border-amber-800/40 text-amber-100 mr-4';
    }

    return 'bg-cyan-950/60 border border-cyan-800/40 text-cyan-100 mr-4';
  };

  useEffect(() => {
    if (!socket) return;

    const handleIncomingMessage = (msg) => {
      const payload = msg || {};
      const normalizedMessage = buildChatMessage(
        payload?.text ?? payload?.message ?? '',
        payload?.sender || payload?.user?.name || 'Anonymous',
        payload?.role || payload?.user?.role || 'candidate',
        payload?.id
      );
      addMessage(normalizedMessage);
    };

    const handleRoomChatHistory = ({ messages = [] }) => {
      messages.forEach((entry) => {
        const normalized = buildChatMessage(
          entry?.text ?? entry?.message ?? '',
          entry?.sender || entry?.user?.name || 'Anonymous',
          entry?.role || entry?.user?.role || 'candidate',
          entry?.id
        );
        addMessage(normalized);
      });
    };

    socket.on('new-chat-message', handleIncomingMessage);
    socket.on('room-chat-history', handleRoomChatHistory);

    return () => {
      socket.off('new-chat-message', handleIncomingMessage);
      socket.off('room-chat-history', handleRoomChatHistory);
    };
  }, [socket, addMessage]);

  const handleSend = (e) => {
    e.preventDefault();
    const trimmed = inputMessage.trim();
    if (!trimmed || !socket) return;

    const localMessage = buildChatMessage(
      trimmed,
      user?.name || 'You',
      user?.role || 'candidate',
      `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    );

    addMessage(localMessage);
    socket.emit('send-chat-message', {
      roomId,
      message: trimmed,
      sender: user?.name || 'You',
      role: user?.role || 'candidate',
      user,
      messageId: localMessage.id,
    });
    setInputMessage('');
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      <div className="px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-indigo-400" /> Room Chat
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
        {chatMessages.map((m) => (
          <div
            key={m.id}
            className={`p-2 rounded-lg text-xs leading-relaxed ${getMessageToneClasses(m)}`}
          >
            <div className="flex items-center justify-between text-[10px] font-mono mb-0.5">
              <span className="font-bold">
                {m.role === 'interviewer' ? 'Interviewer' : m.role === 'candidate' ? 'Candidate' : m.sender}
              </span>
              <span className="opacity-80">{m.timestamp}</span>
            </div>
            <p>{m.text}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="p-2 border-t border-slate-800 flex items-center gap-2 bg-slate-900/80 flex-shrink-0">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Type message..."
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-sans"
        />
        <button
          type="submit"
          className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          disabled={!inputMessage.trim()}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};

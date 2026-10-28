import { Interview } from '../models/Interview.js';

/**
 * Socket.IO Handler for Real-Time Collaborative Coding, WebRTC Signaling, and Interview Room State
 */
export const setupInterviewSocket = (io) => {
  const startRoomTimer = (roomId) => {
    const room = roomState.get(roomId);
    if (!room || room.timerInterval) return;

    room.timerInterval = setInterval(() => {
      const currentRoom = roomState.get(roomId);
      if (!currentRoom) return;

      currentRoom.timerSeconds = Math.max(0, (currentRoom.timerSeconds || 0) - 1);
      io.to(roomId).emit('room-timer-sync', {
        roomId,
        timerSeconds: currentRoom.timerSeconds,
      });

      if (currentRoom.timerSeconds <= 0) {
        clearInterval(currentRoom.timerInterval);
        currentRoom.timerInterval = null;
        io.to(roomId).emit('session-ended', {
          roomId,
          message: 'The interview timer has expired. This session is now closed for both participants.',
          chatMessages: currentRoom.chatMessages || [],
          notes: currentRoom.notes || '',
        });
      }
    }, 1000);
  };

  const markInterviewEnded = async (roomId) => {
    if (!roomId) return null;

    return Interview.findOneAndUpdate(
      { roomId },
      {
        $set: {
          status: 'ended',
          endedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { new: true },
    ).catch(() => null);
  };

  const canJoinInterviewRoom = async (roomId) => {
    if (!roomId) return false;

    const interview = await Interview.findOne({ roomId }).select('status scheduledAt').lean().catch(() => null);
    if (!interview) return true;

    const normalized = String(interview.status || '').trim().toLowerCase();
    if (['completed', 'finished', 'cancelled', 'ended', 'closed'].includes(normalized)) {
      return false;
    }

    const scheduledAt = interview.scheduledAt ? new Date(interview.scheduledAt).getTime() : null;
    if (Number.isFinite(scheduledAt) && Date.now() < scheduledAt) {
      return false;
    }

    return true;
  };
  // Store room state in-memory
  const roomState = new Map();

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Join Interview Room
    socket.on('join-room', async ({ roomId, user }) => {
      if (!roomId) {
        return;
      }

      const isAllowed = await canJoinInterviewRoom(roomId);
      if (!isAllowed) {
        const interview = await Interview.findOne({ roomId }).select('status scheduledAt').lean().catch(() => null);
        const scheduledAt = interview?.scheduledAt ? new Date(interview.scheduledAt) : null;
        const message = scheduledAt && scheduledAt.getTime() > Date.now()
          ? `This interview room opens at ${scheduledAt.toLocaleString()}. Please join when the scheduled time begins.`
          : 'This interview session has already ended and cannot be rejoined.';

        socket.emit('room-not-ready', {
          roomId,
          message,
          scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
        });
        return;
      }

      socket.join(roomId);

      if (!roomState.has(roomId)) {
        roomState.set(roomId, {
          code: '// Select a language and start coding...',
          language: 'javascript',
          participants: new Map(),
          timerSeconds: 45 * 60,
          chatMessages: [],
          notes: '',
          timerInterval: null,
        });
      }

      const room = roomState.get(roomId);
      if (!room.timerInterval) {
        startRoomTimer(roomId);
      }
      const participantInfo = {
        socketId: socket.id,
        user: user || { name: 'Anonymous Candidate', role: 'candidate' },
        joinedAt: new Date(),
      };
      room.participants.set(socket.id, participantInfo);

      // Send existing room code, chat, and notes state to newly joined user
      socket.emit('room-state-init', {
        code: room.code,
        language: room.language,
        participants: Array.from(room.participants.values()),
        timerSeconds: room.timerSeconds,
        chatMessages: room.chatMessages || [],
        notes: room.notes || '',
      });

      // Broadcast new participant arrival to room
      socket.to(roomId).emit('user-joined-room', {
        participant: participantInfo,
        participants: Array.from(room.participants.values()),
      });

      console.log(`[Socket.IO] User ${user?.name || socket.id} joined room ${roomId}`);
    });

    // Real-Time Collaborative Code Sync
    socket.on('code-change', ({ roomId, code, language }) => {
      const room = roomState.get(roomId);
      if (room) {
        room.code = code;
        if (language) room.language = language;
      }
      // Broadcast change to other peers in room
      socket.to(roomId).emit('code-update', { code, language, updatedBy: socket.id });
    });

    // Language Change Sync
    socket.on('language-change', ({ roomId, language }) => {
      const room = roomState.get(roomId);
      if (room) room.language = language;
      socket.to(roomId).emit('language-update', { language });
    });

    // Cursor Movement & Selection Sync
    socket.on('cursor-move', ({ roomId, cursorPosition, user }) => {
      socket.to(roomId).emit('cursor-update', {
        socketId: socket.id,
        cursorPosition,
        user,
      });
    });

    // Live Room Chat Messages
    socket.on('send-chat-message', ({ roomId, message, user, messageId }) => {
      const room = roomState.get(roomId);
      const chatPayload = {
        id: messageId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        text: message,
        sender: user?.name || 'Anonymous',
        role: user?.role || 'candidate',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      if (room) {
        if (!room.chatMessages) room.chatMessages = [];
        room.chatMessages.push(chatPayload);
      }
      io.to(roomId).emit('new-chat-message', chatPayload);
    });

    // Live Room Notes Sync
    socket.on('notes-change', ({ roomId, notes }) => {
      const room = roomState.get(roomId);
      if (room) {
        room.notes = notes;
      }
      socket.to(roomId).emit('notes-update', { notes });
    });

    // WebRTC Signaling: Offer
    socket.on('webrtc-offer', ({ roomId, offer, targetSocketId }) => {
      const destination = targetSocketId || roomId;
      socket.to(destination).emit('webrtc-offer-received', {
        offer,
        senderSocketId: socket.id,
      });
    });

    // WebRTC Signaling: Answer
    socket.on('webrtc-answer', ({ roomId, answer, targetSocketId }) => {
      const destination = targetSocketId || roomId;
      socket.to(destination).emit('webrtc-answer-received', {
        answer,
        senderSocketId: socket.id,
      });
    });

    // WebRTC Signaling: ICE Candidate
    socket.on('webrtc-ice-candidate', ({ roomId, candidate, targetSocketId }) => {
      const destination = targetSocketId || roomId;
      socket.to(destination).emit('webrtc-ice-candidate-received', {
        candidate,
        senderSocketId: socket.id,
      });
    });

    socket.on('end-call', async ({ roomId, user }) => {
      if (!roomId) return;

      const room = roomState.get(roomId);
      const savedNotes = room?.notes || '';
      const savedChat = room?.chatMessages || [];

      try {
        await Interview.findOneAndUpdate(
          { roomId },
          {
            $set: {
              status: 'completed',
              endedAt: new Date(),
              updatedAt: new Date(),
              interviewerNotes: savedNotes,
              chatMessages: savedChat,
              transcript: savedChat,
            },
          },
          { new: true }
        );
      } catch (err) {
        console.warn('[end-call] Failed to persist notes/chat to Interview:', err.message);
      }

      await markInterviewEnded(roomId);

      const endMessage = `${user?.name || 'A participant'} ended the interview. The session is now closed for everyone.`;

      io.in(roomId).emit('session-ended', {
        roomId,
        message: endMessage,
        chatMessages: savedChat,
        notes: savedNotes,
      });

      try { io.in(roomId).socketsLeave(roomId); } catch (_) {}

      if (room) {
        if (room.timerInterval) {
          clearInterval(room.timerInterval);
          room.timerInterval = null;
        }
        room.participants.clear();
        roomState.delete(roomId);
      }
    });

    // Disconnect Handler
    socket.on('disconnecting', async () => {
      for (const roomId of socket.rooms) {
        if (roomId !== socket.id && roomState.has(roomId)) {
          const room = roomState.get(roomId);
          const leavingUser = room.participants.get(socket.id);

          if (room.participants.has(socket.id)) {
            room.participants.delete(socket.id);
          }

          socket.to(roomId).emit('user-left-room', {
            socketId: socket.id,
            user: leavingUser?.user,
            participants: Array.from(room.participants.values()),
          });

          if (room.participants.size === 0) {
            if (room.timerInterval) {
              clearInterval(room.timerInterval);
              room.timerInterval = null;
            }
            await markInterviewEnded(roomId);
            roomState.delete(roomId);
            continue;
          }

          // Keep the room open while another participant is still connected.
          // Only the final participant leaves should close the live interview.
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });
};

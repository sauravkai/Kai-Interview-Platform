import test from 'node:test';
import assert from 'node:assert/strict';

import { setupInterviewSocket } from '../src/sockets/interviewSocket.js';
import { Interview } from '../src/models/Interview.js';

test('end-call does not crash when the room namespace has no socketsLeave helper', async () => {
  const listeners = {};
  let emittedSessionEnded = null;

  Interview.findOneAndUpdate = async () => ({ status: 'ended' });

  const io = {
    on: (event, handler) => {
      if (event === 'connection') {
        listeners.connection = handler;
      }
    },
    in: () => ({
      emit: (eventName, payload) => {
        if (eventName === 'session-ended') {
          emittedSessionEnded = payload;
        }
      },
      fetchSockets: async () => [],
    }),
    to: () => ({ emit: () => {} }),
    sockets: { sockets: new Map() },
  };

  const socket = {
    id: 'socket-123',
    rooms: new Set(['room-42', 'socket-123']),
    data: {},
    emit: () => {},
    on: (event, handler) => {
      listeners[event] = handler;
    },
    join: async () => {},
    leave: async () => {},
    to: () => ({ emit: () => {} }),
  };

  setupInterviewSocket(io);
  await listeners.connection(socket);

  await assert.doesNotReject(async () => {
    await listeners['end-call']({ roomId: 'room-42', user: { name: 'Tester' } });
  });

  assert.equal(emittedSessionEnded.roomId, 'room-42');
  assert.match(emittedSessionEnded.message, /Tester ended the interview/);
});

test('disconnecting keeps a live room open while another participant is still connected', async () => {
  const events = [];
  const listeners = {};

  Interview.findOneAndUpdate = async () => ({ status: 'ended' });

  const io = {
    on: (event, handler) => {
      if (event === 'connection') {
        listeners.connection = handler;
      }
    },
    in: () => ({
      emit: (eventName, payload) => {
        events.push({ eventName, payload });
      },
    }),
    to: (roomId) => ({
      emit: (eventName, payload) => {
        events.push({ roomId, eventName, payload });
      },
    }),
  };

  const createSocket = (id) => {
    const socket = {
      id,
      rooms: new Set([id]),
      data: {},
      emit: () => {},
      on: (event, handler) => {
        socket.handlers[event] = handler;
      },
      join: async (roomId) => {
        socket.rooms.add(roomId);
      },
      leave: async (roomId) => {
        socket.rooms.delete(roomId);
      },
      to: (roomId) => ({
        emit: (eventName, payload) => {
          events.push({ roomId, eventName, payload });
        },
      }),
      handlers: {},
    };
    return socket;
  };

  setupInterviewSocket(io);

  const leavingSocket = createSocket('socket-1');
  const stayingSocket = createSocket('socket-2');

  await listeners.connection(leavingSocket);
  await listeners.connection(stayingSocket);

  await leavingSocket.handlers['join-room']({ roomId: 'room-42', user: { name: 'alpha', role: 'interviewer' } });
  await stayingSocket.handlers['join-room']({ roomId: 'room-42', user: { name: 'beta', role: 'candidate' } });

  await leavingSocket.handlers['disconnecting']();

  const userLeftEvents = events.filter((event) => event.eventName === 'user-left-room');
  const endedEvents = events.filter((event) => event.eventName === 'session-ended');

  assert.equal(userLeftEvents.length >= 1, true);
  assert.equal(endedEvents.length, 0);
});

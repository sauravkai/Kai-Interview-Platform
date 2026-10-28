import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { normalizeSocketUrl } from '../utils/socketUrl';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Support multi-domain production deployments via env variable
    const socketUrl = normalizeSocketUrl(
      import.meta.env.VITE_SOCKET_URL,
      import.meta.env.VITE_API_URL,
    );

    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      forceNew: true,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      setIsConnected(false);
      console.warn('[Socket] connection error:', error?.message || 'Unknown socket error');
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);

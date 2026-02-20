import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || '';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState(0);

  useEffect(() => {
    const socket = io(API_URL || window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('users:count', (count) => setConnectedUsers(count));

    return () => {
      socket.disconnect();
    };
  }, []);

  return { socket: socketRef.current, connected, connectedUsers };
}

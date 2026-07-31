'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { PeerMessage, RoomState } from '@/types';
import { generateRoomCode } from '@/lib/roomCode';

function peerIdFromCode(gameId: string, code: string): string {
  return `gamehub-${gameId}-${code.toUpperCase().replace(/\s/g, '')}`;
}

export function usePeer(gameId: string) {
  const [roomState, setRoomState] = useState<RoomState>({
    status: 'idle',
    roomCode: '',
  });
  const [connection, setConnection] = useState<DataConnection | null>(null);
  const [isHost, setIsHost] = useState(false);
  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<DataConnection | null>(null);

  const cleanup = useCallback(() => {
    connectionRef.current?.close();
    peerRef.current?.destroy();
    peerRef.current = null;
    connectionRef.current = null;
    setConnection(null);
  }, []);

  const setupConnection = useCallback((conn: DataConnection) => {
    connectionRef.current = conn;

    conn.on('open', () => {
      setConnection(conn);
      setRoomState((prev) => ({ ...prev, status: 'connected' }));
    });

    conn.on('close', () => {
      setConnection(null);
      setRoomState({ status: 'idle', roomCode: '' });
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      setRoomState((prev) => ({ ...prev, status: 'error', error: 'Connection lost' }));
    });
  }, []);

  const createRoom = useCallback(() => {
    cleanup();
    const code = generateRoomCode();
    const peerId = peerIdFromCode(gameId, code);

    setRoomState({ status: 'creating', roomCode: code });
    setIsHost(true);

    const peer = new Peer(peerId, {
      debug: 0,
    });

    peer.on('open', () => {
      setRoomState({ status: 'waiting', roomCode: code });
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'unavailable-id') {
        // Room code collision, try again
        cleanup();
        createRoom();
      } else {
        setRoomState((prev) => ({
          ...prev,
          status: 'error',
          error: 'Failed to create room. Please try again.',
        }));
      }
    });

    peerRef.current = peer;
  }, [gameId, cleanup, setupConnection]);

  const joinRoom = useCallback(
    (code: string) => {
      cleanup();
      const peerId = peerIdFromCode(gameId, code);
      const myId = `${peerId}-guest-${Math.random().toString(36).slice(2, 6)}`;

      setRoomState({ status: 'joining', roomCode: code });
      setIsHost(false);

      const peer = new Peer(myId, {
        debug: 0,
      });

      peer.on('open', () => {
        const conn = peer.connect(peerId, { reliable: true });
        setupConnection(conn);

        // Timeout if connection doesn't establish
        setTimeout(() => {
          if (!connectionRef.current?.open) {
            setRoomState({
              status: 'error',
              roomCode: code,
              error: 'Room not found or host disconnected.',
            });
          }
        }, 10000);
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        setRoomState({
          status: 'error',
          roomCode: code,
          error: 'Could not connect. Check the room code and try again.',
        });
      });

      peerRef.current = peer;
    },
    [gameId, cleanup, setupConnection],
  );

  const sendMessage = useCallback((type: string, payload: unknown) => {
    if (connectionRef.current?.open) {
      const msg: PeerMessage = { type, payload };
      connectionRef.current.send(msg);
    }
  }, []);

  const disconnect = useCallback(() => {
    cleanup();
    setRoomState({ status: 'idle', roomCode: '' });
    setIsHost(false);
  }, [cleanup]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    roomState,
    connection,
    isHost,
    createRoom,
    joinRoom,
    sendMessage,
    disconnect,
  };
}

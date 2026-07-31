import { DataConnection } from 'peerjs';

export interface GameDefinition {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  category: 'reflex' | 'strategy' | 'creative' | 'word' | 'memory' | 'social' | 'knowledge' | 'perception' | 'co-op';
  minPlayers: number;
  maxPlayers: number;
}

export interface PeerMessage {
  type: string;
  payload: unknown;
}

export interface GameProps {
  connection: DataConnection;
  isHost: boolean;
  onGameEnd?: () => void;
}

export interface RoomState {
  status: 'idle' | 'creating' | 'joining' | 'waiting' | 'connected' | 'error';
  roomCode: string;
  error?: string;
}

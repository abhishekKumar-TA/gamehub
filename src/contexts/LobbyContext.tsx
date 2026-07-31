"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Peer, { DataConnection } from "peerjs";
import { RoomState } from "@/types";
import { generateRoomCode } from "@/lib/roomCode";

// Minimal event emitter for browser
type Listener = (...args: unknown[]) => void;
class SimpleEmitter {
  private listeners: Record<string, Listener[]> = {};
  on(event: string, fn: Listener) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
    return this;
  }
  off(event: string, fn: Listener) {
    this.listeners[event] = (this.listeners[event] || []).filter((l) => l !== fn);
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    (this.listeners[event] || []).forEach((fn) => fn(...args));
    return this;
  }
}

interface LobbyContextType {
  roomState: RoomState;
  connection: DataConnection | null;
  isHost: boolean;
  isBotMode: boolean;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  playWithBot: () => void;
  disconnect: () => void;
}

const LobbyContext = createContext<LobbyContextType | null>(null);

export function useLobby() {
  const ctx = useContext(LobbyContext);
  if (!ctx) throw new Error("useLobby must be used within LobbyProvider");
  return ctx;
}

// Bot connection that emulates a DataConnection
class BotConnection extends SimpleEmitter {
  open = true;
  peer = "bot";
  metadata: unknown = {};
  label = "bot";
  reliable = true;

  send(data: unknown) {
    // The game component sends data to the "remote" (bot).
    // We emit 'bot-receive' so bot logic can respond.
    setTimeout(() => {
      this.emit("bot-receive", data);
    }, 50);
  }

  close() {
    this.open = false;
    this.emit("close");
  }

  // Simulate receiving data from bot
  simulateReceive(data: unknown) {
    this.emit("data", data);
  }
}

function peerIdFromCode(code: string): string {
  return `gamehub-lobby-${code.toUpperCase().replace(/\s/g, "")}`;
}

export function LobbyProvider({ children }: { children: React.ReactNode }) {
  const [roomState, setRoomState] = useState<RoomState>({
    status: "idle",
    roomCode: "",
  });
  const [connection, setConnection] = useState<DataConnection | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isBotMode, setIsBotMode] = useState(false);
  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<DataConnection | null>(null);

  const cleanup = useCallback(() => {
    connectionRef.current?.close();
    peerRef.current?.destroy();
    peerRef.current = null;
    connectionRef.current = null;
    setConnection(null);
    setIsBotMode(false);
  }, []);

  const setupConnection = useCallback((conn: DataConnection) => {
    connectionRef.current = conn;

    conn.on("open", () => {
      setConnection(conn);
      setRoomState((prev) => ({ ...prev, status: "connected" }));
    });

    conn.on("close", () => {
      setConnection(null);
      setRoomState({ status: "idle", roomCode: "" });
      setIsBotMode(false);
    });

    conn.on("error", (err) => {
      console.error("Connection error:", err);
      setRoomState((prev) => ({ ...prev, status: "error", error: "Connection lost" }));
    });
  }, []);

  const createRoom = useCallback(() => {
    cleanup();
    const code = generateRoomCode();
    const peerId = peerIdFromCode(code);

    setRoomState({ status: "creating", roomCode: code });
    setIsHost(true);

    const peer = new Peer(peerId, { debug: 0 });

    peer.on("open", () => {
      setRoomState({ status: "waiting", roomCode: code });
    });

    peer.on("connection", (conn) => {
      setupConnection(conn);
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      if (err.type === "unavailable-id") {
        cleanup();
        createRoom();
      } else {
        setRoomState((prev) => ({
          ...prev,
          status: "error",
          error: "Failed to create room. Please try again.",
        }));
      }
    });

    peerRef.current = peer;
  }, [cleanup, setupConnection]);

  const joinRoom = useCallback(
    (code: string) => {
      cleanup();
      const peerId = peerIdFromCode(code);
      const myId = `${peerId}-guest-${Math.random().toString(36).slice(2, 6)}`;

      setRoomState({ status: "joining", roomCode: code });
      setIsHost(false);

      const peer = new Peer(myId, { debug: 0 });

      peer.on("open", () => {
        const conn = peer.connect(peerId, { reliable: true });
        setupConnection(conn);

        setTimeout(() => {
          if (!connectionRef.current?.open) {
            setRoomState({
              status: "error",
              roomCode: code,
              error: "Room not found or host disconnected.",
            });
          }
        }, 10000);
      });

      peer.on("error", (err) => {
        console.error("Peer error:", err);
        setRoomState({
          status: "error",
          roomCode: code,
          error: "Could not connect. Check the room code and try again.",
        });
      });

      peerRef.current = peer;
    },
    [cleanup, setupConnection],
  );

  const playWithBot = useCallback(() => {
    cleanup();
    const botConn = new BotConnection() as unknown as DataConnection;
    connectionRef.current = botConn;
    setConnection(botConn);
    setIsHost(true);
    setIsBotMode(true);
    setRoomState({ status: "connected", roomCode: "BOT-MODE" });
  }, [cleanup]);

  const disconnect = useCallback(() => {
    cleanup();
    setRoomState({ status: "idle", roomCode: "" });
    setIsHost(false);
    setIsBotMode(false);
  }, [cleanup]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return (
    <LobbyContext.Provider
      value={{
        roomState,
        connection,
        isHost,
        isBotMode,
        createRoom,
        joinRoom,
        playWithBot,
        disconnect,
      }}
    >
      {children}
    </LobbyContext.Provider>
  );
}

import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
});

export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    // Fixed configuration
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3003";
    const isDev = import.meta.env.VITE_IS_DEV === "true";

    const baseServerUrl = isDev ? apiUrl : apiUrl.replace("/archive", "");
    const socketPath = isDev ? "/socket.io/" : "/archive/socket.io/";

    const newSocket = io(baseServerUrl, {
      path: socketPath,
      transports: ["websocket", "polling"],
      autoConnect: true,
      upgrade: true,
      timeout: 20000,
    });

    // Add more detailed error logging
    newSocket.on("connect", () => {
      console.log("Socket connected successfully:", {
        id: newSocket.id,
        transport: newSocket.io.engine.transport.name,
      });
      setConnected(true);
      newSocket.emit("join-room", user.uid);
    });

    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      console.log("Connection details:", {
        apiUrl,
        socketPath,
        error: error.message,
      });
    });

    newSocket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setConnected(false);
    });

    newSocket.on("joined-room", (data) => {
      console.log("Joined room:", data);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

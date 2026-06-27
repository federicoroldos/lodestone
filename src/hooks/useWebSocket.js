import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useServer } from '@/context/ServerContext';

export function useWebSocket({ onLine, onHistory, onStats, onConnChange } = {}) {
  const { token } = useAuth();
  const { updateStatus, setActiveServerId, wsRef } = useServer();
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  // Keep latest callbacks in refs so the WS handler always calls current version
  const callbacksRef = useRef({ onLine, onHistory, onStats, onConnChange });
  useEffect(() => {
    callbacksRef.current = { onLine, onHistory, onStats, onConnChange };
  });

  const sendMessage = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, [wsRef]);

  useEffect(() => {
    mountedRef.current = true;
    if (!token) return;

    function connect() {
      if (!mountedRef.current) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        callbacksRef.current.onConnChange?.('ok');
      };

      ws.onmessage = (ev) => {
        if (!mountedRef.current) return;
        let msg;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }

        if (msg.type === 'meta') {
          if (msg.activeServerId) setActiveServerId(msg.activeServerId);
        } else if (msg.type === 'history') {
          callbacksRef.current.onHistory?.(msg);
        } else if (msg.type === 'line') {
          callbacksRef.current.onLine?.(msg);
        } else if (msg.type === 'status') {
          updateStatus(msg.status);
        } else if (msg.type === 'stats') {
          callbacksRef.current.onStats?.(msg.stats);
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        callbacksRef.current.onConnChange?.('bad');
        if (token) {
          reconnectTimer.current = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (_) {}
        wsRef.current = null;
      }
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return { sendMessage };
}

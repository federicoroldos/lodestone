import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';

const ServerContext = createContext(null);

export function ServerProvider({ children }) {
  const [servers, setServers] = useState([]);
  const [activeServerId, setActiveServerIdState] = useState(null);
  const [statuses, setStatuses] = useState({});
  const wsRef = useRef(null);

  const updateStatus = useCallback((status) => {
    setStatuses(prev => ({ ...prev, [status.serverId]: status }));
  }, []);

  const setActiveServerId = useCallback((id) => {
    setActiveServerIdState(id);
  }, []);

  const getServerStatus = useCallback((serverId) => {
    return statuses[serverId] || { status: 'offline', playerCount: 0, maxPlayers: 0 };
  }, [statuses]);

  // Look up the active server once per render; MapView and any other
  // consumer needs to react whenever the user switches servers or any
  // server's mapUrl is updated (via PUT /api/servers/:id/map or the regular
  // edit form). useMemo with these deps re-evaluates the URL only when
  // something the URL actually depends on changes.
  const activeServer = useMemo(
    () => servers.find((s) => s.id === activeServerId) || null,
    [servers, activeServerId]
  );
  const mapUrl = activeServer ? (activeServer.mapUrl || '') : '';

  return (
    <ServerContext.Provider value={{
      servers, setServers,
      activeServerId, setActiveServerId,
      activeServer,
      statuses, updateStatus, getServerStatus,
      mapUrl,
      wsRef,
    }}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  return useContext(ServerContext);
}

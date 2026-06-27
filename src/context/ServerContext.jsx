import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ServerContext = createContext(null);

export function ServerProvider({ children }) {
  const [servers, setServers] = useState([]);
  const [activeServerId, setActiveServerIdState] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [mapUrl, setMapUrl] = useState(null);
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

  return (
    <ServerContext.Provider value={{
      servers, setServers,
      activeServerId, setActiveServerId,
      statuses, updateStatus, getServerStatus,
      mapUrl, setMapUrl,
      wsRef,
    }}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  return useContext(ServerContext);
}

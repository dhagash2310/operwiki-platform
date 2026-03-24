const clients = new Map();

export function setupWebSocket(wss) {
  wss.on('connection', (ws) => {
    const id = Math.random().toString(36).slice(2);
    clients.set(id, ws);
    ws.on('close', () => clients.delete(id));
    ws.send(JSON.stringify({ type: 'connected' }));
  });
}

export function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(ws => ws.readyState === 1 && ws.send(msg));
}

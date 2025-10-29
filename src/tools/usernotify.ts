import http from 'http';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 55442;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch (_err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
        return;
      }

      const sessionId = typeof (payload as any).sessionId === 'string' ? (payload as any).sessionId.trim() : '';

      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Missing or invalid sessionId' }));
        return;
      }

      console.log(`Additional input is required, please input at http://localhost:3000/chat/${encodeURIComponent(sessionId)}`);

      res.writeHead(200);
      res.end();
    });
  } else {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: 'Method not allowed' }));
  }
});

server.listen(PORT, () => {
  console.log(`User notify server listening on port ${PORT}\n\n`);
});


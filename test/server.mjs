// Static server for the browser tests, with a few routes that mimic the API serving documents.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const base = process.argv[3] ? join(root, process.argv[3]) : root;
const port = Number(process.argv[2] || 4173);
const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.pdf': 'application/pdf',
    '.wasm': 'application/wasm', '.json': 'application/json',
};

createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/secure/doc.pdf') {
        if (req.headers['x-token'] !== 'secret') {
            res.writeHead(401).end('unauthorized');
            return;
        }
        res.writeHead(200, { 'content-type': 'application/pdf' }).end(await readFile(join(root, 'test/fixtures/multi.pdf')));
        return;
    }
    const path = normalize(join(base, decodeURIComponent(url.pathname)));
    if (!path.startsWith(base)) {
        res.writeHead(403).end();
        return;
    }
    try {
        const file = path.endsWith('/') ? join(path, 'index.html') : path;
        const data = await readFile(file);
        res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(data);
    } catch {
        res.writeHead(404).end('not found');
    }
}).listen(port, () => console.log(`serving ${base} on ${port}`));

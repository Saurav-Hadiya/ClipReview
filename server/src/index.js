import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import assets from './routes/assets.js';
import comments from './routes/comments.js';
import versions from './routes/versions.js';
import shares from './routes/shares.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api', assets);
app.use('/api', comments);
app.use('/api', versions);
app.use('/api', shares);
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'server_error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`VideoReview API on http://localhost:${port}`));

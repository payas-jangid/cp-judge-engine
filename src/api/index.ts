import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import apiRoutes from './routes';
import { setupWebSocket } from './ws';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);

const server = http.createServer(app);

// Initialize WebSocket server
setupWebSocket(server);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`API Server running on port ${PORT}`);
});

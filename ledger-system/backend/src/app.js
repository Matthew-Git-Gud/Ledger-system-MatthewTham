import express from 'express';
import cors from 'cors';
import { pool } from './db/pool.js';

export const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS connected');
    res.json({ status: 'ok', database: rows[0].connected === 1 ? 'connected' : 'unexpected' });
  } catch (error) {
    console.error('Database health check failed:', error.code ?? error.message);
    res.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
});

app.get('/accounts', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, account_type, currency, balance, status
       FROM accounts ORDER BY id`
    );
    res.json({ accounts: rows });
  } catch (error) {
    console.error('Account listing failed:', error.code ?? error.message);
    res.status(500).json({ error: 'DATABASE_ERROR' });
  }
});

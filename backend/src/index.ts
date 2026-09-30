import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { router } from './routes';
import { startReminders } from './services/reminders';

const app = express();
app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', router);

app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - t}ms`));
  next();
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`DuoSave API on :${port}`));
startReminders();

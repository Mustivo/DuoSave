import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { router } from './routes';
import { startReminders, checkAndSendReminders } from './services/reminders';

const app = express();
const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigin?.length ? corsOrigin : false }));
app.use(express.json());

app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - t}ms`));
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/cron/reminders', async (_req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || _req.headers.authorization !== `Bearer ${secret}`) return res.sendStatus(401);
  try {
    const reminded = await checkAndSendReminders();
    res.json({ ok: true, reminded });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
app.use('/api', router);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Humanize Zod validation errors
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    let userMsg = 'Please verify your input and try again.';
    if (issue) {
      const field = issue.path[0];
      if (field === 'amount') userMsg = 'Please enter a valid amount greater than 0.';
      else if (field === 'email') userMsg = 'Please enter a valid email address.';
      else if (field === 'name') userMsg = 'Please enter a valid name (1-40 characters).';
      else if (field === 'code') userMsg = 'Please enter a valid invite code.';
      else if (field === 'password') userMsg = 'Please provide a valid password.';
      else userMsg = issue.message || 'Invalid input provided.';
    }
    return res.status(400).json({ error: userMsg });
  }

  // Handle known PostgreSQL error codes
  if (err?.code === '23505') {
    return res.status(400).json({ error: 'This record or email already exists in the system.' });
  }
  if (err?.code === '23514') {
    return res.status(400).json({ error: 'The requested amount or value is outside the allowed limit.' });
  }
  if (err?.code === '23503') {
    return res.status(404).json({ error: 'The requested item or member could not be found.' });
  }

  const status = typeof err.status === 'number' ? err.status : 500;
  if (status >= 500) {
    console.error('[Internal Server Error]:', err);
    return res.status(status).json({
      error: 'We encountered an unexpected server issue. Please try again shortly.',
    });
  }

  // Sanitize 4xx messages
  const rawMsg: string = err.message || 'Something went wrong';
  const cleanMsg = rawMsg
    .replace(/^HttpError:\s*/i, '')
    .replace(/PGRST\d+[:\s]*/gi, '')
    .replace(/violates check constraint.*/gi, 'is outside allowed limits.')
    .trim();

  res.status(status).json({ error: cleanMsg || 'Something went wrong' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`DuoSave API on :${port}`));
startReminders();

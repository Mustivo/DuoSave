import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { router } from './routes';
import { startReminders, checkAndSendReminders } from './services/reminders';

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - t}ms`));
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/cron/reminders', async (_req, res) => {
  try {
    const reminded = await checkAndSendReminders();
    res.json({ ok: true, reminded });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
app.use('/api', router);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return res.status(400).json({ error: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Validation error' });
  }
  const status = typeof err.status === 'number' ? err.status : 500;
  res.status(status).json({ error: err.message ?? 'Something went wrong' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`DuoSave API on :${port}`));
startReminders();

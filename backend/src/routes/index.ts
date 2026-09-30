import { Router } from 'express';
import { auth } from './auth';
import { vault } from './vault';
import { money } from './money';
import { requireAuth } from '../middleware/auth';

export const router = Router();
router.use('/auth', auth);
router.use(requireAuth);
router.use(vault);
router.use(money);

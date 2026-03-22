import express, { Request, Response } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { User } from './types';
import { checkAndResetMonthlyDownloads, canUserDownload, recordDownload } from './logic';

const app = express();
const PORT = 3000;
const SECRET_KEY = 'your-secret-key';

app.use(cors());
app.use(express.json());

// Mock Database
const users: Record<string, User> = {};

// Middleware to verify JWT
const authenticateToken = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err: any, decoded: any) => {
    if (err) return res.sendStatus(403);
    (req as any).user = decoded;
    next();
  });
};

// 1. WeChat Login - Generate QR Code
app.get('/api/auth/wechat/qrcode', async (req, res) => {
  const mockLoginUrl = `https://example.com/wechat-login?session=${Date.now()}`;
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(mockLoginUrl);
    res.json({ qrCodeDataUrl, sessionId: Date.now() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// 2. WeChat Login - Callback (Simulated)
app.post('/api/auth/wechat/callback', (req, res) => {
  const { openid } = req.body;
  if (!openid) return res.status(400).json({ error: 'OpenID is required' });

  if (!users[openid]) {
    users[openid] = {
      openid,
      isMember: false,
      downloadsThisMonth: 0,
      lastDownloadMonth: new Date().getMonth(),
    };
  }

  const token = jwt.sign({ openid }, SECRET_KEY, { expiresIn: '7d' });
  res.json({ token, user: users[openid] });
});

// 3. Get User Status
app.get('/api/user/status', authenticateToken, (req, res) => {
  const { openid } = (req as any).user;
  let user = users[openid];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const currentMonth = new Date().getMonth();
  user = checkAndResetMonthlyDownloads(user, currentMonth);
  users[openid] = user;

  res.json({ user });
});

// 4. Create Payment Order (Simulated)
app.post('/api/payment/create', authenticateToken, async (req, res) => {
  const { openid } = (req as any).user;
  const mockPayUrl = `https://example.com/pay?openid=${openid}&amount=9.9`;
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(mockPayUrl);
    res.json({ qrCodeDataUrl, orderId: Date.now() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// 5. Payment Success Callback (Simulated)
app.post('/api/payment/success', authenticateToken, (req, res) => {
  const { openid } = (req as any).user;
  if (users[openid]) {
    users[openid].isMember = true;
    res.json({ success: true, user: users[openid] });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// 6. Check and Record Download
app.post('/api/user/download', authenticateToken, (req, res) => {
  const { openid } = (req as any).user;
  let user = users[openid];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const currentMonth = new Date().getMonth();
  user = checkAndResetMonthlyDownloads(user, currentMonth);

  try {
    user = recordDownload(user);
    users[openid] = user;
    res.json({ success: true, downloadsThisMonth: user.downloadsThisMonth });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

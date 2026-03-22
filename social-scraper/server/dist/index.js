"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const qrcode_1 = __importDefault(require("qrcode"));
const logic_1 = require("./logic");
const app = (0, express_1.default)();
const PORT = 3000;
const SECRET_KEY = 'your-secret-key';
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Mock Database
const users = {};
// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token)
        return res.sendStatus(401);
    jsonwebtoken_1.default.verify(token, SECRET_KEY, (err, decoded) => {
        if (err)
            return res.sendStatus(403);
        req.user = decoded;
        next();
    });
};
// 1. WeChat Login - Generate QR Code
app.get('/api/auth/wechat/qrcode', async (req, res) => {
    const mockLoginUrl = `https://example.com/wechat-login?session=${Date.now()}`;
    try {
        const qrCodeDataUrl = await qrcode_1.default.toDataURL(mockLoginUrl);
        res.json({ qrCodeDataUrl, sessionId: Date.now() });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});
// 2. WeChat Login - Callback (Simulated)
app.post('/api/auth/wechat/callback', (req, res) => {
    const { openid } = req.body;
    if (!openid)
        return res.status(400).json({ error: 'OpenID is required' });
    if (!users[openid]) {
        users[openid] = {
            openid,
            isMember: false,
            downloadsThisMonth: 0,
            lastDownloadMonth: new Date().getMonth(),
        };
    }
    const token = jsonwebtoken_1.default.sign({ openid }, SECRET_KEY, { expiresIn: '7d' });
    res.json({ token, user: users[openid] });
});
// 3. Get User Status
app.get('/api/user/status', authenticateToken, (req, res) => {
    const { openid } = req.user;
    let user = users[openid];
    if (!user)
        return res.status(404).json({ error: 'User not found' });
    const currentMonth = new Date().getMonth();
    user = (0, logic_1.checkAndResetMonthlyDownloads)(user, currentMonth);
    users[openid] = user;
    res.json({ user });
});
// 4. Create Payment Order (Simulated)
app.post('/api/payment/create', authenticateToken, async (req, res) => {
    const { openid } = req.user;
    const mockPayUrl = `https://example.com/pay?openid=${openid}&amount=9.9`;
    try {
        const qrCodeDataUrl = await qrcode_1.default.toDataURL(mockPayUrl);
        res.json({ qrCodeDataUrl, orderId: Date.now() });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});
// 5. Payment Success Callback (Simulated)
app.post('/api/payment/success', authenticateToken, (req, res) => {
    const { openid } = req.user;
    if (users[openid]) {
        users[openid].isMember = true;
        res.json({ success: true, user: users[openid] });
    }
    else {
        res.status(404).json({ error: 'User not found' });
    }
});
// 6. Check and Record Download
app.post('/api/user/download', authenticateToken, (req, res) => {
    const { openid } = req.user;
    let user = users[openid];
    if (!user)
        return res.status(404).json({ error: 'User not found' });
    const currentMonth = new Date().getMonth();
    user = (0, logic_1.checkAndResetMonthlyDownloads)(user, currentMonth);
    try {
        user = (0, logic_1.recordDownload)(user);
        users[openid] = user;
        res.json({ success: true, downloadsThisMonth: user.downloadsThisMonth });
    }
    catch (err) {
        res.status(403).json({ error: err.message });
    }
});
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

export default {
    async fetch(request, env) {
        const allowedOrigins = new Set([
            'https://axxa.dev',
            'https://www.axxa.dev',
            'https://darkphilosophy.github.io'
        ]);

        const origin = request.headers.get('Origin') || '';
        const allowOrigin = allowedOrigins.has(origin) ? origin : 'https://axxa.dev';

        const corsHeaders = {
            'Access-Control-Allow-Origin': allowOrigin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400'
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
        }

        let payload;
        try {
            payload = await request.json();
        } catch {
            return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
        }

        const name = (payload.name || '').trim();
        const email = (payload.email || '').trim();
        const message = (payload.message || '').trim();
        const honeypot = (payload.honeypot || '').trim();
        const turnstileToken = (payload.turnstile_token || '').trim();
        
        // Metadata from Cloudflare
        const userIp = request.headers.get('CF-Connecting-IP') || 'Unknown';
        const userCountry = request.headers.get('CF-IPCountry') || 'Unknown';

        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

        if (!name || name.length < 2 || name.length > 80) {
            return new Response('Invalid name', { status: 400, headers: corsHeaders });
        }
        if (!email || email.length > 120 || !emailOk) {
            return new Response('Invalid email', { status: 400, headers: corsHeaders });
        }
        if (!message || message.length < 10 || message.length > 5000) {
            return new Response('Invalid message', { status: 400, headers: corsHeaders });
        }
        if (honeypot) {
            return new Response('Spam detected', { status: 400, headers: corsHeaders });
        }
        if (!turnstileToken) {
            return new Response('Missing Turnstile token', { status: 400, headers: corsHeaders });
        }

        // 1. Verify Turnstile
        const verifyBody = new URLSearchParams({
            secret: env.TURNSTILE_SECRET,
            response: turnstileToken
        });

        const verifyResp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: verifyBody
        });

        const verifyJson = await verifyResp.json().catch(() => null);
        if (!verifyJson || verifyJson.success !== true) {
            return new Response('Turnstile verification failed', { status: 403, headers: corsHeaders });
        }

        // 2. Send via Resend
        const subject = `[AXXA.DEV] New message from ${name}`;
        
        const bodyHtml = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0a; color: #f0f0f0; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; border: 1px solid #333; border-radius: 12px; overflow: hidden; background: #111; }
        .header { background: #00ff88; color: #000; padding: 20px; text-align: center; }
        .header h2 { margin: 0; font-size: 24px; letter-spacing: 1px; }
        .content { padding: 30px; }
        .message-box { background: #1a1a1a; padding: 20px; border-radius: 8px; border-left: 4px solid #00ff88; margin-bottom: 30px; line-height: 1.6; }
        .meta-table { width: 100%; border-collapse: collapse; font-size: 13px; color: #888; }
        .meta-table td { padding: 8px 0; border-bottom: 1px solid #222; }
        .meta-table td:first-child { font-weight: bold; width: 120px; color: #00ff88; text-transform: uppercase; font-size: 11px; }
        .footer { padding: 20px; text-align: center; font-size: 11px; color: #444; border-top: 1px solid #222; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>NEW TRANSMISSION</h2>
        </div>
        <div class="content">
            <div class="message-box">
                <p style="white-space: pre-wrap; margin: 0;">${message}</p>
            </div>
            
            <table class="meta-table">
                <tr><td>Sender</td><td>${name} (${email})</td></tr>
                <tr><td>IP Address</td><td>${userIp}</td></tr>
                <tr><td>Location</td><td>${userCountry}</td></tr>
                <tr><td>OS</td><td>${payload.user_os || 'Unknown'}</td></tr>
                <tr><td>Platform</td><td>${payload.user_platform || 'Unknown'}</td></tr>
                <tr><td>Browser</td><td>${payload.user_browser || 'Unknown'} v${payload.user_version || '?'}</td></tr>
                <tr><td>Referrer</td><td>${payload.user_referrer || 'Direct'}</td></tr>
                <tr><td>Timestamp</td><td>${payload.time || 'Unknown'}</td></tr>
                <tr><td>Language</td><td>${payload.lang || 'Unknown'}</td></tr>
            </table>
        </div>
        <div class="footer">
            &copy; 2026 AXXA.DEV | SECURE TERMINAL INBOUND
        </div>
    </div>
</body>
</html>
        `;

        const resendResp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'AXXA.DEV <contact@axxa.dev>',
                to: [env.EMAIL_TO || 'nell9@kakao.com'],
                reply_to: email,
                subject: subject,
                html: bodyHtml
            })
        });

        if (!resendResp.ok) {
            return new Response('Failed to send email', { status: 500, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            }
        });
    }
};

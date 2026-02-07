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
        const ip = request.headers.get('CF-Connecting-IP') || '';

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
            response: turnstileToken,
            remoteip: ip
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
        const subject = `New contact form message from ${name}`;
        const bodyHtml = `
            <h3>New Contact Form Submission</h3>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Time:</strong> ${payload.time || ''}</p>
            <p><strong>Lang:</strong> ${payload.lang || ''}</p>
            <hr>
            <p style="white-space: pre-wrap;">${message}</p>
        `;

        const resendResp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'axxa.dev <contact@axxa.dev>',
                to: [env.EMAIL_TO || 'nell9@kakao.com'],
                reply_to: email,
                subject: subject,
                html: bodyHtml
            })
        });

        if (!resendResp.ok) {
            const error = await resendResp.text();
            console.error('Resend error:', error);
            return new Response('Failed to send email via provider', { status: 500, headers: corsHeaders });
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

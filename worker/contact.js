import { EmailMessage } from 'cloudflare:email';

export default {
    async fetch(request, env) {
        const allowedOrigins = new Set([
            'https://axxa.dev',
            'https://www.axxa.dev',
            'https://contact.axxa.dev'
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
        if (!message || message.length < 10 || message.length > 2000) {
            return new Response('Invalid message', { status: 400, headers: corsHeaders });
        }
        if (honeypot) {
            return new Response('Spam detected', { status: 400, headers: corsHeaders });
        }
        if (!turnstileToken) {
            return new Response('Missing Turnstile token', { status: 400, headers: corsHeaders });
        }

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

        const subject = `New contact form message from ${name}`;
        const lines = [
            `Name: ${name}`,
            `Email: ${email}`,
            `Time: ${payload.time || ''}`,
            `Lang: ${payload.lang || ''}`,
            `User-Agent: ${payload.user_agent || ''}`,
            '',
            message
        ];
        const bodyText = lines.join('\n');

        const from = env.EMAIL_FROM || 'alexa@axxa.dev';
        const to = env.EMAIL_TO || 'alexa@axxa.dev';
        const raw = [
            `From: ${from}`,
            `To: ${to}`,
            `Reply-To: ${email}`,
            `Subject: ${subject}`,
            'Content-Type: text/plain; charset="UTF-8"',
            '',
            bodyText
        ].join('\n');

        await env.SEND_EMAIL.send(new EmailMessage(from, to, raw));

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            }
        });
    }
};

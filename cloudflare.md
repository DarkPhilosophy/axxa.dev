# Cloudflare Contact Form Setup

## Summary of What Was Implemented

### Frontend changes
- Added client-side validation for name, email, and message.
- Added a hidden honeypot field to trap bots.
- Added Cloudflare Turnstile widget to the contact form.
- Replaced EmailJS with a direct `fetch` call to a Cloudflare Worker endpoint.

### Worker added
- Added a Cloudflare Worker script that:
  - Validates the payload.
  - Verifies Turnstile using the secret key.
  - Sends email using Cloudflare Email Routing.

## Files Changed
- `index.html`
- `script.js`
- `worker/contact.js`

## Exactly What You Need To Do

### 1) Create the Worker
1. Cloudflare Dashboard → Workers & Pages → **Create Worker**
2. Click **Start with Hello World**
3. Name it, e.g. `contact-axxa`
4. Click **Deploy**

### 2) Add the Worker Code
1. Open the Worker you just created.
2. Edit the code and replace it with the contents of `worker/contact.js`.
3. Click **Save and Deploy**.

### 3) Bind Email Routing
1. In the Worker settings, add an **Email Binding**:
   - Binding name: `SEND_EMAIL`
   - Type: **Email**

### 4) Add Secrets / Vars
In Worker settings → **Variables**:
- Secret: `TURNSTILE_SECRET` = `0x4AAAAAACYntjEuLc28qbRCSIb6SxAEdrE`
- Variable: `EMAIL_FROM` = `alexa@axxa.dev`
- Variable: `EMAIL_TO` = your real inbox address

### 5) Enable Email Routing
1. Cloudflare Dashboard → Email → **Email Routing**
2. Enable routing for `axxa.dev`.
3. Create a **custom address**: `alexa@axxa.dev`
4. Set the **destination** to your real inbox.

### 6) Create the Route
1. Cloudflare Dashboard → Workers & Pages → your Worker → **Triggers** → **Routes**
2. Add route:
   - Route: `contact.axxa.dev/*`
   - Worker: select your Worker (e.g. `contact-axxa`)
3. Save.

### 7) DNS Check
Ensure `contact.axxa.dev` exists in DNS and is **proxied** (orange cloud). A CNAME to `axxa.dev` is fine.

### 8) Deploy the Website
Push the updated site files so your GitHub Pages site includes the new form and JS changes.

## Notes
- The frontend posts to `https://contact.axxa.dev/`.
- Turnstile requires the site key already embedded in `index.html`.
- The Worker rejects requests that fail validation or captcha.

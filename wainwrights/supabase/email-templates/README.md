# Sign-in email (Supabase Auth)

Code-only sign-in email. These are pasted into Supabase Dashboard -> Authentication -> Email Templates (not applied by migrations or any MCP tool).

- Paste `sign-in-code.html` into **both** "Magic Link" and "Confirm signup" (a person's first sign-in sends Confirm signup).
- Subject for both: `Your Wainwrights sign-in code`
- There is deliberately no link: the app already takes the code (`verifyOtp` in `shared-auth.js`). No link means nothing pointing at a different domain, and nothing for mail scanners or the in-app browser to use up.
- Code length: Authentication -> Providers -> Email -> "Email OTP Length" (6 is easier to type than 8).
- Custom SMTP sender name: `The Wainwrights` (Resend settings in Supabase), address `info@walkinguphills.co.uk`.

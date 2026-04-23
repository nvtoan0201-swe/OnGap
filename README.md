# ÔnGấp

App AI giúp sinh viên Việt Nam ôn thi cuối kỳ trong 3-7 ngày. Upload slide → AI trích xuất kiến thức (không tóm tắt) → flashcard verbatim + quiz adaptive + dự đoán đề.

## Development

Requirements:
- Node.js 20+
- `claude` CLI authenticated (`claude login`)
- Supabase CLI (`npm i -g supabase`)

Install:
```bash
npm install
```

Run web:
```bash
npm run web
```

Run worker:
```bash
npm run worker
```

Run tests:
```bash
npm test
```

Check domain availability:
```bash
npm run check-domains
```

See `docs/superpowers/specs/2026-04-23-ongap-design.md` for architecture.

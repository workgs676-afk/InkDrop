# InkDrop

InkDrop is a calming, private writing sanctuary for notes, poetry, and raw thoughts.

## Features
- Email/password authentication with secure cookie session + bcrypt password hashing
- Anonymous mode with local storage and later signup nudge
- Route protection for `/dashboard` and `/api/entries/*`
- Create, edit, delete entries with:
  - `title` (optional)
  - `content`
  - `type` (`note`, `poem`, `thought`)
  - `tags` (array)
  - `createdAt`
  - `isFavorite`
- Autosave while typing
- Write Without Pressure mode ("This doesn't have to stay.")
- Midnight Mode (manual toggle + auto-night default)
- Memory resurfacing ("From X days ago...")
- Search, filters, favorites, tags
- Focus mode, typewriter mode, word count
- Offline cache + queue-based resync for account mode
- Export as `.txt` and `.pdf`
- Lock notes with optional PIN
- Delete all data
- Writing prompts + non-stressful daily streak

## Tech Stack
- Frontend: Next.js (App Router + React)
- Backend: Next.js API routes (Node runtime)
- Database: MongoDB (Mongoose)
- Auth: JWT cookie auth + anonymous local mode

## Folder Structure
```txt
inkdrop/
  app/
    api/
      auth/
        login/route.js
        logout/route.js
        me/route.js
        signup/route.js
      entries/
        [id]/
          unlock/route.js
          route.js
        route.js
    anonymous/page.js
    dashboard/page.js
    globals.css
    layout.js
    page.js
  components/
    AuthForm.js
    WriterSanctuary.js
  lib/
    auth.js
    db.js
    entries.js
  models/
    Entry.js
    User.js
  .env.example
  .gitignore
  jsconfig.json
  middleware.js
  next.config.mjs
  package.json
  README.md
```

## Local Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env file:
   ```bash
   copy .env.example .env.local
   ```
3. Fill `.env.local`:
   - `MONGODB_URI=...`
   - `JWT_SECRET=...` (long random value)
4. Run dev server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000)

## MongoDB (Atlas quick setup)
1. Create a free Atlas cluster.
2. Create a database user + password.
3. Allow network access (your IP, or `0.0.0.0/0` for quick testing).
4. Copy connection string into `MONGODB_URI`.

## Deploy to Vercel
1. Push this project to GitHub/GitLab/Bitbucket.
2. In Vercel, import the repository.
3. Set environment variables:
   - `MONGODB_URI`
   - `JWT_SECRET`
4. Deploy.
5. Add your production domain, then test login + writing flow.

## Notes
- Anonymous mode stores data in browser localStorage only.
- PIN lock is app-level protection for comfort/privacy, not military-grade encryption.
- For stronger note-at-rest security, add per-entry encryption before production use.

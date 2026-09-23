# NutriScan (Node.js + MongoDB)

A rebuild of the original Streamlit/Python NutriScan app as a Node.js/Express web app
with account registration and sign-in, both handled through a single pop-up modal
(no separate page or tab). Photo analysis still runs on Google Gemini and keeps the,
same nutrition fields, health score, and classification as the original.

## Stack

- **Backend:** Node.js, Express
- **Database:** MongoDB (Mongoose) — stores users (hashed passwords) and a short
  history of each user's past scans
- **Auth:** JWT, issued on register/login, sent as `Authorization: Bearer <token>`
- **AI:** Google Gemini (`@google/genai`), same prompt/JSON contract as the Python version
- **Frontend:** Plain HTML/CSS/JS, single page — login/register open as a modal, never
  a new tab or route

## Project structure

```
nutriscan/
  server.js              # Express entrypoint
  config/db.js           # MongoDB connection
  models/User.js         # User schema (name, email, hashed password, history)
  middleware/auth.js     # JWT verification
  routes/auth.js         # /api/auth/register, /login, /me
  routes/analyze.js      # /api/analyze (protected, calls Gemini)
  public/
    index.html           # Single page: hero, uploader, results, auth modal
    css/style.css         # Design system
    js/app.js             # Modal logic, upload, fetch calls, rendering
  .env.example
  package.json
```

## Setup

1. **Install dependencies**
   ```bash
   cd nutriscan
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env`:
   - `GEMINI_API_KEY` — your Google AI Studio key
   - `MONGO_URI` — a local MongoDB instance (`mongodb://127.0.0.1:27017/nutriscan`)
     or an Atlas connection string
   - `JWT_SECRET` — any long random string
   - `PORT` — defaults to 5000

   Your original `_env` file already had a live Gemini key in it — treat that key as
   compromised since it passed through this chat, and generate a fresh one from
   [Google AI Studio](https://aistudio.google.com/apikey) instead of reusing it.

3. **Run MongoDB** locally (`mongod`) or point `MONGO_URI` at an Atlas cluster.

4. **Start the server**
   ```bash
   npm start
   # or, for auto-reload during development:
   npm run dev
   ```

5. Open `http://localhost:5000`.

## How the pieces map to the original app

| Original (Streamlit)              | This version                                   |
|------------------------------------|-------------------------------------------------|
| `st.file_uploader`                 | Drag-and-drop dropzone (`public/js/app.js`)     |
| `client.models.generate_content`   | `routes/analyze.js` via `@google/genai`          |
| JSON extraction / cleanup          | `extractJson()` in `routes/analyze.js`           |
| `st.metric` / nutrition table      | The nutrition-facts-style card in `renderResults()` |
| Bar chart                          | Health-score progress bar                        |
| Download JSON button               | "Download JSON Report" button                    |
| *(none — no accounts before)*      | Register/Sign-in modal, JWT sessions, MongoDB, per-user scan history |

## Notes

- Passwords are hashed with bcrypt before storage — never stored in plain text.
- The JWT is kept in `localStorage` for simplicity. For production, consider an
  httpOnly cookie instead to reduce XSS exposure.
- Each successful analysis appends a trimmed entry (food name, score, classification)
  to the user's `history` array, capped at the most recent 20 scans, shown as chips
  under the scan section.

# SiteLedger

Construction project, workforce, attendance, payment and site progress manager.

## Run locally
1. Install Node.js 20+ and MongoDB Atlas (or local MongoDB).
2. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI`, `JWT_SECRET`, and `CLIENT_URL`.
3. Run `npm install`, then `npm run dev`.
4. Open the Vite URL (normally http://localhost:5173). Create the first account on the sign-in screen.

The API runs on port 4000. All business records are scoped to the authenticated account and persisted in MongoDB. See `server/src/models` for the data model and `server/src/routes` for API endpoints.

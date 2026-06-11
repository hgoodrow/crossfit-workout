# Crossfit Workout — Handstand → HSPU Tracker

A standalone PWA for tracking handstand and HSPU progression. Data persists on-device via `localStorage`. Installable to your iPhone Home Screen as a full-screen app.

## Deploy to GitHub Pages

The repo includes a GitHub Actions workflow that builds and deploys automatically. Setup is a one-time thing:

1. **Create a repo named `crossfit-workout`** on GitHub (the name matters — see note below).
2. **Push this folder to it:**
   ```bash
   git init
   git add .
   git commit -m "Crossfit Workout tracker"
   git branch -M main
   git remote add origin https://github.com/<your-username>/crossfit-workout.git
   git push -u origin main
   ```
3. **Enable Pages:** in the repo, go to **Settings → Pages → Build and deployment → Source**, and select **GitHub Actions**.
4. The workflow runs on push. When it finishes (Actions tab → green check), your app is live at:
   ```
   https://<your-username>.github.io/crossfit-workout/
   ```

### If you name the repo something other than `crossfit-workout`

The build is configured to serve from `/crossfit-workout/`. If your repo has a different name, change one line in `vite.config.js`:
```js
base: "/your-repo-name/",
```
and re-push. (Or, if you deploy to a custom domain or a `<username>.github.io` root repo, set `base: "/"`.)

## Install on iPhone

1. Open the live URL in **Safari** (must be Safari, not Chrome, for Home Screen install).
2. Tap the **Share** button → **Add to Home Screen**.
3. It launches full-screen with the Crossfit Workout icon, behaves like a native app.

## Local development

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## Data

All session data lives in your browser's `localStorage` under keys `hs:logs` and `hs:ladder`. It's per-device and per-browser — clearing Safari site data wipes it. No backend, no account, nothing leaves your phone.

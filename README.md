# Pomodoro Focus Timer

A clean, responsive Pomodoro focus timer web app with customizable intervals, sound notifications, and session tracking. Built with vanilla HTML, CSS, and JavaScript — no frameworks, no dependencies.

## Features

- **Three timer modes:** Focus (25 min), Short Break (5 min), Long Break (15 min)
- **Auto-advance sessions:** Automatically cycles through Focus → Short Break → Long Break
- **Customizable durations:** Adjust focus, short break, long break lengths and long break interval
- **Auto-start options:** Optionally auto-start breaks and/or focus sessions
- **Sound notifications:** Web Audio API–generated chimes when sessions end (no external files)
- **Mute toggle:** Silence notifications with one click; preference persisted
- **Session history:** Track completed sessions with today's stats and a scrollable log
- **localStorage persistence:** Settings, mute state, and session history survive page reloads
- **Dark theme:** Calm, focused aesthetic with a large central timer and SVG progress ring
- **Responsive design:** Works on desktop and mobile (down to 320px)
- **Keyboard shortcuts:** Space (start/pause), R (reset), M (mute), S (settings)
- **Accessible:** ARIA labels, live regions, and full keyboard navigation

## Deployment

This app is deployed via **GitHub Pages** using a GitHub Actions workflow. No build step is required — it serves static files directly from the repository root.

### To deploy your own copy

1. Create a new GitHub repo (do **not** initialise with a README)
2. ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
3. In your GitHub repo settings → Pages → set source to **GitHub Actions**
4. Visit `https://YOUR_USERNAME.github.io/YOUR_REPO/`

## License

MIT

# YT-DLP Web Application

A simple web interface for downloading YouTube videos using the powerful `yt-dlp` CLI tool.

## Requirements

This application requires the following binaries to be installed and available in your system PATH:

1. **yt-dlp**: The core download engine.
2. **Deno**: Required for YouTube extraction (via the `--remote-components ejs:npm` flag).
3. **ffmpeg**: Required for merging high-quality video and audio streams.

### Installation Guide

- **yt-dlp**: Follow the official installation guide at [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp).
- **Deno**: Install via [deno.land](https://deno.land/).
- **ffmpeg**: Install via [ffmpeg.org](https://ffmpeg.org/) or use a package manager (e.g., `brew install ffmpeg`, `sudo apt install ffmpeg`).

## Local Setup

1. Clone or download this project.
2. Install Node.js dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` in your browser.

## Deployment Note

- **Docker**: A Dockerfile is provided for easy containerization.
- **IP Blocking**: YouTube frequently blocks IP addresses from known datacenter ranges (AWS, GCP, Azure). If you experience "403 Forbidden" errors, you may need to provide a cookie file to `yt-dlp` using the `--cookies` flag in `server.js`.


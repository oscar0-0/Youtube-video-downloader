const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOADS_DIR = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR);
}

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 100, 
  message: "Too many requests from this IP, please try again after a minute.",
  skip: (req) => req.url.includes(".css") || req.url.includes(".js") || req.url.includes(".html") || req.url.includes("favicon.ico")
});
app.use(limiter);

app.use(express.json());
app.use(express.static("public"));
app.use("/downloads", express.static(DOWNLOADS_DIR));

function verifyStartup() {
  const deps = ["yt-dlp", "deno", "ffmpeg"];
  const missing = [];
  deps.forEach(dep => {
    try {
      spawn(dep, ["--version"]);
    } catch (e) {
      missing.push(dep);
    }
  });
  return missing;
}

function validateUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.youtube.com" || parsed.hostname === "youtu.be";
  } catch (e) {
    return false;
  }
}

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return "Unknown";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

app.get("/api/formats", (req, res) => {
  const url = req.query.url;
  if (!url || !validateUrl(url)) {
    return res.status(400).json({ error: "Invalid or missing YouTube URL." });
  }

  const process = spawn("yt-dlp", ["-F", url]);
  let output = "";
  process.stdout.on("data", (data) => { output += data.toString(); });
  process.stderr.on("data", (data) => { console.error(`yt-dlp stderr: ${data}`); });

  process.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: "Failed to fetch formats." });
    }
    
    const lines = output.split("\n");
    const formats = [];
    const headerIndex = lines.findIndex(l => l.includes("ID"));
    if (headerIndex === -1) return res.status(500).json({ error: "Unexpected output." });

    const dataLines = lines.slice(headerIndex + 1);
    
    // We want to find the "best" representative for common resolutions
    const resolutionMap = {
      "2160p": { id: null, size: 0 },
      "1080p": { id: null, size: 0 },
      "720p": { id: null, size: 0 },
      "480p": { id: null, size: 0 },
      "360p": { id: null, size: 0 },
      "audio": { id: null, size: 0 }
    };

    dataLines.forEach(line => {
      if (!line.trim()) return;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) return;

      const id = parts[0];
      const ext = parts[1];
      const res = parts[2];
      
      // Try to find filesize. yt-dlp -F output varies, but usually 
      // it is in a column. We look for numbers followed by KiB, MiB, etc.
      const sizeMatch = line.match(/(\d+\.?\d*)\s*(K|M|G)iB/);
      let size = 0;
      if (sizeMatch) {
        const val = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2];
        if (unit === "K") size = val * 1024;
        else if (unit === "M") size = val * 1024 * 1024;
        else if (unit === "G") size = val * 1024 * 1024 * 1024;
      }

      if (res.includes("2160")) {
        if (!resolutionMap["2160p"].id || size > resolutionMap["2160p"].size) {
          resolutionMap["2160p"] = { id, size };
        }
      } else if (res.includes("1080")) {
        if (!resolutionMap["1080p"].id || size > resolutionMap["1080p"].size) {
          resolutionMap["1080p"] = { id, size };
        }
      } else if (res.includes("720")) {
        if (!resolutionMap["720p"].id || size > resolutionMap["720p"].size) {
          resolutionMap["720p"] = { id, size };
        }
      } else if (res.includes("480")) {
        if (!resolutionMap["480p"].id || size > resolutionMap["480p"].size) {
          resolutionMap["480p"] = { id, size };
        }
      } else if (res.includes("360")) {
        if (!resolutionMap["360p"].id || size > resolutionMap["360p"].size) {
          resolutionMap["360p"] = { id, size };
        }
      }

      if (line.includes("audio only")) {
        if (!resolutionMap["audio"].id || size > resolutionMap["audio"].size) {
          resolutionMap["audio"] = { id, size };
        }
      }
    });

    const finalOptions = [];
    for (const [res, data] of Object.entries(resolutionMap)) {
      if (data.id) {
        finalOptions.push({
          quality: res,
          label: res === "audio" ? "Audio Only" : res,
          size: formatBytes(data.size)
        });
      }
    }

    res.json({ options: finalOptions });
  });
});

app.get("/api/download", (req, res) => {
  const { url, quality } = req.query;
  if (!url || !validateUrl(url)) {
    return res.status(400).send("Invalid URL");
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const fileName = `video_${Date.now()}`;
  const outputTemplate = path.join(DOWNLOADS_DIR, `${fileName}.%(ext)s`);
  
  let formatString;
  switch (quality) {
    case "audio":
      formatString = "bestaudio/best";
      break;
    case "360p":
      formatString = "bestvideo[height<=360]+bestaudio/best[height<=360]/best";
      break;
    case "480p":
      formatString = "bestvideo[height<=480]+bestaudio/best[height<=480]/best";
      break;
    case "720p":
      formatString = "bestvideo[height<=720]+bestaudio/best[height<=720]/best";
      break;
    case "1080p":
      formatString = "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best";
      break;
    case "2160p":
      formatString = "bestvideo[height<=2160]+bestaudio/best[height<=2160]/best";
      break;
    default:
      formatString = "best";
  }

  const args = [
    "--remote-components", "ejs:npm",
    "-f", formatString,
    "-o", outputTemplate,
    url
  ];

  console.log(`Executing: yt-dlp ${args.join(" ")}`);
  const child = spawn("yt-dlp", args);

  child.stdout.on("data", (data) => {
    const line = data.toString();
    const progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%/);
    if (progressMatch) {
      const percentage = progressMatch[1];
      res.write(`data: ${JSON.stringify({ type: "progress", value: percentage })}\n\n`);
    }
  });

  child.stderr.on("data", (data) => {
    const line = data.toString();
    res.write(`data: ${JSON.stringify({ type: "error", value: line })}\n\n`);
  });

  child.on("close", (code) => {
    if (code === 0) {
      const files = fs.readdirSync(DOWNLOADS_DIR);
      const createdFile = files.find(f => f.includes(fileName));
      const downloadUrl = createdFile ? `/downloads/${createdFile}` : "/downloads";
      res.write(`data: ${JSON.stringify({ type: "complete", url: downloadUrl })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", value: "Failed with code " + code })}\n\n`);
    }
    res.end();
  });
});

app.get("/api/status", (req, res) => {
  const missing = verifyStartup();
  res.json({ missing });
});

setInterval(() => {
  fs.readdir(DOWNLOADS_DIR, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(DOWNLOADS_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (Date.now() - stats.mtimeMs > 3600000) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {}
    });
  });
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


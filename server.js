const express = require("express");
const axios = require("axios");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();

app.use(express.json({ limit: "50mb" }));

const ALLOWED_ORIGIN = "https://hi.walts.workers.dev";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

app.options("*", (req, res) => {
  cors(res);
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  cors(res);
  res.json({
    status: "online",
    ffmpeg: true
  });
});

app.post("/analyze", async (req, res) => {
  try {
    cors(res);

    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        error: "Missing URL"
      });
    }

    const input = `/tmp/${Date.now()}.mkv`;

    const response = await axios({
      url,
      method: "GET",
      responseType: "stream"
    });

    const writer = fs.createWriteStream(input);

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    exec(
      `ffprobe -v quiet -print_format json -show_streams "${input}"`,
      (err, stdout) => {
        fs.unlink(input, () => {});

        if (err) {
          return res.status(500).json({
            error: err.message
          });
        }

        const probe = JSON.parse(stdout);

        const audioTracks = [];
        const subtitleTracks = [];

        for (const stream of probe.streams || []) {
          if (stream.codec_type === "audio") {
            audioTracks.push({
              index: stream.index,
              language: stream.tags?.language || "unknown",
              title: stream.tags?.title || ""
            });
          }

          if (stream.codec_type === "subtitle") {
            subtitleTracks.push({
              index: stream.index,
              language: stream.tags?.language || "unknown",
              title: stream.tags?.title || ""
            });
          }
        }

        res.json({
          audioTracks,
          subtitleTracks
        });
      }
    );
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

app.post("/export", async (req, res) => {
  cors(res);

  res.json({
    message: "Export endpoint placeholder. Analyze works first."
  });
});

app.listen(process.env.PORT || 10000);

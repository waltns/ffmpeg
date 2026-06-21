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

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

app.post("/export", async (req, res) => {
  try {
    cors(res);

    const {
      url,
      audio = 0,
      subtitle = -1,
      format = "mp4"
    } = req.body;

    if (!url) {
      return res.status(400).json({
        error: "Missing URL"
      });
    }

    const id = Date.now();

    const input = `/tmp/${id}-input`;
    const output = `/tmp/${id}-output.${format}`;

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

    let command;

    if (subtitle === -1) {
      command =
        `ffmpeg -y -i "${input}" ` +
        `-map 0:v -map 0:a:${audio} ` +
        `-sn -c copy "${output}"`;
    } else {
      command =
        `ffmpeg -y -i "${input}" ` +
        `-map 0:v -map 0:a:${audio} ` +
        `-map 0:s:${subtitle} ` +
        `-c copy "${output}"`;
    }

    exec(command, async (err) => {
      fs.unlink(input, () => {});

      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      const key =
        `exports/${Date.now()}.${format}`;

      const fileBuffer =
        fs.readFileSync(output);

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: fileBuffer,
          ContentType:
            format === "mkv"
              ? "video/x-matroska"
              : "video/mp4"
        })
      );

      fs.unlink(output, () => {});

      return res.json({
        success: true,
        key,
        url:
          `https://hi.walts.workers.dev/file/${key}`
      });
    });

  } catch (e) {
    return res.status(500).json({
      error: e.message
    });
  }
});

const express = require("express");
const { exec } = require("child_process");

const app = express();

app.get("/", (req, res) => {
  exec("ffmpeg -version", (err, stdout, stderr) => {
    if (err) {
      return res.json({
        ffmpeg: false,
        error: stderr
      });
    }

    res.json({
      ffmpeg: true,
      version: stdout
    });
  });
});

app.listen(process.env.PORT || 10000);

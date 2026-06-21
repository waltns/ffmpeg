const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.json({
    status: "online",
    ffmpeg: true
  });
});

app.listen(process.env.PORT || 10000);

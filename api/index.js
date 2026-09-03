require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("../config/db");

const authRoutes = require("../routes/auth");
const analyzeRoutes = require("../routes/analyze");

const app = express();

connectDB();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.use("/api/auth", authRoutes);
app.use("/api/analyze", analyzeRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

module.exports = app;
const mongoose = require("mongoose");

const historyEntrySchema = new mongoose.Schema(
  {
    food_name: String,
    health_score: Number,
    classification: String,
    analyzedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: { type: String, required: true },
    history: [historyEntrySchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

import mongoose from "mongoose";

const EntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    title: {
      type: String,
      default: ""
    },
    content: {
      type: String,
      default: ""
    },
    preview: {
      type: String,
      default: ""
    },
    type: {
      type: String,
      enum: ["note", "poem", "thought"],
      default: "thought"
    },
    tags: {
      type: [String],
      default: []
    },
    isFavorite: {
      type: Boolean,
      default: false
    },
    isLocked: {
      type: Boolean,
      default: false
    },
    pinHash: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

const Entry = mongoose.models.Entry || mongoose.model("Entry", EntrySchema);

export default Entry;

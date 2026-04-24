export function parseTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags
    .map((tag) => String(tag).trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

export function cleanType(value) {
  const type = String(value || "thought").toLowerCase();
  if (["note", "poem", "thought"].includes(type)) {
    return type;
  }
  return "thought";
}

export function safeEntryPayload(doc, revealLocked = false) {
  const asObj = doc.toObject ? doc.toObject() : doc;
  const content = asObj.isLocked && !revealLocked ? "" : asObj.content;
  const preview = asObj.preview || String(asObj.content || "").slice(0, 180);
  return {
    _id: asObj._id?.toString() || asObj.id,
    title: asObj.title || "",
    content,
    type: asObj.type || "thought",
    tags: asObj.tags || [],
    createdAt: asObj.createdAt,
    updatedAt: asObj.updatedAt,
    isFavorite: Boolean(asObj.isFavorite),
    isLocked: Boolean(asObj.isLocked),
    preview
  };
}

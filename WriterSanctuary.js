"use client";

import clsx from "clsx";
import { jsPDF } from "jspdf";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const EMPTY_DRAFT = {
  title: "",
  content: "",
  type: "thought",
  tagsInput: "",
  isFavorite: false,
  isLocked: false,
  lockPin: "",
  unlockPin: ""
};

const WRITING_PROMPTS = [
  "Write about a feeling you almost ignored today.",
  "Describe the quietest place in your memory.",
  "Start with: I am learning to...",
  "Write three lines to your future self.",
  "What did your mind need this week?"
];

const LOCAL_ANON_KEY = "inkdrop.anon.entries";
const LOCAL_STREAK_KEY = "inkdrop.streak";
const LOCAL_CACHE_KEY = "inkdrop.account.cache";
const LOCAL_QUEUE_KEY = "inkdrop.account.queue";
const LOCAL_ANON_SAVED_COUNT = "inkdrop.anon.savedCount";

function entryId(entry) {
  return entry?._id || entry?.id;
}

function parseTags(input) {
  return String(input || "")
    .split(",")
    .map((item) => item.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

function formatTags(tags) {
  return (tags || []).join(", ");
}

function countWords(text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) {
    return 0;
  }
  return cleaned.split(/\s+/).length;
}

function isNightHours() {
  const hour = new Date().getHours();
  return hour >= 21 || hour <= 5;
}

function randomPrompt() {
  const index = Math.floor(Math.random() * WRITING_PROMPTS.length);
  return WRITING_PROMPTS[index];
}

function daysAgoLabel(dateValue) {
  const ms = Date.now() - new Date(dateValue).getTime();
  const days = Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)));
  return `From ${days} day${days === 1 ? "" : "s"} ago...`;
}

function readJSON(key, fallback) {
  try {
    const raw = safeGetItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  safeSetItem(key, JSON.stringify(value));
}

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function canUseStorage() {
  try {
    const testKey = "__inkdrop_storage_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function generateId(prefix = "entry") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function WriterSanctuary({ mode }) {
  const router = useRouter();
  const isAnonymous = mode === "anonymous";

  const [entries, setEntries] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [noPressure, setNoPressure] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [typewriterMode, setTypewriterMode] = useState(true);
  const [midnightMode, setMidnightMode] = useState(isNightHours());
  const [showResurfacing, setShowResurfacing] = useState(true);
  const [resurfaced, setResurfaced] = useState(null);
  const [status, setStatus] = useState("");
  const [prompt, setPrompt] = useState(randomPrompt());
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState(null);
  const [streak, setStreak] = useState({ count: 0, lastDate: "" });
  const [showSignupNudge, setShowSignupNudge] = useState(false);

  const loadedRef = useRef(false);
  const autosaveTimerRef = useRef(null);

  const currentWordCount = useMemo(() => countWords(draft.content), [draft.content]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (typeFilter !== "all" && entry.type !== typeFilter) {
        return false;
      }
      if (favoritesOnly && !entry.isFavorite) {
        return false;
      }
      if (!search.trim()) {
        return true;
      }
      const haystack = `${entry.title || ""} ${entry.content || ""} ${(entry.tags || []).join(" ")}`.toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    });
  }, [entries, typeFilter, favoritesOnly, search]);

  const syncStreak = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const current = readJSON(LOCAL_STREAK_KEY, { count: 0, lastDate: "" });
    let next = current;
    if (!current.lastDate) {
      next = { count: 1, lastDate: today };
    } else if (current.lastDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      next = {
        count: current.lastDate === yesterday ? current.count + 1 : 1,
        lastDate: today
      };
    }
    writeJSON(LOCAL_STREAK_KEY, next);
    setStreak(next);
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setActiveId("");
  }, []);

  const hydrateAnonymous = useCallback(() => {
    try {
      const localEntries = readJSON(LOCAL_ANON_KEY, []);
      setEntries(localEntries);
      const localStreak = readJSON(LOCAL_STREAK_KEY, { count: 0, lastDate: "" });
      setStreak(localStreak);
      const savedCount = Number(safeGetItem(LOCAL_ANON_SAVED_COUNT) || "0");
      setShowSignupNudge(savedCount >= 3);

      if (!canUseStorage()) {
        setStatus("This browser limits local storage, so anonymous drafts may not persist.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const hydrateAccount = useCallback(async () => {
    try {
      const [meResponse, entriesResponse] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/entries")
      ]);
      if (!meResponse.ok) {
        router.push("/");
        return;
      }
      const meData = await meResponse.json();
      setIdentity(meData.user?.email || null);

      if (!entriesResponse.ok) {
        throw new Error("Could not load remote entries.");
      }

      const entriesData = await entriesResponse.json();
      setEntries(entriesData.entries || []);
      writeJSON(LOCAL_CACHE_KEY, entriesData.entries || []);
      setOffline(false);
    } catch {
      const fallback = readJSON(LOCAL_CACHE_KEY, []);
      setEntries(fallback);
      setOffline(true);
      setStatus("You are offline. Local cache is available.");
    } finally {
      const localStreak = readJSON(LOCAL_STREAK_KEY, { count: 0, lastDate: "" });
      setStreak(localStreak);
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (isAnonymous) {
      hydrateAnonymous();
    } else {
      hydrateAccount();
    }
    loadedRef.current = true;
  }, [hydrateAccount, hydrateAnonymous, isAnonymous]);

  useEffect(() => {
    if (!showResurfacing) {
      setResurfaced(null);
      return;
    }
    const older = entries.filter((entry) => {
      const created = new Date(entry.createdAt).getTime();
      return Number.isFinite(created) && Date.now() - created > 1000 * 60 * 60 * 24 * 30;
    });
    if (!older.length) {
      setResurfaced(null);
      return;
    }
    const pick = older[Math.floor(Math.random() * older.length)];
    setResurfaced(pick);
  }, [entries, showResurfacing]);

  const flushQueue = useCallback(async () => {
    if (isAnonymous) {
      return;
    }
    const queue = readJSON(LOCAL_QUEUE_KEY, []);
    if (!queue.length) {
      return;
    }

    for (const item of queue) {
      try {
        await fetch(item.url, {
          method: item.method,
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(item.body || {})
        });
      } catch {
        return;
      }
    }
    writeJSON(LOCAL_QUEUE_KEY, []);
    setStatus("Offline changes synced.");
    const refreshed = await fetch("/api/entries");
    if (refreshed.ok) {
      const data = await refreshed.json();
      setEntries(data.entries || []);
      writeJSON(LOCAL_CACHE_KEY, data.entries || []);
      setOffline(false);
    }
  }, [isAnonymous]);

  useEffect(() => {
    function onOnline() {
      flushQueue();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushQueue]);

  const saveAnonymous = useCallback(
    (force) => {
      if (noPressure && !force) {
        return;
      }
      if (!draft.title.trim() && !draft.content.trim()) {
        return;
      }

      const now = new Date().toISOString();
      const tags = parseTags(draft.tagsInput);
      const id = activeId || generateId("anon");
      const nextEntry = {
        id,
        title: draft.title.trim(),
        content: draft.content,
        preview: draft.content.slice(0, 180),
        type: draft.type,
        tags,
        createdAt: activeId ? entries.find((entry) => entryId(entry) === activeId)?.createdAt || now : now,
        updatedAt: now,
        isFavorite: Boolean(draft.isFavorite),
        isLocked: Boolean(draft.isLocked),
        localPin: draft.isLocked ? draft.lockPin : ""
      };

      const nextEntries = [nextEntry, ...entries.filter((entry) => entryId(entry) !== id)].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      setEntries(nextEntries);
      writeJSON(LOCAL_ANON_KEY, nextEntries);
      setActiveId(id);
      syncStreak();
      setStatus("Saved locally in your private browser space.");

      const nextCount = Number(safeGetItem(LOCAL_ANON_SAVED_COUNT) || "0") + 1;
      safeSetItem(LOCAL_ANON_SAVED_COUNT, String(nextCount));
      if (nextCount >= 3) {
        setShowSignupNudge(true);
      }
    },
    [activeId, draft, entries, noPressure, syncStreak]
  );

  const queueOfflineAction = useCallback((action) => {
    const existing = readJSON(LOCAL_QUEUE_KEY, []);
    writeJSON(LOCAL_QUEUE_KEY, [...existing, action]);
  }, []);

  const saveAccount = useCallback(
    async (force) => {
      if (noPressure && !force) {
        return;
      }
      if (!draft.title.trim() && !draft.content.trim()) {
        return;
      }
      const payload = {
        title: draft.title.trim(),
        content: draft.content,
        type: draft.type,
        tags: parseTags(draft.tagsInput),
        isFavorite: Boolean(draft.isFavorite),
        isLocked: Boolean(draft.isLocked),
        lockPin: draft.isLocked ? draft.lockPin : "",
        unlockPin: draft.unlockPin
      };

      const endpoint = activeId ? `/api/entries/${activeId}` : "/api/entries";
      const method = activeId ? "PUT" : "POST";

      try {
        const response = await fetch(endpoint, {
          method,
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not save this entry.");
        }

        const saved = data.entry;
        const id = entryId(saved);
        setEntries((current) => [saved, ...current.filter((entry) => entryId(entry) !== id)]);
        setActiveId(id);
        setOffline(false);
        setStatus("Auto-saved quietly.");
        syncStreak();
      } catch (error) {
        setOffline(true);
        setStatus("Offline right now. We kept your words locally and will sync later.");

        const localCopy = {
          _id: activeId || `offline-${generateId("offline")}`,
          title: payload.title,
          content: payload.content,
          preview: payload.content.slice(0, 180),
          type: payload.type,
          tags: payload.tags,
          isFavorite: payload.isFavorite,
          isLocked: payload.isLocked,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        setEntries((current) => [localCopy, ...current.filter((entry) => entryId(entry) !== entryId(localCopy))]);
        writeJSON(LOCAL_CACHE_KEY, [localCopy, ...entries.filter((entry) => entryId(entry) !== entryId(localCopy))]);
        queueOfflineAction({ method, url: endpoint, body: payload });
      }
    },
    [activeId, draft, entries, noPressure, queueOfflineAction, syncStreak]
  );

  const persistDraft = useCallback(
    async (force = false) => {
      if (isAnonymous) {
        saveAnonymous(force);
      } else {
        await saveAccount(force);
      }
    },
    [isAnonymous, saveAccount, saveAnonymous]
  );

  useEffect(() => {
    if (!loadedRef.current) {
      return;
    }
    if (noPressure) {
      setStatus("This does not have to stay.");
      return;
    }
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      persistDraft(false);
    }, 900);
    return () => clearTimeout(autosaveTimerRef.current);
  }, [
    draft.title,
    draft.content,
    draft.type,
    draft.tagsInput,
    draft.isFavorite,
    draft.isLocked,
    draft.lockPin,
    draft.unlockPin,
    noPressure,
    persistDraft
  ]);

  async function openEntry(entry) {
    if (!entry) {
      return;
    }

    if (entry.isLocked) {
      const pin = window.prompt("Enter PIN for this locked note:");
      if (!pin) {
        return;
      }

      if (isAnonymous) {
        if (pin !== entry.localPin) {
          setStatus("That PIN does not match.");
          return;
        }
        setDraft({
          title: entry.title || "",
          content: entry.content || "",
          type: entry.type || "thought",
          tagsInput: formatTags(entry.tags),
          isFavorite: Boolean(entry.isFavorite),
          isLocked: true,
          lockPin: pin,
          unlockPin: pin
        });
        setActiveId(entryId(entry));
        return;
      }

      const response = await fetch(`/api/entries/${entryId(entry)}/unlock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ pin })
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.error || "Could not unlock this note.");
        return;
      }

      const unlocked = data.entry;
      setDraft({
        title: unlocked.title || "",
        content: unlocked.content || "",
        type: unlocked.type || "thought",
        tagsInput: formatTags(unlocked.tags),
        isFavorite: Boolean(unlocked.isFavorite),
        isLocked: true,
        lockPin: "",
        unlockPin: pin
      });
      setActiveId(entryId(unlocked));
      setStatus("Unlocked for this session.");
      return;
    }

    setDraft({
      title: entry.title || "",
      content: entry.content || "",
      type: entry.type || "thought",
      tagsInput: formatTags(entry.tags),
      isFavorite: Boolean(entry.isFavorite),
      isLocked: Boolean(entry.isLocked),
      lockPin: "",
      unlockPin: ""
    });
    setActiveId(entryId(entry));
  }

  async function deleteCurrent() {
    if (!activeId) {
      return;
    }

    if (isAnonymous) {
      const nextEntries = entries.filter((entry) => entryId(entry) !== activeId);
      setEntries(nextEntries);
      writeJSON(LOCAL_ANON_KEY, nextEntries);
      resetDraft();
      setStatus("Entry deleted.");
      return;
    }

    const response = await fetch(`/api/entries/${activeId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        unlockPin: draft.unlockPin
      })
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "Could not delete this entry.");
      return;
    }

    const nextEntries = entries.filter((entry) => entryId(entry) !== activeId);
    setEntries(nextEntries);
    writeJSON(LOCAL_CACHE_KEY, nextEntries);
    resetDraft();
    setStatus("Entry deleted.");
  }

  async function clearAllData() {
    if (isAnonymous) {
      safeRemoveItem(LOCAL_ANON_KEY);
      safeRemoveItem(LOCAL_ANON_SAVED_COUNT);
      setEntries([]);
      resetDraft();
      setStatus("Local anonymous writing space cleared.");
      return;
    }

    const response = await fetch("/api/entries?all=1", { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "Could not clear all entries.");
      return;
    }
    setEntries([]);
    writeJSON(LOCAL_CACHE_KEY, []);
    resetDraft();
    setStatus("All account entries removed.");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  function exportAsText() {
    const lines = filteredEntries.map((entry) => {
      const tags = (entry.tags || []).map((tag) => `#${tag}`).join(" ");
      return [
        `Title: ${entry.title || "(untitled)"}`,
        `Type: ${entry.type}`,
        `Date: ${new Date(entry.createdAt).toLocaleString()}`,
        tags ? `Tags: ${tags}` : "Tags:",
        "",
        entry.isLocked ? "[Locked content hidden]" : entry.content || "",
        "",
        "-----",
        ""
      ].join("\n");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inkdrop-export.txt";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Text export ready.");
  }

  function exportAsPdf() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    let y = 48;
    doc.setFontSize(14);
    doc.text("InkDrop Export", 40, y);
    y += 24;
    doc.setFontSize(10);

    filteredEntries.forEach((entry, index) => {
      const block = [
        `Title: ${entry.title || "(untitled)"}`,
        `Type: ${entry.type} | Date: ${new Date(entry.createdAt).toLocaleDateString()}`,
        `Tags: ${(entry.tags || []).map((tag) => `#${tag}`).join(" ")}`,
        "",
        entry.isLocked ? "[Locked content hidden]" : entry.content || "",
        ""
      ];
      const wrapped = doc.splitTextToSize(block.join("\n"), 515);
      if (y + wrapped.length * 12 > 780) {
        doc.addPage();
        y = 48;
      }
      doc.text(wrapped, 40, y);
      y += wrapped.length * 12 + 14;
      if (index !== filteredEntries.length - 1) {
        doc.line(40, y, 555, y);
        y += 18;
      }
    });

    doc.save("inkdrop-export.pdf");
    setStatus("PDF export ready.");
  }

  function startNewEntry() {
    resetDraft();
    setStatus("Start with a single word.");
  }

  if (loading) {
    return (
      <main className="loading-shell">
        <p>Preparing your writing sanctuary...</p>
      </main>
    );
  }

  return (
    <main className={clsx("inkdrop-theme", midnightMode && "midnight", focusMode && "focus")}>
      <header className="topbar">
        <div>
          <h1>InkDrop</h1>
          <p className="subtle-copy">
            {isAnonymous ? "Anonymous Draft Mode active." : "Your private writing sanctuary."}
          </p>
          {identity ? <p className="status-chip">Signed in as {identity}</p> : null}
        </div>

        <div className="toolbar">
          <button className="ghost" onClick={() => setMidnightMode((v) => !v)} type="button">
            {midnightMode ? "Light mode" : "Midnight mode"}
          </button>
          <button className="ghost" onClick={() => setFocusMode((v) => !v)} type="button">
            {focusMode ? "Exit focus" : "Focus mode"}
          </button>
          <button className="ghost" onClick={() => setTypewriterMode((v) => !v)} type="button">
            {typewriterMode ? "Normal scroll" : "Typewriter mode"}
          </button>
          {isAnonymous ? (
            <button className="ghost" onClick={() => router.push("/")} type="button">
              Sign up to keep forever
            </button>
          ) : (
            <button className="ghost" onClick={logout} type="button">
              Logout
            </button>
          )}
        </div>
      </header>

      {showSignupNudge && isAnonymous ? (
        <section className="panel nudge">
          <p>
            You have written a few pieces here. Create an account when you are ready, so nothing gets lost.
          </p>
          <button className="button tiny" onClick={() => router.push("/")} type="button">
            Save permanently
          </button>
        </section>
      ) : null}

      {resurfaced ? (
        <section className="panel resurfacing">
          <p className="subtle-copy">{daysAgoLabel(resurfaced.createdAt)}</p>
          <p>{resurfaced.title || resurfaced.preview || "A quiet memory resurfaced."}</p>
        </section>
      ) : null}

      <section className="status-row">
        <p>{status || "This is your quiet, judgment-free page."}</p>
        <p>
          Streak: {streak.count} calm day{streak.count === 1 ? "" : "s"}
          {offline ? " | Offline cache active" : ""}
        </p>
      </section>

      <section className="workspace">
        <aside className="panel list-panel">
          <div className="list-controls">
            <button className="button tiny" onClick={startNewEntry} type="button">
              New
            </button>
            <button className="ghost tiny" onClick={() => setPrompt(randomPrompt())} type="button">
              Prompt
            </button>
          </div>

          <p className="prompt-text">{prompt}</p>

          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search words, tags, feelings..."
          />

          <div className="filters">
            <select
              className="input"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="all">All types</option>
              <option value="note">Notes</option>
              <option value="poem">Poems</option>
              <option value="thought">Thoughts</option>
            </select>
            <label className="checkline">
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(event) => setFavoritesOnly(event.target.checked)}
              />
              Favorites only
            </label>
            <label className="checkline">
              <input
                type="checkbox"
                checked={showResurfacing}
                onChange={(event) => setShowResurfacing(event.target.checked)}
              />
              Memory resurfacing
            </label>
          </div>

          <div className="entry-list">
            {filteredEntries.length ? (
              filteredEntries.map((entry) => (
                <button
                  key={entryId(entry)}
                  className={clsx("entry-card", activeId === entryId(entry) && "active")}
                  onClick={() => openEntry(entry)}
                  type="button"
                >
                  <div className="entry-topline">
                    <strong>{entry.title || "(untitled)"}</strong>
                    <span>{entry.isFavorite ? "Favorite" : entry.type}</span>
                  </div>
                  <p>{entry.isLocked ? "[Locked] Private until PIN." : entry.preview || entry.content}</p>
                </button>
              ))
            ) : (
              <p className="empty-copy">Your mind is quiet... for now.</p>
            )}
          </div>
        </aside>

        <section className={clsx("panel editor-panel", typewriterMode && "typewriter")}>
          <div className="editor-head">
            <p className="subtle-copy">{noPressure ? "This does not have to stay." : "Auto-save is active."}</p>
            <p>{currentWordCount} words</p>
          </div>

          <input
            className="input title-input"
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="Title (optional)"
          />

          <textarea
            className="editor-area"
            value={draft.content}
            onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
            placeholder="Let the raw words land here..."
          />

          <div className="editor-grid">
            <select
              className="input"
              value={draft.type}
              onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}
            >
              <option value="note">Note</option>
              <option value="poem">Poem</option>
              <option value="thought">Thought</option>
            </select>

            <input
              className="input"
              value={draft.tagsInput}
              onChange={(event) => setDraft((current) => ({ ...current, tagsInput: event.target.value }))}
              placeholder="Tags: love, ideas, random"
            />
          </div>

          <div className="editor-grid">
            <label className="checkline">
              <input
                type="checkbox"
                checked={draft.isFavorite}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, isFavorite: event.target.checked }))
                }
              />
              Favorite
            </label>
            <label className="checkline">
              <input
                type="checkbox"
                checked={draft.isLocked}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, isLocked: event.target.checked }))
                }
              />
              Lock with PIN
            </label>
            <label className="checkline">
              <input
                type="checkbox"
                checked={noPressure}
                onChange={(event) => setNoPressure(event.target.checked)}
              />
              Write without pressure
            </label>
          </div>

          {draft.isLocked ? (
            <input
              className="input"
              type="password"
              value={draft.lockPin}
              onChange={(event) => setDraft((current) => ({ ...current, lockPin: event.target.value }))}
              placeholder="Set or update PIN (4+ chars)"
            />
          ) : null}

          <div className="editor-actions">
            <button className="button tiny" onClick={() => persistDraft(true)} type="button">
              Keep
            </button>
            <button className="ghost tiny" onClick={deleteCurrent} type="button" disabled={!activeId}>
              Delete
            </button>
            <button className="ghost tiny" onClick={clearAllData} type="button">
              Delete all data
            </button>
            <button className="ghost tiny" onClick={exportAsText} type="button">
              Export text
            </button>
            <button className="ghost tiny" onClick={exportAsPdf} type="button">
              Export PDF
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}

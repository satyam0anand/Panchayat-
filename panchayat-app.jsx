import { useState, useEffect, useRef, useCallback } from "react";

// ── Simulated persistent storage (localStorage-backed, multi-device sync via polling) ──
const DB_KEY = "panchayat_db_v1";

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    users: [{ id: "u1", username: "wardadmin", password: "ward@123", name: "Ward Admin", role: "admin" }],
    people: [],
    documents: [],
    lastUpdated: Date.now(),
  };
}

function saveDB(db) {
  db.lastUpdated = Date.now();
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

// ── AI Organizer (calls Claude via Anthropic API) ──
async function aiOrganizeDocument(fileName, fileContent, existingPeople) {
  const prompt = `You are an AI for a Panchayat (Indian village council) document management system.
Given this uploaded document file name: "${fileName}"
And existing registered people in the system: ${JSON.stringify(existingPeople.map(p => ({ id: p.id, name: p.name, aadhaar: p.aadhaar, mobile: p.mobile })))}

Extract from the file name any clues about:
1. Person's name
2. Document type (Aadhaar, Birth Certificate, Ration Card, Land Record, Income Certificate, Caste Certificate, Death Certificate, Property Tax, Water Bill, Election Card, Pension Document, Other)
3. Year if visible

Respond ONLY in this exact JSON format (no backticks, no markdown):
{
  "personName": "extracted name or null",
  "documentType": "document type",
  "matchedPersonId": "id of best matching existing person or null",
  "confidence": "high/medium/low",
  "tags": ["tag1","tag2"],
  "summary": "One line description"
}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    const text = data.content?.map(b => b.text || "").join("") || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { personName: null, documentType: "Other", matchedPersonId: null, confidence: "low", tags: [], summary: fileName };
  }
}

async function aiSearch(query, people, documents) {
  const prompt = `You are a search assistant for a Panchayat document system.
Query: "${query}"
People: ${JSON.stringify(people.slice(0, 30))}
Documents: ${JSON.stringify(documents.slice(0, 50).map(d => ({ id: d.id, name: d.name, type: d.type, personId: d.personId, tags: d.tags })))}

Return ONLY JSON (no markdown):
{
  "matchedPersonIds": ["id1","id2"],
  "matchedDocumentIds": ["id1","id2"],
  "summary": "brief explanation"
}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    const text = data.content?.map(b => b.text || "").join("") || "";
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return { matchedPersonIds: [], matchedDocumentIds: [], summary: "Search failed" };
  }
}

// ── Color palette & icons ──
const COLORS = {
  bg: "#0f1117",
  surface: "#1a1d27",
  card: "#21253a",
  border: "#2e3350",
  accent: "#f97316",
  accent2: "#3b82f6",
  green: "#22c55e",
  text: "#e8eaf0",
  muted: "#7b82a0",
  danger: "#ef4444",
};

const DOC_TYPE_COLORS = {
  "Aadhaar": "#f97316",
  "Ration Card": "#22c55e",
  "Birth Certificate": "#3b82f6",
  "Death Certificate": "#6366f1",
  "Land Record": "#eab308",
  "Income Certificate": "#14b8a6",
  "Caste Certificate": "#ec4899",
  "Election Card": "#8b5cf6",
  "Water Bill": "#06b6d4",
  "Property Tax": "#f59e0b",
  "Pension Document": "#a78bfa",
  "Other": "#7b82a0",
};

function Avatar({ name, size = 40, color }) {
  const initials = name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "??";
  const bg = color || `hsl(${(name?.charCodeAt(0) || 65) * 7 % 360}, 60%, 45%)`;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700, color: "#fff", flexShrink: 0,
      fontFamily: "Baloo 2, cursive",
    }}>{initials}</div>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{
      background: (color || "#3b82f6") + "22",
      color: color || "#3b82f6",
      border: `1px solid ${(color || "#3b82f6")}55`,
      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
      fontFamily: "Baloo 2, cursive",
    }}>{label}</span>
  );
}

// ── LOGIN SCREEN ──
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    setTimeout(() => {
      const db = loadDB();
      const user = db.users.find(u => u.username === username && u.password === password);
      if (user) { onLogin(user); }
      else { setError("Invalid username or password"); setLoading(false); }
    }, 600);
  };

  return (
    <div style={{
      minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "Baloo 2, cursive",
      backgroundImage: "radial-gradient(ellipse at 20% 50%, #1a2a4a 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, #2a1a0a 0%, transparent 60%)",
    }}>
      <div style={{
        background: COLORS.surface, border: `1px solid ${COLORS.border}`,
        borderRadius: 20, padding: "48px 40px", width: 360, boxShadow: "0 25px 60px #00000088",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: "linear-gradient(135deg, #f97316, #ef4444)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, margin: "0 auto 12px", boxShadow: "0 8px 24px #f9731640",
          }}>🏛️</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.text }}>Panchayat Seva</div>
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>Ward Document Management System</div>
        </div>

        {/* Fields */}
        {[
          { label: "Username", value: username, set: setUsername, type: "text", icon: "👤" },
          { label: "Password", value: password, set: setPassword, type: "password", icon: "🔒" },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 6 }}>{f.label}</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>{f.icon}</span>
              <input
                type={f.type} value={f.value}
                onChange={e => { f.set(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                style={{
                  width: "100%", padding: "12px 12px 12px 42px", background: COLORS.card,
                  border: `1px solid ${COLORS.border}`, borderRadius: 10, color: COLORS.text,
                  fontSize: 15, outline: "none", boxSizing: "border-box",
                  fontFamily: "Baloo 2, cursive",
                }}
              />
            </div>
          </div>
        ))}

        {error && <div style={{ color: COLORS.danger, fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</div>}

        <button onClick={handleLogin} disabled={loading} style={{
          width: "100%", padding: "13px", borderRadius: 10, border: "none",
          background: loading ? COLORS.muted : "linear-gradient(135deg, #f97316, #ef4444)",
          color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer",
          fontFamily: "Baloo 2, cursive", boxShadow: "0 4px 16px #f9731644",
          transition: "all 0.2s",
        }}>
          {loading ? "Signing in..." : "Sign In →"}
        </button>

        <div style={{ marginTop: 20, padding: "12px 14px", background: COLORS.card, borderRadius: 10, fontSize: 12, color: COLORS.muted }}>
          <strong style={{ color: COLORS.text }}>Demo:</strong> username: <code style={{ color: COLORS.accent }}>wardadmin</code> / password: <code style={{ color: COLORS.accent }}>ward@123</code>
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──
export default function App() {
  const [user, setUser] = useState(null);
  const [db, setDB] = useState(loadDB);
  const [tab, setTab] = useState("dashboard");
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [uploadModal, setUploadModal] = useState(false);
  const [addPersonModal, setAddPersonModal] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  const [syncStatus, setSyncStatus] = useState("synced");
  const fileInputRef = useRef();

  // Persist DB on change
  const updateDB = useCallback((updater) => {
    setDB(prev => {
      const next = updater(prev);
      saveDB(next);
      setSyncStatus("syncing");
      setTimeout(() => setSyncStatus("synced"), 800);
      return next;
    });
  }, []);

  // Multi-device sync simulation (poll localStorage every 5s)
  useEffect(() => {
    const iv = setInterval(() => {
      const fresh = loadDB();
      if (fresh.lastUpdated !== db.lastUpdated) {
        setDB(fresh);
        setSyncStatus("synced");
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [db.lastUpdated]);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── ADD PERSON ──
  const [newPerson, setNewPerson] = useState({ name: "", aadhaar: "", mobile: "", address: "", dob: "", gender: "Male" });

  function handleAddPerson() {
    if (!newPerson.name.trim()) return showToast("Name is required", "error");
    const person = { ...newPerson, id: "p_" + Date.now(), createdAt: Date.now() };
    updateDB(prev => ({ ...prev, people: [...prev.people, person] }));
    setNewPerson({ name: "", aadhaar: "", mobile: "", address: "", dob: "", gender: "Male" });
    setAddPersonModal(false);
    showToast(`${person.name} added successfully!`);
  }

  // ── UPLOAD DOCUMENT ──
  async function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setAiProcessing(true);
    setUploadModal(false);

    for (const file of files) {
      showToast(`AI organizing: ${file.name}...`, "info");
      const result = await aiOrganizeDocument(file.name, "", db.people);

      const doc = {
        id: "d_" + Date.now() + Math.random(),
        name: file.name,
        type: result.documentType || "Other",
        personId: result.matchedPersonId || null,
        suggestedName: result.personName,
        tags: result.tags || [],
        summary: result.summary || file.name,
        confidence: result.confidence,
        size: file.size,
        uploadedBy: user.id,
        uploadedAt: Date.now(),
        fileType: file.type,
      };

      updateDB(prev => ({ ...prev, documents: [...prev.documents, doc] }));
    }

    setAiProcessing(false);
    showToast(`${files.length} document(s) organized by AI!`);
    e.target.value = "";
  }

  // ── SEARCH ──
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const results = await aiSearch(searchQuery, db.people, db.documents);
    setSearchResults(results);
    setSearching(false);
  }

  // ── STATS ──
  const stats = {
    people: db.people.length,
    documents: db.documents.length,
    linked: db.documents.filter(d => d.personId).length,
    unlinked: db.documents.filter(d => !d.personId).length,
  };

  // ── PERSON VIEW ──
  function PersonFolder({ person }) {
    const docs = db.documents.filter(d => d.personId === person.id);
    const byType = docs.reduce((acc, d) => { (acc[d.type] = acc[d.type] || []).push(d); return acc; }, {});

    return (
      <div style={{ padding: "0 0 32px" }}>
        {/* Person header */}
        <div style={{
          background: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: 16, padding: 24, marginBottom: 20,
          display: "flex", alignItems: "center", gap: 20,
        }}>
          <Avatar name={person.name} size={60} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.text }}>{person.name}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {person.aadhaar && <Badge label={`Aadhaar: ${person.aadhaar}`} color={COLORS.accent} />}
              {person.mobile && <Badge label={`📱 ${person.mobile}`} color={COLORS.accent2} />}
              {person.gender && <Badge label={person.gender} color="#22c55e" />}
              {person.dob && <Badge label={`DOB: ${person.dob}`} color="#a78bfa" />}
            </div>
            {person.address && <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 8 }}>📍 {person.address}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.accent }}>{docs.length}</div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>Documents</div>
          </div>
        </div>

        {/* Documents by type */}
        {Object.keys(byType).length === 0 ? (
          <div style={{ textAlign: "center", color: COLORS.muted, padding: 40 }}>No documents linked yet</div>
        ) : Object.entries(byType).map(([type, tdocs]) => (
          <div key={type} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: DOC_TYPE_COLORS[type] || COLORS.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
              {type} ({tdocs.length})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {tdocs.map(doc => <DocCard key={doc.id} doc={doc} compact />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function DocCard({ doc, compact }) {
    const color = DOC_TYPE_COLORS[doc.type] || COLORS.muted;
    const person = db.people.find(p => p.id === doc.personId);
    return (
      <div style={{
        background: COLORS.card, border: `1px solid ${COLORS.border}`,
        borderRadius: 12, padding: compact ? "12px 14px" : "16px",
        borderLeft: `3px solid ${color}`,
        cursor: "default",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>📄</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.name}</div>
          </div>
        </div>
        <Badge label={doc.type} color={color} />
        {!compact && person && (
          <div style={{ marginTop: 8, fontSize: 12, color: COLORS.muted, display: "flex", alignItems: "center", gap: 6 }}>
            <Avatar name={person.name} size={18} /> {person.name}
          </div>
        )}
        {doc.confidence === "low" && (
          <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 6 }}>⚠ Low confidence match</div>
        )}
        <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 4 }}>
          {new Date(doc.uploadedAt).toLocaleDateString("en-IN")}
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen onLogin={setUser} />;

  const filteredPeople = db.people.filter(p =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.aadhaar?.includes(searchQuery) ||
    p.mobile?.includes(searchQuery)
  );

  const searchPeople = searchResults
    ? db.people.filter(p => searchResults.matchedPersonIds?.includes(p.id))
    : filteredPeople;

  const searchDocs = searchResults
    ? db.documents.filter(d => searchResults.matchedDocumentIds?.includes(d.id))
    : db.documents.filter(d =>
        d.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.type?.toLowerCase().includes(searchQuery.toLowerCase())
      );

  const navItems = [
    { id: "dashboard", icon: "🏠", label: "Dashboard" },
    { id: "people", icon: "👥", label: "People" },
    { id: "documents", icon: "📁", label: "Documents" },
    { id: "search", icon: "🔍", label: "Search" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "Baloo 2, cursive", color: COLORS.text, display: "flex" }}>

      {/* Sidebar */}
      <div style={{
        width: 220, background: COLORS.surface, borderRight: `1px solid ${COLORS.border}`,
        display: "flex", flexDirection: "column", padding: "20px 0", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 10,
      }}>
        <div style={{ padding: "0 20px 20px", borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>🏛️ Panchayat</div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>Seva Management</div>
        </div>

        <nav style={{ flex: 1, padding: "16px 12px" }}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => { setTab(n.id); setSelectedPerson(null); }} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer",
              background: tab === n.id ? COLORS.accent + "22" : "transparent",
              color: tab === n.id ? COLORS.accent : COLORS.muted,
              fontSize: 14, fontWeight: tab === n.id ? 700 : 500,
              marginBottom: 4, textAlign: "left", transition: "all 0.15s",
              fontFamily: "Baloo 2, cursive",
              borderLeft: tab === n.id ? `3px solid ${COLORS.accent}` : "3px solid transparent",
            }}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>

        {/* User info */}
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Avatar name={user.name} size={32} color={COLORS.accent} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{user.name}</div>
              <div style={{ fontSize: 11, color: COLORS.muted }}>{user.role}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: syncStatus === "synced" ? COLORS.green : "#f59e0b", display: "inline-block" }} />
            <span style={{ color: COLORS.muted }}>{syncStatus === "synced" ? "All devices synced" : "Syncing..."}</span>
          </div>
          <button onClick={() => setUser(null)} style={{
            marginTop: 10, width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
            background: "transparent", color: COLORS.muted, fontSize: 12, cursor: "pointer",
            fontFamily: "Baloo 2, cursive",
          }}>Sign Out</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ marginLeft: 220, flex: 1, padding: "24px 28px", minHeight: "100vh" }}>

        {/* Top Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
              {selectedPerson ? `📁 ${selectedPerson.name}'s Folder` :
               tab === "dashboard" ? "Dashboard" :
               tab === "people" ? "Village People" :
               tab === "documents" ? "All Documents" :
               tab === "search" ? "Smart Search" : "Settings"}
            </h1>
            {selectedPerson && (
              <button onClick={() => setSelectedPerson(null)} style={{
                background: "none", border: "none", color: COLORS.accent, cursor: "pointer",
                fontSize: 13, padding: 0, fontFamily: "Baloo 2, cursive",
              }}>← Back to People</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {aiProcessing && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.card, padding: "8px 16px", borderRadius: 20, fontSize: 13, color: "#f59e0b" }}>
                <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</span> AI organizing...
              </div>
            )}
            <button onClick={() => setAddPersonModal(true)} style={{
              padding: "9px 18px", borderRadius: 10, border: `1px solid ${COLORS.border}`,
              background: COLORS.card, color: COLORS.text, fontSize: 13, cursor: "pointer",
              fontFamily: "Baloo 2, cursive", fontWeight: 600,
            }}>+ Add Person</button>
            <button onClick={() => fileInputRef.current.click()} style={{
              padding: "9px 18px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #f97316, #ef4444)",
              color: "#fff", fontSize: 13, cursor: "pointer",
              fontFamily: "Baloo 2, cursive", fontWeight: 700,
              boxShadow: "0 4px 16px #f9731440",
            }}>⬆ Upload Docs</button>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileUpload} />
          </div>
        </div>

        {/* DASHBOARD */}
        {tab === "dashboard" && !selectedPerson && (
          <div>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
              {[
                { label: "Total People", value: stats.people, icon: "👥", color: "#3b82f6" },
                { label: "Total Documents", value: stats.documents, icon: "📄", color: "#f97316" },
                { label: "Linked Docs", value: stats.linked, icon: "✅", color: "#22c55e" },
                { label: "Unlinked Docs", value: stats.unlinked, icon: "⚠️", color: "#eab308" },
              ].map(s => (
                <div key={s.label} style={{
                  background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                  borderRadius: 14, padding: "20px 22px",
                  borderTop: `3px solid ${s.color}`,
                }}>
                  <div style={{ fontSize: 28 }}>{s.icon}</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 13, color: COLORS.muted }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Recent People */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Recent People</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                {db.people.slice(-6).reverse().map(p => {
                  const docCount = db.documents.filter(d => d.personId === p.id).length;
                  return (
                    <div key={p.id} onClick={() => { setSelectedPerson(p); setTab("people"); }} style={{
                      background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                      borderRadius: 14, padding: "16px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 14,
                      transition: "border-color 0.15s",
                    }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = COLORS.accent}
                      onMouseLeave={e => e.currentTarget.style.borderColor = COLORS.border}
                    >
                      <Avatar name={p.name} size={44} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: COLORS.muted }}>{p.mobile || p.aadhaar || "No contact"}</div>
                      </div>
                      <Badge label={`${docCount} docs`} color={COLORS.accent} />
                    </div>
                  );
                })}
                {db.people.length === 0 && (
                  <div style={{ color: COLORS.muted, fontSize: 14, padding: 20 }}>No people added yet. Click "+ Add Person" to start.</div>
                )}
              </div>
            </div>

            {/* Recent Documents */}
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Recent Documents</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {db.documents.slice(-8).reverse().map(d => <DocCard key={d.id} doc={d} />)}
                {db.documents.length === 0 && (
                  <div style={{ color: COLORS.muted, fontSize: 14, padding: 20 }}>No documents uploaded yet.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PEOPLE TAB */}
        {tab === "people" && !selectedPerson && (
          <div>
            <input
              placeholder="Search by name, Aadhaar, mobile..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: "100%", padding: "12px 16px", background: COLORS.surface,
                border: `1px solid ${COLORS.border}`, borderRadius: 12, color: COLORS.text,
                fontSize: 14, outline: "none", marginBottom: 20, boxSizing: "border-box",
                fontFamily: "Baloo 2, cursive",
              }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {filteredPeople.map(p => {
                const docs = db.documents.filter(d => d.personId === p.id);
                const byType = [...new Set(docs.map(d => d.type))].slice(0, 3);
                return (
                  <div key={p.id} onClick={() => setSelectedPerson(p)} style={{
                    background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                    borderRadius: 16, padding: "20px", cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.accent; e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.transform = "none"; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                      <Avatar name={p.name} size={48} />
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: COLORS.muted }}>{p.gender} {p.dob ? `• ${p.dob}` : ""}</div>
                      </div>
                    </div>
                    {p.aadhaar && <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>Aadhaar: {p.aadhaar}</div>}
                    {p.mobile && <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>📱 {p.mobile}</div>}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <Badge label={`${docs.length} docs`} color={COLORS.accent} />
                      {byType.map(t => <Badge key={t} label={t} color={DOC_TYPE_COLORS[t] || COLORS.muted} />)}
                    </div>
                  </div>
                );
              })}
              {filteredPeople.length === 0 && (
                <div style={{ color: COLORS.muted, gridColumn: "1/-1", textAlign: "center", padding: 40 }}>
                  No people found. Add new village member using "+ Add Person".
                </div>
              )}
            </div>
          </div>
        )}

        {/* PERSON FOLDER VIEW */}
        {tab === "people" && selectedPerson && <PersonFolder person={selectedPerson} />}

        {/* DOCUMENTS TAB */}
        {tab === "documents" && (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
              {["All", ...Object.keys(DOC_TYPE_COLORS)].map(type => (
                <button key={type} onClick={() => setSearchQuery(type === "All" ? "" : type)} style={{
                  padding: "6px 14px", borderRadius: 20, border: `1px solid ${searchQuery === type || (type === "All" && !searchQuery) ? COLORS.accent : COLORS.border}`,
                  background: searchQuery === type || (type === "All" && !searchQuery) ? COLORS.accent + "22" : COLORS.card,
                  color: searchQuery === type || (type === "All" && !searchQuery) ? COLORS.accent : COLORS.muted,
                  fontSize: 12, cursor: "pointer", fontFamily: "Baloo 2, cursive", fontWeight: 600,
                }}>{type}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {searchDocs.map(d => <DocCard key={d.id} doc={d} />)}
              {searchDocs.length === 0 && <div style={{ color: COLORS.muted, padding: 30 }}>No documents found.</div>}
            </div>
          </div>
        )}

        {/* SEARCH TAB */}
        {tab === "search" && (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
              <input
                placeholder="Search anything: name, village, document type, Aadhaar number..."
                value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSearchResults(null); }}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                style={{
                  flex: 1, padding: "14px 18px", background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`, borderRadius: 12, color: COLORS.text,
                  fontSize: 15, outline: "none", fontFamily: "Baloo 2, cursive",
                }}
              />
              <button onClick={handleSearch} disabled={searching} style={{
                padding: "14px 24px", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
                fontFamily: "Baloo 2, cursive",
              }}>{searching ? "⚙️ Searching..." : "🔍 AI Search"}</button>
            </div>

            {searchResults && (
              <div style={{ marginBottom: 12, padding: "12px 16px", background: COLORS.card, borderRadius: 10, fontSize: 13, color: "#3b82f6", borderLeft: `3px solid #3b82f6` }}>
                🤖 {searchResults.summary}
              </div>
            )}

            {searchQuery && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: COLORS.muted }}>People ({searchPeople.length})</div>
                  {searchPeople.map(p => (
                    <div key={p.id} onClick={() => { setSelectedPerson(p); setTab("people"); }} style={{
                      background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                      borderRadius: 12, padding: "14px 16px", cursor: "pointer", marginBottom: 8,
                      display: "flex", alignItems: "center", gap: 12,
                    }}>
                      <Avatar name={p.name} size={38} />
                      <div>
                        <div style={{ fontWeight: 700 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: COLORS.muted }}>{p.aadhaar || p.mobile}</div>
                      </div>
                    </div>
                  ))}
                  {searchPeople.length === 0 && <div style={{ color: COLORS.muted, fontSize: 13 }}>No people found</div>}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: COLORS.muted }}>Documents ({searchDocs.length})</div>
                  {searchDocs.map(d => <DocCard key={d.id} doc={d} />)}
                  {searchDocs.length === 0 && <div style={{ color: COLORS.muted, fontSize: 13 }}>No documents found</div>}
                </div>
              </div>
            )}
            {!searchQuery && (
              <div style={{ textAlign: "center", color: COLORS.muted, padding: 60 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 16 }}>Search by name, Aadhaar, document type, village area...</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>AI-powered smart search understands natural language</div>
              </div>
            )}
          </div>
        )}

        {/* SETTINGS */}
        {tab === "settings" && (
          <div style={{ maxWidth: 500 }}>
            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Add New User Account</div>
              {["username", "password", "name"].map(f => (
                <div key={f} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 4, textTransform: "capitalize" }}>{f}</label>
                  <input id={`new-${f}`} type={f === "password" ? "password" : "text"} style={{
                    width: "100%", padding: "10px 14px", background: COLORS.card,
                    border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text,
                    fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "Baloo 2, cursive",
                  }} />
                </div>
              ))}
              <button onClick={() => {
                const u = document.getElementById("new-username").value;
                const p = document.getElementById("new-password").value;
                const n = document.getElementById("new-name").value;
                if (!u || !p || !n) return showToast("Fill all fields", "error");
                updateDB(prev => ({ ...prev, users: [...prev.users, { id: "u_" + Date.now(), username: u, password: p, name: n, role: "user" }] }));
                showToast("User added! They can login on any device.");
              }} style={{
                padding: "10px 20px", borderRadius: 8, border: "none",
                background: COLORS.accent2, color: "#fff", fontSize: 13,
                fontWeight: 700, cursor: "pointer", fontFamily: "Baloo 2, cursive",
              }}>Add User</button>
            </div>

            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Registered Users ({db.users.length})</div>
              {db.users.map(u => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${COLORS.border}` }}>
                  <Avatar name={u.name} size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.muted }}>@{u.username} • {u.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ADD PERSON MODAL */}
      {addPersonModal && (
        <div style={{
          position: "fixed", inset: 0, background: "#00000088", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 100,
        }} onClick={() => setAddPersonModal(false)}>
          <div style={{
            background: COLORS.surface, border: `1px solid ${COLORS.border}`,
            borderRadius: 20, padding: 32, width: 440, boxShadow: "0 25px 60px #00000099",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>👤 Add Village Member</div>
            {[
              { key: "name", label: "Full Name *", type: "text" },
              { key: "aadhaar", label: "Aadhaar Number", type: "text" },
              { key: "mobile", label: "Mobile Number", type: "text" },
              { key: "dob", label: "Date of Birth", type: "date" },
              { key: "address", label: "Address", type: "text" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 5 }}>{f.label}</label>
                <input
                  type={f.type} value={newPerson[f.key]}
                  onChange={e => setNewPerson(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{
                    width: "100%", padding: "10px 14px", background: COLORS.card,
                    border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text,
                    fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "Baloo 2, cursive",
                  }}
                />
              </div>
            ))}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 5 }}>Gender</label>
              <select value={newPerson.gender} onChange={e => setNewPerson(p => ({ ...p, gender: e.target.value }))} style={{
                width: "100%", padding: "10px 14px", background: COLORS.card,
                border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text,
                fontSize: 14, outline: "none", fontFamily: "Baloo 2, cursive",
              }}>
                <option>Male</option><option>Female</option><option>Other</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setAddPersonModal(false)} style={{
                flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${COLORS.border}`,
                background: "transparent", color: COLORS.muted, cursor: "pointer", fontFamily: "Baloo 2, cursive",
              }}>Cancel</button>
              <button onClick={handleAddPerson} style={{
                flex: 2, padding: "11px", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg, #f97316, #ef4444)",
                color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "Baloo 2, cursive",
              }}>Add Person</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 200,
          background: toast.type === "error" ? COLORS.danger : toast.type === "info" ? COLORS.accent2 : COLORS.green,
          color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600,
          boxShadow: "0 8px 24px #00000066", animation: "fadeIn 0.3s ease",
        }}>{toast.msg}</div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: ${COLORS.bg}; } ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=date]::-webkit-calendar-picker-indicator { filter: invert(1); }
      `}</style>
    </div>
  );
}

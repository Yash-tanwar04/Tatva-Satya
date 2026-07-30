import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json());

// In-Memory Database Store
interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone?: string;
  organization?: string;
  subject: string;
  message: string;
  createdAt: string;
  status: "unread" | "read" | "replied";
  isImportant?: boolean;
  replyText?: string;
}

interface TatvTalksRSVP {
  id: string;
  eventName: string;
  name: string;
  email: string;
  organization: string;
  designation: string;
  attendanceType: "in-person" | "virtual";
  createdAt: string;
}

let contactMessages: ContactMessage[] = [];

let tatvTalksRSVPs: TatvTalksRSVP[] = [];

let newsletterSubscribers: { email: string; createdAt: string }[] = [];

// AI Consultant Lazily Instantiated
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// REST API ROUTES
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Tatv Satya LLP Backend API", timestamp: new Date().toISOString() });
});

// Contact Submission API
app.post("/api/contact", (req, res) => {
  const { name, email, phone, organization, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: "Name, email, and message are required fields." });
  }

  const newMessage: ContactMessage = {
    id: `msg-${Date.now()}`,
    name,
    email,
    phone: phone || "",
    organization: organization || "",
    subject: subject || "General Strategic Inquiry",
    message,
    createdAt: new Date().toISOString(),
    status: "unread",
    isImportant: false,
  };

  contactMessages.unshift(newMessage);
  console.log("New contact message received for Tatv Satya LLP:", newMessage.id);

  return res.json({
    success: true,
    message: "Thank you for reaching out to Tatv Satya LLP. Our executive leadership will connect with you shortly.",
    data: newMessage,
  });
});

// TatvTalks Registration API
app.post("/api/tatvtalks/register", (req, res) => {
  const { eventName, name, email, organization, designation, attendanceType } = req.body;
  if (!eventName || !name || !email) {
    return res.status(400).json({ error: "Event name, name, and email are required." });
  }

  const newRSVP: TatvTalksRSVP = {
    id: `rsvp-${Date.now()}`,
    eventName,
    name,
    email,
    organization: organization || "Independent Scholar / Youth Leader",
    designation: designation || "Delegate",
    attendanceType: attendanceType || "in-person",
    createdAt: new Date().toISOString(),
  };

  tatvTalksRSVPs.unshift(newRSVP);

  return res.json({
    success: true,
    message: "Your TatvTalks registration has been confirmed. Pass details emailed.",
    data: newRSVP,
  });
});

// Newsletter API
app.post("/api/newsletter", (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email address is required." });
  }

  if (!newsletterSubscribers.some(s => s.email === email)) {
    newsletterSubscribers.push({ email, createdAt: new Date().toISOString() });
  }

  return res.json({ success: true, message: "Subscribed to Tatv Satya Quarterly Dispatch." });
});

// Admin Dashboard APIs
app.get("/api/admin/stats", (_req, res) => {
  res.json({
    totalMessages: contactMessages.length,
    unreadMessages: contactMessages.filter(m => m.status === "unread").length,
    tatvTalksRSVPs: tatvTalksRSVPs.length,
    subscribers: newsletterSubscribers.length,
    impactYouthEngaged: "100,000+",
    artisansEmpowered: "250+",
    tournamentsConducted: "18+",
    hectaresRestored: "15,000+",
  });
});

app.get("/api/admin/messages", (_req, res) => {
  res.json({ success: true, messages: contactMessages });
});

app.put("/api/admin/messages/:id/reply", (req, res) => {
  const { id } = req.params;
  const { replyText } = req.body;

  const msg = contactMessages.find(m => m.id === id);
  if (!msg) {
    return res.status(404).json({ error: "Message not found." });
  }

  msg.status = "replied";
  msg.replyText = replyText;
  return res.json({ success: true, message: "Reply dispatched.", data: msg });
});

app.put("/api/admin/messages/:id/toggle-important", (req, res) => {
  const { id } = req.params;
  const msg = contactMessages.find(m => m.id === id);
  if (!msg) return res.status(404).json({ error: "Message not found." });

  msg.isImportant = !msg.isImportant;
  return res.json({ success: true, isImportant: msg.isImportant });
});

app.delete("/api/admin/messages/:id", (req, res) => {
  const { id } = req.params;
  contactMessages = contactMessages.filter(m => m.id !== id);
  return res.json({ success: true, message: "Message deleted successfully." });
});

app.delete("/api/admin/messages", (_req, res) => {
  contactMessages = [];
  return res.json({ success: true, message: "All messages cleared successfully." });
});

// Server-side Gemini AI Assistant Endpoint for Tatv Satya Consultations
app.post("/api/ai-consultant", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const ai = getAIClient();
    const systemInstruction = `You are "Tatv AI", the official strategic advisor and digital host for Tatv Satya LLP.
Tatv Satya LLP is a premier Indian social impact enterprise dedicated to:
1. Phoenix Domain: Revitalizing ancient Indian traditional sports & board games (Kalaripayattu, Chaupar, Ashtapada, Moksha Patam, Mallakhamb, Kabaddi, Vallam Kali, Gilli Danda, Pallanguzhi).
2. TatvTalks: Executive dialogue platform for youth leadership, cultural policy, and CSR innovation.
3. Environmental Sustainability: Organic farming models, circular economy in craft clusters, carbon footprint neutralization.
4. Social Impact & Rural Empowerment: Skill building, 250+ traditional artisans empowered, women entrepreneurship.
5. Strategic Heritage Advisory & CSR Services for corporates, NGOs, and government bodies.

Maintain an executive, warm, deeply respectful, knowledgeable, and inspirational tone. Answer questions concisely and elegantly.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const text = response.text || "I am honored to assist you with Tatv Satya LLP's initiatives.";
    return res.json({ success: true, reply: text });
  } catch (error: any) {
    console.error("Gemini AI Consultant Error:", error);
    return res.json({
      success: true,
      reply: "Greetings from Tatv Satya LLP. As our digital advisor, I invite you to explore the Phoenix Domain traditional games, review our CSR impact models, or schedule a strategic dialogue with our leadership.",
    });
  }
});

// VITE MIDDLEWARE / PRODUCTION STATIC SERVER
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Tatv Satya LLP Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();

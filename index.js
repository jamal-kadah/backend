import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

const CLIENT_ID =
  "ATqRRHAPa8ca1Cd-tfa1q4aGH451w4qtdh2m4XyZrVXht-HNNDTfWUV3bW4Qbs3N1K6m_iE1HfzvCBrZ";
const CLIENT_SECRET =
  "ELbbAZJaTc97p8Bt6nWsRbfcF8ESsETByHml2WWRoTgO40Sa4964Dxf5u9wm610k4og2l6mQaVti-MOL";
const PAYPAL_API = "https://api-m.paypal.com";

// Speichert bezahlte Sessions
const paidSessions = new Set();

// Holt Access Token von PayPal
async function getAccessToken() {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token;
}

// Erstellt eine Checkout-Session
app.post("/create-checkout-session", async (req, res) => {
  const accessToken = await getAccessToken();
  const sessionId = uuidv4();

  const orderRes = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: "EUR", value: "4.99" },
          invoice_id: sessionId, // Kommt später im Webhook zurück
        },
      ],
      application_context: {
        return_url: `https://rechnungsgenerator-xi.vercel.app/?session_id=${sessionId}`,
        cancel_url: "https://rechnungsgenerator-xi.vercel.app",
      },
    }),
  });

  const order = await orderRes.json();
  const approveLink = order?.links?.find((x) => x.rel === "approve")?.href;
  res.json({ url: approveLink });
});

// Webhook-Endpoint für PayPal
app.post("/paypal/webhook", express.json({ type: "*/*" }), async (req, res) => {
  const event = req.body;

  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const sessionId = event.resource?.invoice_id;
    if (sessionId) {
      paidSessions.add(sessionId);
      console.log("✅ Zahlung bestätigt für Session:", sessionId);
    }
  }

  res.sendStatus(200);
});

// Session-Check-Route für Frontend
app.get("/paypal/validate", (req, res) => {
  const { session_id } = req.query;
  res.json({ valid: paidSessions.has(session_id) });
});

// Start
app.listen(PORT, () => {
  console.log("✅ Backend läuft auf Port", PORT);
});

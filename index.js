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

// In‑Memory Storage für bezahlte Sessions (für Produktion: echte DB)
const paidSessions = new Set();

// Hilfsfunktion: holt Access Token von PayPal
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
  const { access_token } = await res.json();
  return access_token;
}

// 1) Checkout-Session anlegen
app.post("/create-checkout-session", async (req, res) => {
  try {
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
            invoice_id: sessionId,
          },
        ],
        application_context: {
          return_url: `https://rechnungsgenerator-xi.vercel.app/?session_id=${sessionId}`,
          cancel_url: "https://rechnungsgenerator-xi.vercel.app",
          landing_page: "LOGIN",
        },
      }),
    });

    const orderData = await orderRes.json();
    console.log("🚀 PayPal Order Response:", orderData);

    const approveLink = orderData.links?.find((l) => l.rel === "approve")?.href;
    res.json({
      url: approveLink,
      orderId: orderData.id,
      sessionId,
    });
  } catch (err) {
    console.error("❌ Error creating checkout session:", err);
    res.status(500).json({ error: "Checkout session creation failed" });
  }
});

// 2) Capture-Endpoint: zieht nach User‑Approval das Geld ein
app.post("/capture-order", async (req, res) => {
  const { orderId, sessionId } = req.body;
  try {
    const accessToken = await getAccessToken();
    const captureRes = await fetch(
      `${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const captureData = await captureRes.json();
    console.log("💰 Capture Response:", captureData);

    if (captureRes.ok) {
      paidSessions.add(sessionId);
      return res.json({ success: true });
    } else {
      return res.status(400).json({ success: false, error: captureData });
    }
  } catch (err) {
    console.error("❌ Error capturing order:", err);
    res.status(500).json({ error: "Order capture failed" });
  }
});

// 3) (Optional) Direkt validieren, ob Session bezahlt ist
app.get("/paypal/validate", (req, res) => {
  const { session_id } = req.query;
  res.json({ valid: paidSessions.has(session_id) });
});

// 4) (Optional) Webhook-Endpoint, falls du später Webhooks brauchst
app.post("/paypal/webhook", express.json({ type: "*/*" }), (req, res) => {
  const event = req.body;
  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const sid = event.resource?.invoice_id;
    if (sid) {
      paidSessions.add(sid);
      console.log("✅ Webhook: Zahlung bestätigt für Session:", sid);
    }
  }
  res.sendStatus(200);
});

// Server starten
app.listen(PORT, () => {
  console.log(`✅ Backend läuft auf Port ${PORT}`);
});

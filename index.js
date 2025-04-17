import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

const CLIENT_ID =
  "ATqRRHAPa8ca1Cd-tfa1q4aGH451w4qtdh2m4XyZrVXht-HNNDTfWUV3bW4Qbs3N1K6m_iE1HfzvCBrZ";
const PAYPAL_API = "https://api-m.paypal.com";
const CLIENT_SECRET =
  "ELbbAZJaTc97p8Bt6nWsRbfcF8ESsETByHml2WWRoTgO40Sa4964Dxf5u9wm610k4og2l6mQaVti-MOL";

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
        },
      ],
      application_context: {
        return_url: "http://localhost:5173/?paid=success",
        cancel_url: "http://localhost:5173",
      },
    }),
  });

  const order = await orderRes.json();
  const approveLink = order.links.find((x) => x.rel === "approve").href;
  res.json({ url: approveLink });
});

// Webhook-Endpoint für PayPal
app.post("/paypal/webhook", async (req, res) => {
  console.log("Webhook received:", req.body);
  // TODO: Hier Signature prüfen & Payment‑Status in DB speichern
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log("Server läuft auf Port", PORT);
});

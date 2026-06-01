# Square Webhooks

PressureFlow now has a webhook endpoint for Square invoice payment updates:

```text
/webhooks/square
```

When the app is deployed online, the full webhook URL will look like:

```text
https://your-domain.com/webhooks/square
```

Square cannot call `http://localhost:3000/webhooks/square` directly from the internet. For local testing, use a public HTTPS tunnel such as ngrok or Cloudflare Tunnel. For production, use the deployed HTTPS app URL.

## Events to subscribe to

Start with Square invoice events, especially events related to invoice payment or invoice updates. The app matches incoming invoice IDs against:

- `squareDepositInvoiceId`
- `squareFinalInvoiceId`

If Square reports the deposit invoice as paid, the job moves to:

```text
Deposit Paid
```

If Square reports the final invoice as paid, the job moves to:

```text
Paid
```

## Signature verification

Add the Square webhook signature key in PressureFlow Settings when you create the webhook subscription.

If the signature key is blank, PressureFlow accepts webhook calls. This is useful only for early local testing. For production, always configure the webhook signature key.

## Debug log

PressureFlow stores the latest local webhook processing events at:

```text
data/webhook-events.json
```

You can also view them through:

```text
/api/webhooks/square/events
```


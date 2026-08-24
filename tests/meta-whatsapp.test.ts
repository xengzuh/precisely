import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { handleVerification, parseMetaMessage, verifyMetaSignature } from "@/lib/whatsapp/meta"

const APP_SECRET = "test-app-secret"

const MESSAGE = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            contacts: [{ profile: { name: "Ahmad Faizal" }, wa_id: "60123456789" }],
            messages: [
              {
                from: "60123456789",
                id: "wamid.ABC123",
                timestamp: "1770000000",
                type: "text",
                text: { body: "do you have caustic soda?" },
              },
            ],
          },
        },
      ],
    },
  ],
})

describe("verifyMetaSignature", () => {
  const signature = createHmac("sha256", APP_SECRET).update(MESSAGE, "utf8").digest("hex")

  it("accepts a correct signature", () => {
    expect(
      verifyMetaSignature({ appSecret: APP_SECRET, rawBody: MESSAGE, header: `sha256=${signature}` })
    ).toBe(true)
  })

  it("accepts it without the sha256= prefix", () => {
    expect(
      verifyMetaSignature({ appSecret: APP_SECRET, rawBody: MESSAGE, header: signature })
    ).toBe(true)
  })

  it("rejects a body that was tampered with after signing", () => {
    // The point of the whole mechanism: a public URL anyone can POST to.
    const tampered = MESSAGE.replace("caustic soda", "sulphuric acid")
    expect(
      verifyMetaSignature({ appSecret: APP_SECRET, rawBody: tampered, header: `sha256=${signature}` })
    ).toBe(false)
  })

  it("rejects a wrong signature of the same length", () => {
    const wrong = signature.slice(0, -1) + (signature.endsWith("a") ? "b" : "a")
    expect(
      verifyMetaSignature({ appSecret: APP_SECRET, rawBody: MESSAGE, header: `sha256=${wrong}` })
    ).toBe(false)
  })

  it("rejects a missing header and a wrong secret", () => {
    expect(verifyMetaSignature({ appSecret: APP_SECRET, rawBody: MESSAGE, header: null })).toBe(false)
    const other = createHmac("sha256", "different").update(MESSAGE, "utf8").digest("hex")
    expect(
      verifyMetaSignature({ appSecret: APP_SECRET, rawBody: MESSAGE, header: other })
    ).toBe(false)
  })
})

describe("handleVerification", () => {
  const params = (o: Record<string, string>) => new URLSearchParams(o)

  it("echoes the challenge when the token matches", () => {
    const result = handleVerification({
      verifyToken: "secret-token",
      params: params({ "hub.mode": "subscribe", "hub.verify_token": "secret-token", "hub.challenge": "12345" }),
    })
    expect(result).toEqual({ ok: true, challenge: "12345" })
  })

  it("refuses a wrong token, so nobody else can claim the endpoint", () => {
    expect(
      handleVerification({
        verifyToken: "secret-token",
        params: params({ "hub.mode": "subscribe", "hub.verify_token": "guess", "hub.challenge": "12345" }),
      })
    ).toEqual({ ok: false })
  })

  it("refuses when mode or challenge is missing", () => {
    expect(
      handleVerification({
        verifyToken: "secret-token",
        params: params({ "hub.verify_token": "secret-token", "hub.challenge": "12345" }),
      })
    ).toEqual({ ok: false })
  })
})

describe("parseMetaMessage", () => {
  it("reads a text message", () => {
    expect(parseMetaMessage(MESSAGE)).toEqual({
      from: "60123456789",
      displayName: "Ahmad Faizal",
      body: "do you have caustic soda?",
      externalId: "wamid.ABC123",
    })
  })

  it("ignores delivery and read receipts", () => {
    // These arrive on the same webhook. Treating one as a message would draft
    // a reply to nothing, every time a message is delivered.
    const status = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { statuses: [{ status: "delivered" }] } }] }],
    })
    expect(parseMetaMessage(status)).toBeNull()
  })

  it("ignores non-text messages rather than inventing a body", () => {
    const image = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: "Ahmad" }, wa_id: "60123456789" }],
                messages: [{ from: "60123456789", id: "wamid.X", type: "image", image: { id: "1" } }],
              },
            },
          ],
        },
      ],
    })
    expect(parseMetaMessage(image)).toBeNull()
  })

  it("survives malformed input", () => {
    expect(parseMetaMessage("not json")).toBeNull()
    expect(parseMetaMessage("{}")).toBeNull()
  })
})

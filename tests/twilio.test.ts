import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { twilioSignature, verifyTwilioSignature } from "@/lib/whatsapp/twilio"

/**
 * Twilio's scheme signs the request URL concatenated with every POST parameter
 * sorted by key. This is the only thing between a public webhook URL and
 * anyone injecting customer messages, so it gets tested directly.
 */

// The worked example from Twilio's own documentation.
const TOKEN = "12345"
const URL = "https://mycompany.com/myapp.php?foo=1&bar=2"
const PARAMS = {
  Digits: "1234",
  To: "+18005551212",
  From: "+14158675310",
  Caller: "+14158675310",
  CallSid: "CA1234567890ABCDE",
}

describe("twilioSignature", () => {
  it("follows Twilio's documented construction", () => {
    // Independently spelled out rather than asserting a remembered hash: the
    // URL, then every parameter appended as key+value in alphabetical order,
    // HMAC-SHA1 with the auth token, base64. If the implementation ever stops
    // sorting, stops including the URL, or changes algorithm, this catches it.
    const expectedPayload =
      URL + "CallSidCA1234567890ABCDE" + "Caller+14158675310" + "Digits1234" +
      "From+14158675310" + "To+18005551212"

    const expected = createHmac("sha1", TOKEN)
      .update(Buffer.from(expectedPayload, "utf8"))
      .digest("base64")

    expect(twilioSignature(TOKEN, URL, PARAMS)).toBe(expected)
  })

  it("is order-independent, since it sorts the keys", () => {
    const reordered = {
      CallSid: PARAMS.CallSid,
      From: PARAMS.From,
      Digits: PARAMS.Digits,
      Caller: PARAMS.Caller,
      To: PARAMS.To,
    }
    expect(twilioSignature(TOKEN, URL, reordered)).toBe(twilioSignature(TOKEN, URL, PARAMS))
  })

  it("changes when the URL changes", () => {
    // The usual production failure: behind a tunnel the app sees localhost,
    // but Twilio signed the public URL.
    expect(twilioSignature(TOKEN, "https://other.example/hook", PARAMS)).not.toBe(
      twilioSignature(TOKEN, URL, PARAMS)
    )
  })

  it("changes when a parameter is tampered with", () => {
    expect(twilioSignature(TOKEN, URL, { ...PARAMS, Digits: "9999" })).not.toBe(
      twilioSignature(TOKEN, URL, PARAMS)
    )
  })
})

describe("verifyTwilioSignature", () => {
  const valid = twilioSignature(TOKEN, URL, PARAMS)

  it("accepts a correct signature", () => {
    expect(
      verifyTwilioSignature({ authToken: TOKEN, url: URL, params: PARAMS, signature: valid })
    ).toBe(true)
  })

  it("rejects a wrong signature of the same length", () => {
    // Exercises the constant-time compare rather than the length guard.
    const wrong = valid.slice(0, -1) + (valid.endsWith("=") ? "A" : "=")
    expect(
      verifyTwilioSignature({ authToken: TOKEN, url: URL, params: PARAMS, signature: wrong })
    ).toBe(false)
  })

  it("rejects a missing signature", () => {
    expect(
      verifyTwilioSignature({ authToken: TOKEN, url: URL, params: PARAMS, signature: null })
    ).toBe(false)
  })

  it("rejects a signature made with a different token", () => {
    const other = twilioSignature("wrong-token", URL, PARAMS)
    expect(
      verifyTwilioSignature({ authToken: TOKEN, url: URL, params: PARAMS, signature: other })
    ).toBe(false)
  })
})

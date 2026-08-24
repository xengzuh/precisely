"use server"

import {
  discardCustomerMessage,
  sendCustomerMessage,
} from "@/lib/erp/actions/definitions/conversations"
import { invoke } from "@/lib/erp/actions/server"

/** Thin wrappers over the action registry — see CLAUDE.md rule 1. */

export async function approveReply(messageId: string, body?: string) {
  await invoke(sendCustomerMessage, { messageId, body })
}

export async function discardReply(messageId: string, reason?: string) {
  await invoke(discardCustomerMessage, { messageId, reason })
}

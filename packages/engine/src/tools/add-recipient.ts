// ---------------------------------------------------------------------------
// SPEC 9 v0.1.3 P9.4 — `add_recipient` tool
//
// LLM-initiated contact-add. Fires when the LLM resolves an unknown contact
// mid-conversation — e.g. user types "send $10 to Mom" and "Mom" isn't in
// their saved contacts. The LLM calls `add_recipient` with no/incomplete
// input; the tool's preflight returns `needsInput`, the engine yields a
// `pending_input` event, the host renders an inline form, the user submits,
// the host's `/api/engine/resume-with-input` route resolves the polymorphic
// identifier (Audric handle / external SuiNS / bare 0x → canonical 0x),
// persists the unified Contact (SPEC 10 D7 shape), and calls
// `engine.resumeWithInput()` with the validated values.
//
// ## Tool boundary (v0.1.3 R2)
//
// `add_recipient` is **LLM-initiated only**. The user-initiated chip-flow
// contact-add UI (settings page / dashboard "Add contact" button) stays
// untouched — those flows write to the Contact table directly without
// going through this tool. Two co-existing add-contact paths is the
// design intent: chip-flow for user-initiated, `pending_input` for
// LLM-initiated. No surface conflict.
//
// ## Polymorphic identifier (v0.1.3 R6)
//
// The form has TWO fields, not three:
//   - `name` (text)         — user-friendly nickname ("Mom")
//   - `identifier` (sui-recipient) — polymorphic: accepts an Audric handle
//     (`@alice` / `alice.audric.sui`), an external SuiNS name (`alex.sui`),
//     or a bare 0x. Resolved server-side via `normalizeAddressInput`
//     (sui-address.ts) on the resume route, BEFORE this tool's call() runs.
//
// The single-field design matches how users actually think — "the way I
// refer to this person" is one piece of data, not three. Aligned with
// SPEC 10 v0.2.1 D7's unified Contact shape so SPEC 10 needs no migration.
//
// ## Why the call() body is a thin confirmation
//
// Persistence happens in the host's resume route (`/api/engine/resume-with-input`)
// BEFORE the engine resumes. By the time call() runs, the Contact row is
// already in the DB. call() just returns a confirmation payload + displayText
// for the LLM to narrate ("Saved Mom as a contact, now you can send to her
// directly"). Keeps the engine layer host-agnostic — no Prisma / no host-
// injected `persistContact()` callback to wire through ToolContext.
//
// ## Cross-references
//
// - SPEC 9 § A.2.1 (form schema spec)
// - SPEC 10 § D.7 (unified Contact shape)
// - `normalizeAddressInput` — sui-address.ts (S.52)
// - Host endpoint — audric/apps/web/app/api/engine/resume-with-input/route.ts
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { buildTool } from '../tool.js';
import type { FormSchema } from '../pending-input.js';

const ADD_RECIPIENT_FORM: FormSchema = {
  fields: [
    {
      name: 'name',
      label: 'Nickname',
      kind: 'text',
      required: true,
      placeholder: 'Mom',
      helpText: 'How you\'ll refer to this contact in chat.',
    },
    {
      name: 'identifier',
      label: 'Audric handle, SuiNS name, or wallet address',
      // [v0.1.3 R6] Polymorphic kind — accepts handles, names, and 0x.
      // The host renderer treats this as a single text input with
      // help-text guidance; server-side `normalizeAddressInput` does
      // the resolution.
      kind: 'sui-recipient',
      required: true,
      placeholder: 'mom.audric.sui  /  alex.sui  /  0x40cd…3e62',
      helpText:
        'Type @alice for an Audric user, alex.sui for any SuiNS, or paste a 0x address. ' +
        'We\'ll resolve it to the canonical wallet automatically.',
    },
  ],
};

export const addRecipientTool = buildTool({
  name: 'add_recipient',
  description:
    'Add a new contact to the user\'s saved-recipients list. Call this when you (the LLM) ' +
    'need to reference a contact that isn\'t saved yet — e.g. the user said "send $10 to Mom" ' +
    'but no contact named "Mom" exists. The user will fill in the nickname + identifier ' +
    '(an Audric handle, SuiNS name, or wallet address) via an inline form. ' +
    'The contact is persisted before this tool returns; the resumed call returns confirmation only. ' +
    'Do NOT call when the user manually opens the contact-add UI from settings — that\'s a separate ' +
    'user-initiated flow that doesn\'t need the LLM. Only call when YOU need to add a contact ' +
    'mid-conversation to make a downstream action work.',
  inputSchema: z.object({
    name: z.string().min(1).optional(),
    identifier: z.string().min(1).optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          'Optional nickname for the contact ("Mom"). Omit to let the user fill the form.',
      },
      identifier: {
        type: 'string',
        description:
          'Optional polymorphic identifier (Audric handle, SuiNS name, or 0x address). ' +
          'Omit to let the user fill the form.',
      },
    },
    required: [],
  },
  // Permission: read-only from the engine's perspective. The HOST writes
  // the Contact row in the resume endpoint; the tool's call() body is a
  // thin confirmation message. Treating as read-only keeps the engine's
  // permission gate from yielding `pending_action` (which would conflict
  // with the `pending_input` flow — you'd get a form, then a confirm card,
  // for what's semantically one user action).
  isReadOnly: true,
  // [SPEC 9 v0.1.3 P9.4] Opt out of EarlyToolDispatcher. Early-dispatch
  // runs the tool's call() mid-stream BEFORE the post-stream guard loop
  // (where preflight is invoked). If add_recipient ran via early-dispatch,
  // call() would fire with name/identifier=undefined and "save" garbage
  // before the form pause path is even consulted. Forcing the tool
  // through the post-stream loop guarantees preflight runs first.
  isConcurrencySafe: false,
  permissionLevel: 'auto',
  flags: {},
  preflight: (input) => {
    // [SPEC 9 v0.1.3 P9.4] When name OR identifier is missing, request a
    // form. The LLM can pre-populate one or both fields if it has them
    // (e.g. user said "save Mom as 0xabc..." → LLM could pass both); the
    // form lets the user fill the rest.
    //
    // We DON'T pre-fill the form's defaults from partial input because
    // the FormSchema doesn't carry per-field default values in v0.1.3.
    // If the LLM passed `name: "Mom"` but no identifier, we still show
    // an empty Nickname field — the LLM should re-narrate the name in
    // its preamble so the user can copy it back. (Pre-fill becomes a
    // v0.2 ergonomics enhancement once we add `defaultValue?: string`
    // to the FormField shape.)
    if (!input.name || !input.identifier) {
      return {
        valid: false,
        needsInput: {
          schema: ADD_RECIPIENT_FORM,
          description: 'Add a new contact',
        },
      };
    }
    // Both fields present — accept and fall through to call().
    return { valid: true };
  },

  async call(input) {
    // [SPEC 9 v0.1.3 P9.4] Persistence happens in the host's resume route
    // (which calls `normalizeAddressInput` to resolve the polymorphic
    // identifier, then `prisma.contact.create`). By the time call() runs
    // here, the Contact row exists. We just return a confirmation payload
    // for the LLM to narrate.
    //
    // `displayText` is what the LLM uses to compose its narration. Kept
    // brief — the LLM will expand on it ("Saved Mom — now I can send to
    // her directly. Want to continue with the $10 send?").
    const name = input.name as string;
    const identifier = input.identifier as string;
    return {
      data: {
        saved: true,
        name,
        identifier,
      },
      displayText: `Saved ${name} (${identifier}) to contacts.`,
    };
  },
});

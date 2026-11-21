# YUTA natural-language assistant

YUTA now has an optional natural-language entry point: in a private chat or enabled group, say the name “Yuta” in the message (for example, “Yuta, ¿cómo estás?” or “Yuta, sacá a Juan”) instead of typing a prefix. Prefixed commands still behave as before.

## What it does

- Uses the configured `ANTHROPIC_API_KEY` and `AI_MODEL` already used by `.ia`; if no key is configured, it falls back to the existing public text-generation service. The fallback may be less reliable and has no uptime guarantee.
- Answers conversational messages in a calm, warm Spanish/Argentine voice inspired by Yuta Okkotsu, without claiming to be the real character.
- Interprets requests into the existing registered command list only. It never executes model-generated shell, JavaScript, URLs, or arbitrary code.
- Runs commands through the same permissions, group-only, owner-only, and bot-admin checks as a typed command. No permission is granted by natural-language parsing.
- Search intent searches the public web with Bing HTML results and includes source links, falling back to Spanish Wikipedia if the web search is unavailable. Search availability/results depend on the provider; it is not guaranteed live or comprehensive.
- Keeps a short recent conversation context in memory (per bot account/chat/sender), capped at eight turns and lost on process restart.
- Supports explicit “Yuta, recuerda que …”, “Yuta, olvida …”, and “Yuta, qué recuerdas de mí?”. Stored memories are per sender and capped at 15 short items. Passwords, tokens, API keys, cookies and pairing codes are rejected. Memory is written in the existing bot JSON under `sessions/`; Render's ephemeral filesystem can lose it on restart unless a persistent disk is configured.

## Direct group actions

An unambiguous admin request such as “Yuta, expulsá a Juan” or “Yuta, expulsá a esta persona” (when replying to their message) executes directly without an extra confirmation, as configured by the owner. The requester must pass the existing admin check; YUTA itself must be a group admin; the target must be an exact unique group member match or an actual reply/mention. Ambiguous targets are refused. Other destructive actions remain constrained by each command's existing checks. Disable the bot in a group with its existing bot/group control if needed.

## Limits

- Mentioning “Yuta” is required for free conversation/routing; this avoids answering every group message.
- The model can misunderstand colloquial or incomplete requests. Ambiguous target/actions are asked back rather than guessed.
- No self-modifying code, self-deployment, unrestricted tools, or guaranteed repair of code/runtime errors.
- WhatsApp group actions are performed only where the linked account has the required privileges.
- Natural-language search is Wikipedia-only. Current events, live internet-wide search, and source coverage require a separate search provider/API.

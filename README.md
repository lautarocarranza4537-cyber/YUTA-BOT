# YUTA-BOT — deployment notes (audio change)

Public source: https://github.com/lautarocarranza4537-cyber/YUTA-BOT

## Audio commands

- `.play <name or YouTube / YouTube Music link>` sends M4A (`audio/mp4`, `.m4a`). If the chosen audio source is not MP4/M4A, ffmpeg transcodes it to AAC/M4A.
- `.playaudio <name or YouTube / YouTube Music link>` transcodes to mono Ogg/Opus at 48 kHz / 48 kbit/s and sends it with Baileys' `ptt: true` flag.
- Both commands are limited to 12 minutes and 30 MiB. The existing queue limits outstanding commands; don't increase these limits without adjusting memory/CPU safeguards.
- YouTube extraction/search is unofficial and upstream behavior, availability, country restrictions and throttling can change. No method can promise uninterrupted YouTube extraction.
- Important: YouTube's current [Terms of Service](https://www.youtube.com/static?template=terms) prohibit automated access and downloading content unless expressly authorized by the Service or covered by prior written permission from YouTube and, when applicable, the rights holders. A copyright license alone does not override the platform's automated-access terms. Use this flow only where YouTube permits it or the required written permissions apply, and follow applicable copyright law.

## Disk, memory, and Render

Audio download and outgoing media are Buffer objects in process memory (up to 30 MiB per source buffer, plus temporary copies during conversion/send). ffmpeg conversion uses the OS temporary directory (`os.tmpdir()`, normally `/tmp` on Render); the helper removes input/output temporary files in `finally`. This is temporary disk, not persistent storage. A process restart discards that temporary data.

This project also **does** write non-audio state to its filesystem: WhatsApp multi-file authentication under `sessions/`, account preference JSON, and optional banner images. Render's ordinary filesystem is ephemeral, so account sessions/preferences can be lost when the service restarts or redeploys unless an appropriate persistent disk is configured and mounted. Do not mistake the no-archive audio flow for a stateless WhatsApp bot.

## Safety / known limits

- The old `/api/stream` and `/api/audio` helpers accept only YouTube URLs or text searches; arbitrary external URLs are rejected. The resolved audio URL must use HTTPS on a `googlevideo.com` host. Response media is checked and capped before it is buffered.
- This does not add an official YouTube API integration or make YouTube extraction authorized by YouTube. It also does not add user authentication to existing bot APIs; protect any exposed service endpoints using deployment-level access controls if needed.
- Conversion requires ffmpeg with AAC (`aac`) and Opus (`libopus`) encoders. The bot returns a command failure if conversion fails rather than intentionally mislabeling incompatible bytes.
- WhatsApp delivery has not been end-to-end tested as part of this change. It still depends on a linked Baileys session, WhatsApp accepting the media, and the server's ffmpeg/network setup.

## Install / test

Install dependencies with `npm ci`; ensure ffmpeg and yt-dlp are available. Run `npm start`. A smoke test of output codecs can be done locally using ffmpeg; that does not exercise YouTube or WhatsApp. See the accompanying patch report for test results and the ten Termux steps.

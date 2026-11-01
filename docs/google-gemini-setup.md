> Release 2.0: `/demo/` uses a dedicated weekly agent with five validated tools. The original eight-tool historical agent remains at `/demo/historical.html`. Both use the same server-only provider configuration described below.

# Google Gemini setup

RefMatch uses **Google Gemini through CopilotKit** by default. The local server streams Gemini responses and routes tool calls to the app's validated scenario controls.

Add or update these entries in the existing ignored `.env` file:

```dotenv
REFMATCH_PROVIDER=google
GEMINI_API_KEY=your-key-here
REFMATCH_MODEL=google:gemini-3.5-flash-lite
REFMATCH_PORT=4173
```

Get and manage keys in [Google AI Studio](https://aistudio.google.com/apikey). Check the key's associated project, Gemini API access, and any key restrictions. The response alone does not identify which permission is missing. See Google's [API key guide](https://ai.google.dev/gemini-api/docs/api-key) and [API troubleshooting guide](https://ai.google.dev/gemini-api/docs/troubleshooting).

Keep keys out of chat and source control. Rotate any exposed key. The server reads the ignored `.env` and sends credentials only to the provider; the browser calls the same-origin CopilotKit runtime. The preview blocks access to `.env` and server files. `GOOGLE_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` are accepted alternatives; `GEMINI_API_KEY` takes precedence.

Restart `npm run preview` after updating the key. Open `http://127.0.0.1:4173/demo/historical.html` and ask “Compare Michael Oliver and Mike Dean”, then “Exclude Michael Oliver from this scenario.” For the default Tottenham–Arsenal fixture, the second request should move the experimental recommendation from Michael Oliver at 88% to Mike Dean at 82%, while actual availability remains unknown. Run `npm run test:e2e -- --live-ai` for the browser journey. Validate the app's actual streaming route; a failed model-list or non-streaming request alone does not establish whether streaming is available.

Release 1.2 selects `gemini-3.5-flash-lite` and a low thinking level for this bounded tool workflow. During local verification, the Flash latest endpoint returned a 503 service error while Flash Lite responded using the same credential. Model selection is explicit rather than an automatic fallback. See [Google's model documentation](https://ai.google.dev/gemini-api/docs/models) and [thinking configuration](https://ai.google.dev/gemini-api/docs/thinking). The installed AI SDK's Google adapter streams function calls; the eight allowed frontend tools validate arguments and reject stale or cancelled actions. Scores always come from the deterministic engine.

Optional [Copilot Studio setup](microsoft-copilot-setup.md) remains available but is not required for Gemini.

# Copilot Studio setup for RefMatch

The optional **Copilot Studio → Direct Line → CopilotKit** adapter is implemented and tested with a simulated service. [Google Gemini](google-gemini-setup.md) is the default provider. No real Studio endpoint or sign-in setup has been verified. These instructions apply only when Studio is explicitly selected.

## Connect the published agent

In Copilot Studio, select the agent, then **Channels → Mobile app → Token Endpoint**. Add that endpoint to the existing ignored `.env` file:

```dotenv
REFMATCH_PROVIDER=copilot-studio
COPILOT_STUDIO_TOKEN_ENDPOINT=https://your-agent-token-endpoint
```

For a secured Direct Line channel, put its secret in `COPILOT_STUDIO_DIRECT_LINE_SECRET` instead. The server exchanges it for a conversation token; the secret never reaches the browser. If both are set, the secret takes precedence. The default Direct Line URL is `https://directline.botframework.com/v3/directline`; use `COPILOT_STUDIO_DIRECT_LINE_URL` if your agent requires a regional endpoint. Restart `npm run preview` after changing configuration. Do not paste secrets into chat or commit them.

Microsoft documents [retrieving the Token Endpoint](https://learn.microsoft.com/en-us/microsoft-copilot-studio/publication-connect-bot-to-custom-application) and [secured channel token generation](https://learn.microsoft.com/en-us/microsoft-copilot-studio/configure-web-security).

**User sign-in is separate from channel security.** This release detects OAuth/sign-in cards and shows a clear connection message; it does not implement interactive Entra sign-in or SSO. If the agent requires sign-in, keep that requirement and supply the intended Entra/SSO setup so the integration can be completed. An agent requiring sign-in cannot be marked connected merely by adding a Direct Line secret. See Microsoft's [authenticated SDK integration](https://learn.microsoft.com/en-us/microsoft-copilot-studio/publication-integrate-web-or-native-app-m365-agents-sdk).

## Configure the agent's response contract

The adapter needs a structured action request from the agent. It is not a generic Copilot Chat iframe and does not assume Studio text messages are native function calls.

Add the RefMatch instructions to an appropriate agent/topic and publish the update. Print the exact instructions used by this release with:

```sh
node --input-type=module -e 'import { studioInstructions } from "./scripts/copilot-studio.mjs"; console.log(studioInstructions)'
```

Each request includes a fresh `requestId`, the current fixture and calculated results, recent conversation text, and `latestUserRequest`. The reply must be one JSON object containing the matching request ID and an allowed tool:

```json
{"requestId":"copy-from-input","tool":"compare_referees","arguments":{"first":"r384888","second":"r381851"}}
```

Supported actions:

| Tool | Arguments |
| --- | --- |
| `inspect_fixture` | `{}` |
| `search_fixtures` | `{"query":"Arsenal Tottenham 2017-11-18"}` |
| `compare_referees` | `{"first":"r384888","second":"r381851"}`; distinct source IDs from the current catalog |
| `set_availability` | `{"changes":[{"refereeId":"r384888","available":false}]}`; 1–21 unique referees |
| `select_fixture` | `{"fixtureId":"m2499987"}`; a source fixture ID from search results |
| `reset_availability` | `{}` |
| `undo_change` | `{}` |

Ambiguous or unsupported requests return `{"requestId":"copy-from-input","clarification":true}`. A custom topic may instead emit a `refmatch.action` event with the same object as its value. Arbitrary prose, unknown actions, invalid values, and mismatched request IDs never trigger changes.

## Behavior and limits

The server opens one short-lived Direct Line conversation per user request. It polls activities using Microsoft's [watermark protocol](https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-direct-line-3-0-receive-activities) and cancels after 45 seconds or when the user stops. The app sends current historical scenario facts and up to six recent text messages to the configured Studio agent; sports-data fetching stays independent.

Studio identifies one action. The bridge validates it, CopilotKit invokes the browser's guarded tool, and the existing matching engine recalculates the result. The final reply is rendered from that returned result. No model generates fit scores, invents operational eligibility, or invents an excluded referee's score. Batched availability changes are supported; requests requiring several different tools ask for one action at a time.

## Verify

After configuring the real agent, run the local preview and then:

```sh
npm test
npm run test:e2e -- --live-ai
```

To test the bridge without Microsoft credentials, start this isolated test server:

```sh
node scripts/test-copilot-runtime.mjs --studio
```

Then, in another terminal:

```sh
REFMATCH_TEST_URL=http://127.0.0.1:4181 npm run test:e2e -- --scripted-ai --studio
```

This exercises the actual Studio adapter, AG-UI events, CopilotKit runtime, browser tools, and result cards against a simulated Direct Line service. It does **not** verify your published agent, authentication, or live intent accuracy. The normal preview never selects the simulated service.

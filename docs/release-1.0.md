# RefMatch 1.0

Local release, 24 October 2026. Google Gemini is connected and the live home-to-result browser journey passes.

## Included

- Home page linking to the assignment workspace.
- Three fictional fixtures with deterministic risk profiles, eligibility filters, and ranked referees.
- CopilotKit conversation using Google Gemini, with validated scenario actions and explanations grounded in engine results. Optional Studio and OpenAI adapters are retained.
- Comparison cards for any two referees, with weighted factor contributions, eligibility, and caveats.
- Availability changes with before/after rankings, undo, reset, and separate overrides per fixture.
- Historical foul-rate calibration with attribution; all displayed entities remain fictional.

## Run locally

Use Node.js 22+, run `npm ci`, and then `npm run preview`. Open `http://127.0.0.1:4173/` and choose **Try the interactive demo**. The direct workspace address is `http://127.0.0.1:4173/demo/`.

Configure Google access using the [Gemini setup guide](google-gemini-setup.md). The local `.env` is configured and the key stays on the server. The scorer and manual controls work independently. Optional Studio and OpenAI adapters require explicit provider selection. See `.env.example`. A page reload clears the local scenario and conversation. No durable storage or real appointment workflow is included.

## Review journey

1. Open the home page, then enter the app. North FC vs South FC initially recommends Referee A at 91%.
2. Compare A and B. The cards show a three-point displayed gap and the individual factor contributions.
3. Ask “Why does Referee A lead Referee B?” The assistant calls the comparison tool and explains its returned evidence.
4. Ask “Mark Referee A unavailable and show what changed.” B becomes the recommendation at 88%; A is visibly excluded in the cards and controls.
5. Use **Undo change**, switch fixtures, or restore default availability with **Reset**.
6. Compare an excluded referee or make everyone unavailable. The app explains exclusions and shows an empty recommendation when appropriate.

## Validation commands

`npm test` covers the engine, data, scenario store, and assistant action boundaries. With the preview running, `npm run test:e2e -- --live-ai` tests the complete browser journey with real CopilotKit requests, along with service interruption, offline mode, mobile layout, keyboard controls, and private server paths. Screenshots are written to `test-results/`.

## Integration references

- [CopilotKit core client](https://docs.copilotkit.ai/reference/core)
- [CopilotKit runtime setup](https://docs.copilotkit.ai/react-spa)
- [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key)
- [Copilot Studio custom app channel](https://learn.microsoft.com/en-us/microsoft-copilot-studio/publication-connect-bot-to-custom-application)

The CopilotKit packages are pinned to 1.79.1. The `.npmrc` omits optional peer integrations used by other agent frameworks. Google and OpenAI use the v2 built-in agent; Studio uses a custom AG-UI agent. Overrides pin Zod 4.6.6 and Undici 6.29.1 to resolve dependency advisories; the exercised runtime paths are covered by unit and browser checks.

## Verified status

- Sixteen automated tests passed for data, scoring, state, assistant tools, Studio request correlation, token exchange, polling, cancellation, errors, and AG-UI output.
- Fourteen browser checks passed through the real Studio adapter and CopilotKit runtime against a simulated Direct Line service. They cover the home-to-result journey, comparison/explanation, chat what-if, undo/reset, empty results, mobile and keyboard use, service interruption, retry, cancellation, stale actions, sign-in requirements, invalid agent responses, and private server paths.
- Nine browser checks passed against **live Google Gemini**, including home-to-result navigation, comparison/explanation, conversational availability changes, manual undo/reset, empty results, simulated service interruption, mobile/keyboard interaction, and protected server files. The live change moved the derby recommendation from Referee A (91%) to Referee B (88%).
- Twelve browser checks also passed with a scripted model through the built-in CopilotKit agent, including retry, cancellation, and stale-action handling. The optional Studio adapter has only been verified with a simulated Direct Line service. Test doubles are isolated from the normal preview.
- `npm audit` reports **zero vulnerabilities** after the dependency overrides.
- A clean `npm ci`, browser build, and whitespace checks passed. Configured secrets are absent from the browser bundle and example configuration.

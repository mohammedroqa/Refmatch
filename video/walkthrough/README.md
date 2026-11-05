# RefMatch Evaluation Lab video walkthrough

**Submission link:** https://mohammedroqa.github.io/Refmatch/video/walkthrough/

Submit this public viewing link, not the video file. The same link appears in the root README. The player requires no login and includes narration, burned-in English captions, chapter navigation, and a transcript.

## Contents

- The problem: confidently clearing a referee allocation despite changed or unresolved evidence.
- Dataset and references: 136 cases, 24 families, 92 development and 44 public-validation cases.
- Grading: rule audits, evidence extraction, citations, verdict precedence, unsafe clearance, and coverage.
- Live browser workflow: an eight-case evidence-reading validation simulation, with 5/8 correct verdicts and 3/5 unsafe plans incorrectly cleared.
- Two failure investigations: uncertain travel and a confirmed withdrawal.
- Reference-assisted control, report exports, blind review, and the workflow for actual provider evaluation.
- Closing project-owner credit, copyright notice, and the exact tagline “Made with ❤️ By Mohammed Roqa”.

The recorded outputs are the app's labelled simulations. No provider-model measurements are invented. [Captured batches and metric checks](evidence/verification.json) preserve the evidence for the numbers narrated in the video.

## Delivery

- [Finished MP4](refmatch-evaluation-walkthrough.mp4): H.264, 1920 × 1080, 25 fps, AAC narration at 48 kHz, fast-start metadata, and 12 embedded chapters.
- [Media validation](media.json): exact duration, size, audio and video details.
- [English captions](captions.vtt), [chapters](chapters.vtt), and [transcript](transcript.md).
- [Narration and scene source](scenes.json), [title cards](cards.html), and [public player](index.html).

The app screens are recorded from the public Evaluation Lab. Recording overlays add chapter labels, a cursor, highlights, and caption space. Screens, metrics, notes, and responses come from the actual app. Narrative slides explain the grading contract and findings.

## Reproduce

Requires Windows with the Microsoft Zira Desktop voice for narration, Node.js 22+, Playwright Chromium, and FFmpeg/FFprobe. Use `npm ci` and `npx playwright install chromium` if needed. Add FFmpeg to PATH or set `FFMPEG` and `FFPROBE` to the executable paths.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/narrate-walkthrough.ps1
node scripts/capture-walkthrough.mjs
node scripts/render-walkthrough.mjs
```

Capture navigates the live public app by default; `REFMATCH_WALKTHROUGH_URL` can point to another compatible deployment. Recording takes approximately the running time of the video. Intermediate audio and browser captures stay under ignored `video/.render/walkthrough/`. The public batch reports contain only synthetic cases.

## Credits

Project owner: **Mohammed Roqa**.

© 2026 Mohammed Roqa. All rights reserved.

**Made with ❤️ By Mohammed Roqa**

Narration: Microsoft Zira Desktop, synthesized locally using Windows speech synthesis. No music or third-party sound samples are used. RefMatch logos and the existing project portrait are reused from this repository; portrait provenance is in [assets/README.md](../../assets/README.md). Bundled fonts retain their SIL Open Font Licenses. Third-party assets retain their respective licenses.

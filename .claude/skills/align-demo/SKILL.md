---
name: align-demo
description: Align the animated walkthrough (frontend/public/demo.html) with the app as it ships now, keeping its flow and length. Use when asked to align, refresh or update the demo.
---

# Align the demo

`frontend/public/demo.html` replays one tracked day on a rebuilt copy of the app's screen: the
components' markup as string builders, ports of the domain modules, a scoped copy of the app
stylesheet and a snapshot of the config. Nothing reads the live app, so it drifts with every UI
change.

## Scope

Keep the walkthrough's acts and length about as they are. Rebuild what the existing beats show;
add a beat only where a changed flow needs one to stay truthful, and drop a beat whose surface is
gone. Do not add flows the demo never covered.

## Captions

A caption explains only behavior the screen does not make obvious: a rule, a threshold, why
something is greyed, what a tap would reach. Everything a viewer can see needs no caption, and
such a beat's caption stays empty. One short sentence, never narration of the tap itself.

## Steps

1. **Find the drift.** List what changed since the demo was last touched:
   `git log --oneline $(git log -1 --format=%h -- frontend/public/demo.html)..HEAD -- frontend/src config`.
   Past commits that only edited captions can hide older drift, so also compare each rebuilt
   function against its component (named in the function's header comment) directly.
2. **Regenerate the generated parts.** From the repo root run
   `python3 .claude/skills/align-demo/sync_demo.py`. It rewrites the scoped stylesheet between
   its markers, the questionnaire snapshot and the chat's sample questions. Rules that exist only
   for the demo sit outside the markers and stay.
3. **Port by hand what the script cannot:** the markup builders, the domain ports (derive,
   violations, trend, weight, dates), config values outside the questionnaire, and the history
   fixture's answers for any new question. Mirror class names and markup exactly, so the
   generated stylesheet applies.
4. **Fix the beats and captions** per the rules above, and the beat count in the transport's
   counter and the script's section comment.
5. **Verify** in headless Chromium. Copy `verify_replay.js` into a scratchpad folder with
   `playwright-core` installed (Node resolves it from the script's own folder), and there run
   `node verify_replay.js <abs path to demo.html> <out dir> <beats…>`.
   Every beat must report no missing tap target and no spill. Then read the screenshots of the
   beats you changed. Scroll and flash targets that appear only after their beat applies are
   expected, and so is the favicon failing to load under file://.
6. **Publish** with `scripts/sync-frontend.sh`; the demo ships with the frontend.

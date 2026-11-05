# RefMatch Evaluation Lab — Video walkthrough

## 00:00 — RefMatch Evaluation Lab

Welcome to RefMatch Evaluation Lab, a project by Mohammed Roqa. This walkthrough explores the problem, runs an evaluation, and follows a failure back to its evidence.

## 00:11 — 01 / The problem

A confident explanation can hide an unsafe referee allocation. A late withdrawal can invalidate a plan, while uncertain attendance should prevent clearance. RefMatch tests whether an AI can read changing committee evidence, apply appointment rules, and recognize missing information. The rules and cases are experimental. Today's demonstration uses clearly labelled simulations.

## 00:32 — 02 / Cases and references

First, check the reference answers. All 136 authored references agree with the deterministic validator. The corpus has 24 families, with 92 development cases and 44 public validation cases. Related variants stay together. Sixteen cases test narrative evidence reading. Both splits are public, so validation is not an unseen benchmark. Reference agreement checks consistency, not expert approval.

## 00:58 — 03 / How grading works

Two tasks separate the source of a failure. Rule audit supplies structured facts and tests rule application. Evidence reading withholds reference committee facts and asks for extracted statuses, source citations, and a verdict. A demonstrated violation means invalid, even if another check is unresolved. With no established violation, an unresolved required check means insufficient information. Only cleared checks permit valid. Scoring compares verdicts, rule categories, extracted facts, and citations against references. Explanatory prose is left for human review.

## 01:31 — 04 / Run a frozen batch

Let's choose Evidence reading, Public validation, and Overconfident clearance. We keep one trial and run the simulation. This task and split contain eight cases. Each batch freezes its case list, prompt version, settings, and dataset and rule hashes. No model provider is called.

## 01:48 — 05 / Read the results

All eight cases completed, with no errors or unrun cases. Five verdicts are correct: 62.5 percent end to end accuracy. But three of the five invalid or unresolved plans were incorrectly cleared: 60 percent unsafe clearance. That includes two of three unresolved cases and one of two invalid plans. These denominators matter. Accuracy includes every planned case, while conditional safety rates must be read alongside coverage. These are simulated results, not measured model performance.

## 02:17 — 06 / Failure: uncertainty becomes certainty

Filter for unsafe clearances and inspect this attendance case. The earlier roster says available. The latest usable note says travel is still unconfirmed and explicitly warns against assuming attendance. A later note falls after the planning cutoff, and the untrusted attachment is not a committee update. The correct verdict is insufficient information. The scripted response instead extracts available and returns valid. The stage diagnosis shows how a wrong extracted fact produces the wrong downstream decision.

## 02:45 — 07 / Failure: a withdrawal is missed

A second failure is more direct. Both coordinators confirm that the referee has withdrawn and is unavailable. The reference therefore marks the allocation invalid. The overconfident simulation still calls it valid. Together, these examples distinguish an unresolved check from a demonstrated violation, and show why either one should prevent clearance.

## 03:04 — 08 / Check the scoring pipeline

Now run Reference assisted answers on the same task and split. The simulation matches all eight references and clears none of the five unsafe plans. Extraction and citation matches also reach one hundred percent. This is expected because the simulation reads the answer key. It verifies the scoring pipeline; it does not demonstrate model intelligence.

## 03:24 — 09 / Reproduce and review

Download the batch report to preserve the frozen settings, input hashes, and individual attempts. Scores can also be exported as a spreadsheet friendly CSV. Blind review packs omit authored answers and revealing titles. Separate domain and technical reviewers can record judgments, with a third adjudicator for disagreements. Reviewer identities and expertise are self declared.

## 03:46 — 10 / What the failures show

The failure explorer makes two patterns visible: uncertainty promoted to fact, and a withdrawal ignored. Both lead to unsafe clearance. These runs are scripted simulations. For frontier model evaluation, configure an exact model through the local provider runner and use the same frozen batches and scoring. Then inspect each measured failure against its source evidence.

## 04:06 — Project owner and credits

RefMatch. Find the failure. Follow the evidence. Project owner: Mohammed Roqa. Copyright 2026, Mohammed Roqa. Made with love by Mohammed Roqa.

Project owner: Mohammed Roqa.

© 2026 Mohammed Roqa. All rights reserved.

Made with ❤️ By Mohammed Roqa

Purpose

This document explains the project intent, product goals, domain assumptions, constraints, and expected agent behavior for the RescueSight repository.

This is not the architecture or setup document.
Use the README for system architecture, local development, environment setup, and deployment details.

Agents working in this repository should use this file to understand:

what the project is trying to solve

what the product should and should not claim

what features are in scope

what design principles should guide implementation

what workstreams are currently important

Project Overview

Project name: RescueSight

RescueSight is an XR-guided emergency response system intended for public settings. Its purpose is to help bystanders respond faster and more confidently in suspected medical emergencies such as:

cardiac arrest

stroke

other heart-related emergencies

person-down / collapse events

The system is intended to bridge the gap between:

the moment an emergency occurs, and

the moment trained responders arrive.

The project focuses on guiding bystanders through structured emergency-response steps in real time using XR, computer vision, and interactive assistance.

Problem Statement

In public medical emergencies, bystanders often fail to act quickly because they are unsure what is happening and do not know what steps to take. Situations involving possible cardiac arrest, stroke, or other heart-related emergencies are highly time-sensitive, yet most people are not trained or confident enough to respond effectively under pressure. This delay in recognition and action can significantly worsen outcomes for the victim.

Current public emergency systems are mainly designed to contact help, not to guide bystanders through immediate life-saving actions. As a result, there is a gap between the moment an emergency occurs and the moment trained responders arrive. This project seeks to address that gap by creating an XR-guided system that helps bystanders recognize likely emergency scenarios and follow the correct response steps in real time.

Background

Cardiac arrest and stroke are both medical emergencies where early recognition and rapid intervention are critical. In many public settings, the first person available to help is not a medical professional but an ordinary bystander. Even when emergency call systems are available, bystanders may hesitate because they are afraid of making mistakes or do not know whether CPR, stroke recognition, or another response is appropriate.

At the same time, technologies such as extended reality (XR), computer vision, and interactive guidance systems have become more accessible and capable. These technologies make it possible to create tools that do more than simply alert authorities—they can actively assist a user during a crisis. Rather than replacing medical judgment, an XR system can support a bystander with structured prompts, visual instructions, and guided decision flows. This project builds on that opportunity by proposing a station-based XR response system that can help users take faster, more informed action in emergency situations.

Product Vision

RescueSight should function as an assistive emergency guidance system, not as an autonomous medical decision-maker.

The core vision is:

recognize a likely emergency event, such as a collapse or person-down scenario

guide a bystander through a structured emergency checklist

route the bystander into the correct response flow

provide visual and audio support for CPR and related actions

reduce hesitation, confusion, and delay

The ideal user experience is:

a bystander encounters an emergency

RescueSight is activated manually or by event detection

the system asks a short series of guided questions

the system identifies the likely response pathway

the system overlays real-time instructions for action

Critical Product Positioning
What the project should say

RescueSight:

detects possible emergency scenarios

supports bystander triage

guides evidence-based response steps

assists with CPR workflow and emergency escalation

helps recognize possible stroke or heart-related emergencies

What the project should not say

RescueSight should not claim to:

diagnose heart attack

diagnose stroke

diagnose cardiac arrest from video alone

replace EMTs, paramedics, nurses, or physicians

provide guaranteed medical accuracy

function as an approved medical device unless that is actually achieved later

Preferred wording

Use phrases like:

“possible cardiac arrest”

“suspected stroke”

“possible heart-related emergency”

“collapse detection”

“guided emergency response”

“bystander assistance”

“decision-support workflow”

Avoid phrases like:

“the system determines if the person is having a heart attack”

“the model diagnoses stroke”

“AI detects cardiac arrest with certainty”

Primary Use Case

The main use case is a public emergency assistance station similar in spirit to a blue-light emergency tower.

A bystander uses XR glasses or a comparable interface to receive help in responding to someone who may have collapsed or become critically ill.

Example flow

Possible collapse or emergency is noticed

User activates RescueSight

System begins checklist:

Is the person responsive?

Are they breathing normally?

Are there signs of stroke?

Are there signs of a heart-related emergency?

System routes the user to the best matching protocol

XR overlays provide guidance such as:

where to place hands for CPR

compression rhythm cues

prompts to retrieve/use AED

prompts to call emergency services

prompts to note stroke symptom onset time

Scope
In scope

Agents should treat the following as core scope:

XR-guided emergency assistance

bystander-facing emergency checklist flow

suspected collapse / person-down detection

CPR guidance overlays

hand placement guidance

compression rhythm guidance

stroke screening support

heart-emergency warning-sign workflow

public-station deployment concept

website or presentation layer if needed for demo

RAG/AI assistant support for emergency instruction retrieval if kept within safe constraints

MCP server or tool orchestration layer if needed to power internal components

Out of scope for now

Unless explicitly expanded later, the following are out of scope:

full medical diagnosis

FDA-grade claims

production-grade emergency dispatch integration

guaranteed auto-calling 911 or emergency services in real deployment

clinically validated CPR depth/force estimation

fully autonomous scene interpretation without user confirmation

replacing professional medical care

legal/compliance completion for medical-device deployment

Key Facts and Motivation

These facts support the urgency and market framing of the project.

EMS response timing

California: about 17.85 minutes average

Wyoming: about 17.54 minutes

North Dakota: about 14.36 minutes

South Dakota: about 13.92 minutes

Oklahoma: about 13.68 minutes

Montana: about 13.59 minutes

West Virginia: about 13.20 minutes

NYC average EMS response time: about 11 minutes and increasing

Time sensitivity in cardiac arrest

1–4 minutes: brain cells begin to experience oxygen deprivation; CPR can still help prevent permanent damage

4–6 minutes: risk of permanent brain injury becomes significant without CPR or defibrillation

6–10 minutes: severe brain damage or death becomes likely without CPR

10+ minutes: survival chances drop dramatically unless high-quality CPR has been ongoing

Compression rate and survival relevance

100–120 compressions/minute: best survival and ROSC outcomes

below 80/minute: significantly worse outcomes

above 140/minute: outcomes worsen because compressions often become too shallow

These facts justify focusing on:

rapid bystander action

immediate checklists

CPR rhythm guidance

crowded urban areas with slower response times

Market Framing
Total Accessible Market

emergency response services globally

public and private building owners/operators

Serviceable Accessible Market

emergency response settings in areas with congested traffic or slow response times

crowded public environments

Serviceable Obtainable Market

emergency response use cases in New York City

This market framing should guide pitches, demos, and potential deployment scenarios.

Core Functional Goals

Agents should align implementation with these functional goals:

1. Emergency recognition

The system should identify a likely emergency context such as:

collapse

person-down event

apparent unresponsiveness

user-initiated emergency mode

2. Guided triage

The system should ask a short, structured set of questions to distinguish between:

possible cardiac arrest

possible stroke

possible heart-related emergency

unclear emergency requiring EMS escalation

3. CPR guidance

The system should provide:

chest/hand placement guidance

compression rhythm guidance

clear step-by-step prompts

cues to continue until help arrives or AED is available

4. Stroke workflow support

The system should help a bystander check for:

face drooping

arm weakness

speech difficulty

symptom onset time

5. Escalation support

The system should encourage or assist:

calling emergency services

retrieving an AED

preserving timing/context for responders

Current Task List

These tasks were provided and should be treated as active exploration areas:

figure out how to do overlay on VR goggles with CV

identify where the user should place their hands on the patient

when the user’s hand is placed correctly, initiate the CPR rhythm-tracking component

build a CV model to recognize the location of the heart

build an AI RAG agent for medical emergency help

build or integrate an MCP server for tools

explore automatically calling emergency service

build a website for demo or presentation purposes

Agents may refine these tasks into smaller engineering work items, but they should preserve their intent.

Design Principles
1. Safety over novelty

If there is tension between a flashy demo and a medically safer workflow, prefer the safer workflow.

2. Assistive, not diagnostic

Always implement the system as a guidance tool, not a definitive diagnosis engine.

3. Fast interaction

In emergencies, users should not need to navigate complex menus or read long text blocks.

4. Clear branching logic

The bystander flow should be obvious, simple, and stress-tolerant.

5. Human confirmation matters

Computer vision and AI may suggest a pathway, but the user should confirm critical steps.

6. Demo realism

Hackathon/demo features are acceptable, but they should be labeled honestly if not clinically validated.

7. Modular implementation

Keep computer vision, XR overlay logic, question flow, RAG assistance, and tool orchestration modular so they can evolve independently.

Guidance for Agents

When contributing to this repository, agents should:

preserve the project’s framing as an emergency-guidance tool

avoid introducing misleading medical claims into code, docs, demos, or UI

prefer explicit user flows over magical automation

document assumptions clearly

keep architecture details in the README or dedicated technical docs, not here

treat safety language as part of the product spec

build toward a believable demo, even if the full production vision is broader

Agents should avoid

writing copy that implies medical certainty

overpromising on CV capabilities

presenting unvalidated measurements as medically reliable

tightly coupling architecture decisions to product messaging in this file

Suggested Terminology

Preferred terms:

suspected emergency

possible cardiac arrest

possible stroke

possible heart-related emergency

emergency guidance

bystander support

collapse detection

response workflow

triage checklist

CPR assistance

Terms to avoid unless strongly qualified:

diagnosis

confirmed heart attack

confirmed stroke

automatic cardiac arrest identification

medically accurate force measurement

autonomous emergency intervention

Non-Goals

This file is not intended to define:

exact software architecture

exact code structure

repo layout

infrastructure setup

framework choice

deployment workflow

hardware procurement details

Those belong elsewhere.

Deliverable Standard

Contributions should move the repository toward a demoable prototype that can convincingly show:

a bystander emergency workflow

XR or visual guidance

a triage/checklist engine

CPR-related assistance

a coherent product story for RescueSight

Every change should make the project either:

safer,

clearer,

more technically feasible,

or more demo-ready.

Short Summary for Agents

RescueSight is an XR-based bystander emergency guidance system for public settings. It is meant to help users respond to suspected cardiac arrest, stroke, and related emergencies through guided checklists and CPR assistance. It should be built and described as an assistive response tool, not a diagnostic medical device.

Current Execution Plan Update (2026-03-07)

Primary near-term product flow:

1. CV classifies whether a person is possibly down (lying/collapsed context).
2. Frontend consumes a live CV summary stream from camera signals (or live feed when feasible) instead of manual CV metric entry.
3. If confidence is high enough, require a short human-in-the-loop questionnaire (pulse, breathing, responsiveness, major bleeding/trauma, notes).
4. Do not place real 911 calls from software.
5. Instead, send a backend escalation request to RescueSight dispatch APIs.
6. Show requests in a pseudo-hospital dashboard where a dispatcher can assign EMT units and update request status.
7. Include location context in escalation payloads (label + coordinates + optional indoor descriptor).

Implementation constraints for this flow:

- CV classification remains assistive; user confirmation is required before critical transitions.
- Language must remain non-diagnostic ("possible person-down", "suspected emergency").
- The backend dispatch workflow is a simulation and demo environment, not production emergency dispatch integration.
- Questionnaire UX should be explicitly separated from passive telemetry so users can clearly see when answer input is expected.
- Webcam/XR operator view should show explicit confirmation when dispatch request handoff to dashboard succeeds or fails.

Current Execution Plan Update (2026-03-08, revised)

Checklist ownership directive (webcam responder + dashboard dispatcher):

1. Use webcam runtime as the responder checklist surface:
   - snapshot
   - location
   - questionnaire (manual start via `h`, response via `y`/`n`)
2. Auto-submit to backend only after all three checklist items are complete.
3. Use web app as dispatcher review/decision surface:
   - review submitted snapshot/location/questionnaire
   - generate SOAP report on demand
   - dispatch to hospital workflow or reject request
4. Keep Python CV runtime streaming live summary data to API in parallel for dashboard awareness.

Implementation constraints for this revised flow:

- Do not auto-generate SOAP at questionnaire submission time by default; generation is dispatcher controlled.
- Dispatch lifecycle must support explicit rejection state in queue and filtering.
- Webcam overlay should explicitly show checklist completion state and successful dashboard handoff.
- API remains the single source of truth for live summary and dispatch state.
- Safety language constraints remain unchanged: assistive only, non-diagnostic wording, no real 911 calling.

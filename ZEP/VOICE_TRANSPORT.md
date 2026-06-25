# Voice Transport Decision

## Selected Stack

```text
Pipecat 1.4.0
Deepgram STT -> OpenAI LLM -> Cartesia TTS
Transport: SmallWebRTC
```

## Why SmallWebRTC Fits This Use Case

SmallWebRTC is Pipecat's free, self-hosted WebRTC transport. It moves live
browser audio to the Pipecat worker and sends synthesized audio back to the user
without requiring a third-party transport provider.

This fits the current Conduence stage because we want to validate the voice
agent using the open-source Pipecat stack first. We already pay for external AI
services like Deepgram, OpenAI, and Cartesia; using SmallWebRTC avoids adding a
separate transport account while we are still testing the product loop.

For v1, the priority is validating the trader cognition workflow:

- Does voice input become accurate memory?
- Does the assistant reason against Zep graph context?
- Does the user experience feel fast enough?
- Does interruption and turn-taking work naturally?

SmallWebRTC lets us test those questions locally or in a self-hosted
environment while keeping the transport layer free.

## Decision

Use SmallWebRTC for the first working voice-agent version because it is free,
self-hosted, and part of the Pipecat ecosystem.

Keep the Pipecat pipeline transport-agnostic so the application code stays
focused on voice cognition rather than provider-specific room management.

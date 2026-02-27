# Graveyard Hack Form Draft (GraveShift)

Use this to paste directly into the Typeform:

- https://solanafoundation.typeform.com/graveyardhack

Deadline reminder: **February 27, 2026 at 11:59 PM UTC**.

## 1) Project Name

GraveShift

## 2) One-Line Description

GraveShift lets users discover dead EVM assets, prove ownership, and resurrect them on Solana devnet through a Blink-powered on-chain migration record.

## 3) GitHub Repo

https://github.com/Arpit-Khandelwal/graveshift

## 4) Demo / Pitch Video

[PASTE VIDEO LINK]

## 5) Optional Relevant Links

- Deployed app: https://frontend-rouge-nine-x2ff5arx1n.vercel.app
- Blink endpoint: https://frontend-rouge-nine-x2ff5arx1n.vercel.app/api/actions/resurrect
- Dialect Blink tester: https://dial.to/developer?url=https://frontend-rouge-nine-x2ff5arx1n.vercel.app/api/actions/resurrect&cluster=devnet
- X handle: [OPTIONAL]
- Artwork: [OPTIONAL]

## 6) Sponsors You Are Applying For

- Main track
- Dialect (Blinks / Solana Actions)

If you want, add/remove sponsors based on the official list in the form.

## 7) What Is Next On Your Roadmap

- Add a full "resurrection output" flow (mint claim badge / NFT after migration completion).
- Improve dead-asset scoring with more signals and chain support.
- Add historical proof and indexing for migrated assets.
- Add production-grade rate limiting, observability, and retries for external APIs.
- Expand from devnet to mainnet-safe release flow with stronger verification policies.

## 8) Longer Description (Including Sponsor Usage)

GraveShift is a cross-chain asset resurrection experience. A user connects an EVM wallet, scans for "dead" holdings, verifies ownership, signs an EVM proof message, and submits a Solana transaction that writes a migration record on devnet.

Current flow:
- Scans wallet holdings and identifies likely dead assets (Ethereum ERC-20 + Polygon ERC-1155).
- Supports manual or auto-selected asset input from scan results.
- Verifies ownership on the source chain:
  - ERC-20 balance checks
  - ERC-721 owner checks
  - ERC-1155 balance checks (with Polygon fallback query path)
- Generates deterministic proof messages and validates EVM signatures server-side.
- Builds a real Solana transaction to call the Anchor program:
  - `initialize_migration`
  - `complete_migration`
  - memo with asset key trace
- Prevents duplicate resurrection records for the same user+asset.

Sponsor usage:
- Dialect Blinks / Solana Actions:
  - Implemented Blink metadata and transaction endpoints with `@solana/actions`.
  - Added `actions.json` rules and Blink-compliant action headers for devnet.
  - Transaction is fully functional and signs/sends via wallet flow (no mock transaction path).

Tech highlights:
- Solana program (Anchor) stores migration state (`Initiated` -> `Completed`) in PDA records.
- Next.js frontend + API routes power the full verification and transaction lifecycle.
- Viem-based EVM reads for source-chain ownership checks.
- Multi-source dead-asset scanning and scoring logic.

## 9) Telegram Handle

[PASTE TELEGRAM HANDLE]

## Final Pre-Submit Checklist

- [ ] Repo is public and will stay public until March 5
- [ ] Video link works without permission issues
- [ ] Sponsor selections match your target bounties
- [ ] Telegram handle is correct
- [ ] Submitted exactly once

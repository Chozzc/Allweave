# Allweave

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Creators and small teams who need to assemble reusable multimodal AI workflows and demonstrate them from a browser without installing a desktop app or creating an account.

## Product Purpose

Allweave is a browser-first visual workspace for connecting prompts, media, models, and reusable workflow steps on an infinite canvas. The immediate success condition is a public demo that opens directly, preserves each visitor's work locally, and can be extended with vertical workflow templates later.

## Positioning

The product is a general creation canvas rather than an advertising-only tool. Vertical workflows are reusable starting points, not the product's identity.

## Operating Context

The first release is evaluated as a public web demo. Visitors can explore the bundled example, edit the canvas, save multiple workflows in their own browser, and import or export workflow JSON.

## Capabilities and Constraints

- No login, billing, credits, or cloud database in the first release.
- Canvas drafts and saved workflows live in browser IndexedDB.
- A public Vercel deployment cannot run the original dynamic Python plugin process. Online execution will be added per selected workflow through deployable TypeScript endpoints or a separate worker.
- The homepage and conversational agent are intentionally deferred.
- Existing canvas interaction and plugin-compatible workflow format must remain intact.

## Brand Commitments

The working product name is **Allweave**. The identity must feel general-purpose and support text, image, audio, video, 3D, and future workflow types without privileging advertising.

## Evidence on Hand

- Existing infinite-canvas editor and bundled example workflow.
- Existing workflow import/export format and plugin ABI.
- No approved customer claims, benchmarks, pricing, or testimonials.

## Product Principles

- Open the demo before asking for anything.
- Keep each visitor's work private to their browser by default.
- Reuse the existing canvas and workflow format.
- Ship a small working path before expanding the platform.
- Treat vertical workflows as templates, not product boundaries.

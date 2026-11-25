# Smart Buy stalled retry guard

## Root cause and scope

- The live Smart Buy consumer uses a batch-level fallback that calls `message.retry({delaySeconds:60})` without checking `message.attempts`.
- Ordinary `failContext` retryable failures already cap at 5, but an unexpected batch failure bypasses that cap.
- The frontend `waitForSmartBuy` loop has no waiting deadline if a job stays `retrying`.

## Fixes

- The frontend now caps polling at 20 minutes or 8 minutes without a status update. It displays the latest retry error, and explicitly notes the backend job might continue after the browser gives up.
- A deployable patched consumer file is available in this branch at `deploy/FrameAnalytics_SmartBuy_Worker_v1.2.10_retry_guard.js`.
- The consumer rejects deliveries after 5 attempts or jobs older than 30 minutes, preserving the R2 job record as failed.
- Unexpected batch errors now retry with backoff and cap at 5 attempts, recording a terminal error when possible.
- This is a safety fix, not proof that HTTP 429 or the gateway outage is resolved.
- Never clear the queue or re-run Smart Buy automatically merely to test this patch.

## Deploy safety

The consumer source file is a standalone Cloudflare Worker copied from an existing deployed 1.2.9 export, not the repository's `worker/index.ts` site Worker. Deploy its code ONLY in `frameanalytics-smartbuy-test`, after saving the current Worker version. Do not edit the API Worker, D1, gateway secrets, or R2 buckets. Existing service bindings, secrets and queue consumer bindings must remain intact.

Before deploying, retrieve the current consumer status and last job error (status endpoint) to identify whether failures arise from WFM 429, tunnel offline, queues, R2 contention, or another cause. After deploying, try only one new Smart Buy run once the relevant cooldown ends.

## Known limitation

If all R2 writes fail persistently, even the terminal status may not be saved; browser timeout still ends local polling. The queue delivery will be acknowledged after 5 attempts to avoid unlimited traffic.

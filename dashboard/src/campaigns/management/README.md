# Local campaign management

The shared store persists under `tourism-campaign-manager-v1`. Overview transfers its displayed `CampaignRecommendation` and optional live creative reasoning using `receive`. Its stable campaign ID prevents duplicate transfers. A content fingerprint preserves local post edits and status on repeated unchanged transfers. Transferring a different creative for that identity replaces its posts and resets approval.

`ManagedPost` contains publishing integration fields, including stable IDs, the selected asset ID/path, localized content, targeting, a proposed RFC3339 timestamp and the `Europe/Vienna` timezone. `schedulingStatus` distinguishes proposed times from scheduled times. Asset IDs resolve to current build paths when rendered.

Approval and scheduling are separate local transitions. Copy changes invalidate approval for the campaign; date-only changes preserve approval and reschedule immediately. Calendar grouping uses the Vienna calendar day, including daylight-saving changes. These controls never send posts to an external service. A future backend can replace the store adapter without changing these models or the Overview transfer.

Four stable demo campaigns are seeded when storage is absent or malformed. Clear this localStorage key to reset them. Browser storage is per origin/profile, not shared across users or devices.

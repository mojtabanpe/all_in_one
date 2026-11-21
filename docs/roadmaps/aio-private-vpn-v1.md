# Private VPN

An optional VPN benefit for paid customers selected by an admin. Telegram is the only customer entry
point. The previous manual VLESS test confirmed the Iran–foreign tunnel.

| Checkpoint                               | Status      | Evidence                                                                                                                                                                              |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent runtime and 3x-ui management | DONE        | `apps/vpn` builds independently. A local HTTP smoke test against a mock panel verified auth, quota, renewal and revocation.                                                           |
| Admin eligibility, billing and Telegram  | DONE        | The admin Users table and API require an active purchase before saving the invitation. Admin and API builds passed. Unit tests cover linking, menu eligibility, renewals and refunds. |
| Production activation                    | IN_PROGRESS | Independent GitHub Actions workflow and production configuration prepared. Verify the runner health check and application activation.                                                 |

## Service configuration

On production, GitHub Actions **Deploy VPN** builds the standalone image and starts a dedicated
Compose project on the `aio` runner. The service listens on loopback on `flashcard`; it manages
3x-ui on `vpn` over HTTPS. See the production environment for the service and panel secrets.
The main **Deploy** workflow supplies the service token to each new API release.

Build with Node 24 and `pnpm nx run vpn:prune`. Run `node main.js` from the generated
`dist/apps/vpn` artifact after installing its runtime dependencies from the pruned lockfile.
The service defaults to listening on `127.0.0.1:4390`. Use a private HTTPS endpoint or forward
the loopback listener privately between the servers. The health path is `GET /health`.

| Variable               | Process            | Value                                                                     |
| ---------------------- | ------------------ | ------------------------------------------------------------------------- |
| `VPN_SERVICE_TOKEN`    | Both               | The same randomly generated secret, at least 24 characters.               |
| `VPN_SERVICE_URL`      | Poshtetgarm API    | The private HTTPS endpoint or loopback forward to the standalone process. |
| `VPN_HOST`, `VPN_PORT` | Standalone service | Optional listener settings.                                               |
| `VPN_PANEL_URL`        | Standalone service | HTTPS origin plus the 3x-ui panel base path.                              |
| `VPN_PANEL_TOKEN`      | Standalone service | A 3x-ui token with permissions to manage clients on the chosen panel.     |
| `VPN_INBOUND_ID`       | Standalone service | The VLESS inbound receiving tunneled traffic.                             |
| `VPN_CLIENT_ENDPOINT`  | Standalone service | The Iran-side tunnel origin, written as `https://<host>:<port>`.          |

## Quota and revocation

A continuous subscription adds 50 GiB per settled month. A full refund removes the refunded
order's quota. The app combines the actual paid expiry with its payment history. An expired
subscription or a removed invitation is reconciled to disabled access. After a lapse a new
purchase requires a fresh invitation and starts a fresh volume allowance using the existing
client's current usage as a baseline. Early renewal preserves the invitation. Retries resubmit the same absolute quota without resetting counters. The bot obtains
the link when the customer asks for it. Previously delivered VLESS links are bearer credentials.

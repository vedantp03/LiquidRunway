# Security

## Secrets

Never commit:

- `.env` (Circle API key, entity secret, wallet IDs)
- `recovery/*.dat` (entity-secret recovery file — the only way to reset signing keys)
- Deployer private keys

Use `.env.example` as a template. Keep recovery files in a password manager / offline backup, not in git.

## If a secret was exposed

1. Rotate the Circle API key in [console.circle.com](https://console.circle.com).
2. Rotate / re-register the entity secret (see Circle docs on entity secret management) and update `CIRCLE_ENTITY_SECRET` locally.
3. Treat any committed recovery file as compromised even after it is removed from the latest commit — git history may still contain it until history is rewritten.

## Testnet scope

This MVP runs on **Arc Testnet** only. Do not fund production keys or mainnet USDC with these credentials.

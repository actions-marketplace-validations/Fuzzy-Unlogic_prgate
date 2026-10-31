# Changelog

## 1.1.0

### Security
- On `pull_request` events the guardrails config is now loaded from the PR base sha through the GitHub API instead of the checked-out tree, closing a self-bypass where a PR could empty `protected` in its own config. An `actions/checkout` step is no longer required.

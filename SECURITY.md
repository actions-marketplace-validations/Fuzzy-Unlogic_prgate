# Security Policy

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 5.1.x   | :white_check_mark: |
| 5.0.x   | :x:                |
| 4.0.x   | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability

Use this section to tell people how to report a vulnerability.

Tell them where to go, how often they can expect to get an update on a
reported vulnerability, what to expect if the vulnerability is accepted or
declined, etc.

## Threat model: config self-bypass

PR Gate's rules live in `guardrails.prgate.json`. If the gate read that file from the PR's
own checked-out tree, a PR could set `protected` to `[]` in the same change that edits
workflows, lint config, or `tsconfig.json`. Only the config file itself is guarded
implicitly, so the sibling edits would be matched against the emptied globs and pass.

Mitigation (since 1.1.0): on `pull_request` events the config is fetched through the GitHub
API at the PR's base sha (`pull_request.base.sha`) and never from the PR-controlled tree. A
PR is always judged by the rules that existed before it. Changes to the config itself are
still flagged by the implicit guard. If the config does not exist at the base sha, the gate
passes silently.

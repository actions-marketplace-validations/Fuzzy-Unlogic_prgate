import { describe, expect, it, vi } from 'vitest';
import { ConfigError, loadConfigFromRef, parseConfig } from '../src/config';
import { matchProtected, withImplicitProtection } from '../src/match';

describe('parseConfig', () => {
  it('parses a full valid config', () => {
    const { config, warnings } = parseConfig(
      JSON.stringify({
        guardrails: {
          protected: ['tests/**', '.eslintrc*'],
          source_of_truth: ['SPEC.md'],
          is_hard_blocker: true,
        },
      }),
    );
    expect(config).toEqual({
      protected: ['tests/**', '.eslintrc*'],
      source_of_truth: ['SPEC.md'],
      is_hard_blocker: true,
    });
    expect(warnings).toEqual([]);
  });

  it('defaults is_hard_blocker to false and arrays to empty', () => {
    const { config } = parseConfig(JSON.stringify({ guardrails: { protected: ['tests/**'] } }));
    expect(config.is_hard_blocker).toBe(false);
    expect(config.source_of_truth).toEqual([]);
  });

  it('allows an empty protected list (passes silently downstream)', () => {
    const { config } = parseConfig(JSON.stringify({ guardrails: { protected: [] } }));
    expect(config.protected).toEqual([]);
  });

  it('throws ConfigError on invalid JSON', () => {
    expect(() => parseConfig('{ not json')).toThrow(ConfigError);
  });

  it('throws when root is not an object', () => {
    expect(() => parseConfig('[]')).toThrow(ConfigError);
    expect(() => parseConfig('42')).toThrow(ConfigError);
  });

  it('throws when guardrails object is missing', () => {
    expect(() => parseConfig(JSON.stringify({ nope: true }))).toThrow(ConfigError);
  });

  it('throws when protected is not an array of strings', () => {
    expect(() => parseConfig(JSON.stringify({ guardrails: { protected: 'tests/**' } }))).toThrow(
      ConfigError,
    );
    expect(() => parseConfig(JSON.stringify({ guardrails: { protected: ['ok', 123] } }))).toThrow(
      ConfigError,
    );
  });

  it('throws when is_hard_blocker is not a boolean', () => {
    expect(() =>
      parseConfig(JSON.stringify({ guardrails: { protected: [], is_hard_blocker: 'yes' } })),
    ).toThrow(ConfigError);
  });

  it('warns (does not throw) on unknown top-level keys', () => {
    const { warnings } = parseConfig(
      JSON.stringify({ guardrails: { protected: [] }, extra: true }),
    );
    expect(warnings.some((w) => w.includes('extra'))).toBe(true);
  });

  it('does not warn on a top-level $schema pointer', () => {
    const { warnings } = parseConfig(
      JSON.stringify({ $schema: './schema/guardrails.schema.json', guardrails: { protected: [] } }),
    );
    expect(warnings).toHaveLength(0);
  });

  it('warns on unknown keys inside guardrails', () => {
    const { warnings } = parseConfig(JSON.stringify({ guardrails: { protected: [], mystery: 1 } }));
    expect(warnings.some((w) => w.includes('guardrails.mystery'))).toBe(true);
  });
});

const source = { owner: 'o', repo: 'r', path: 'guardrails.prgate.json', ref: 'basesha' };

function fileResponse(text: string) {
  return {
    data: { type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64') },
  };
}

function clientReturning(getContent: (params: typeof source) => Promise<{ data: unknown }>) {
  return { rest: { repos: { getContent } } };
}

describe('loadConfigFromRef', () => {
  it('requests the file at the given ref and parses the decoded content', async () => {
    const getContent = vi
      .fn()
      .mockResolvedValue(fileResponse(JSON.stringify({ guardrails: { protected: ['tests/**'] } })));
    const result = await loadConfigFromRef(clientReturning(getContent), source);
    expect(getContent).toHaveBeenCalledWith(source);
    expect(result?.config.protected).toEqual(['tests/**']);
  });

  it('returns null when the file is absent at the ref (404)', async () => {
    const getContent = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    expect(await loadConfigFromRef(clientReturning(getContent), source)).toBeNull();
  });

  it('throws ConfigError on non-404 API errors', async () => {
    const getContent = vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    await expect(loadConfigFromRef(clientReturning(getContent), source)).rejects.toThrow(
      ConfigError,
    );
  });

  it('throws ConfigError when the path is a directory', async () => {
    const getContent = vi.fn().mockResolvedValue({ data: [{ type: 'file' }] });
    await expect(loadConfigFromRef(clientReturning(getContent), source)).rejects.toThrow(
      ConfigError,
    );
  });

  it('judges a PR by the base config even when the PR empties its own protected list', async () => {
    const baseConfig = JSON.stringify({ guardrails: { protected: ['.github/workflows/**'] } });
    const getContent = vi.fn().mockResolvedValue(fileResponse(baseConfig));
    const loaded = await loadConfigFromRef(clientReturning(getContent), source);
    expect(getContent).toHaveBeenCalledWith(expect.objectContaining({ ref: 'basesha' }));
    const globs = withImplicitProtection(loaded?.config.protected ?? [], source.path);
    const matched = matchProtected(
      [
        { path: 'guardrails.prgate.json', status: 'MODIFIED' },
        { path: '.github/workflows/ci.yml', status: 'MODIFIED' },
      ],
      globs,
    );
    expect(matched.map((m) => m.path)).toEqual([
      'guardrails.prgate.json',
      '.github/workflows/ci.yml',
    ]);
  });
});

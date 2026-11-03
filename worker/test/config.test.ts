import { describe, expect, it } from 'vitest';
import wranglerText from '../wrangler.jsonc?raw';

const config = JSON.parse(wranglerText.replace(/^\s*\/\/.*$/gm, '')) as Record<string, any>;

describe('wrangler.jsonc', () => {
  it('switches off every kind of logging', () => {
    expect(config.observability).toEqual({ enabled: false, logs: { enabled: false } });
    expect(config.logpush).toBe(false);
    expect(config.tail_consumers).toBeUndefined();
  });

  it('starts on devnet', () => {
    expect(config.vars.CLUSTER).toBe('devnet');
  });

  it('keeps the production name out of reach of a plain wrangler deploy', () => {
    expect(config.name).not.toBe(config.env.production.name);
    expect(config.workers_dev).toBe(false);
  });

  it('deploys staging on devnet and production on mainnet, each with its own origins and limits', () => {
    const { staging, production } = config.env;
    expect(staging.vars).toEqual({ CLUSTER: 'devnet', ALLOWED_ORIGINS: 'https://devnet.sollock.io' });
    expect(production.vars).toEqual({ CLUSTER: 'mainnet', ALLOWED_ORIGINS: 'https://sollock.io,https://www.sollock.io' });
    for (const env of [staging, production]) {
      expect(env.workers_dev).toBe(false);
      for (const key of ['observability', 'logpush', 'tail_consumers', 'd1_databases', 'kv_namespaces', 'r2_buckets']) {
        expect(env[key], key).toBeUndefined();
      }
    }
  });

  it('keeps no storage bindings', () => {
    for (const key of ['d1_databases', 'kv_namespaces', 'r2_buckets', 'durable_objects', 'analytics_engine_datasets', 'queues']) {
      expect(config[key], key).toBeUndefined();
    }
  });

  it('holds no secrets', () => {
    expect(wranglerText).not.toMatch(/api-key=|HELIUS_API_KEY"\s*:/);
  });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

export function strictResponseSchema(value) {
  if (Array.isArray(value)) return value.map(strictResponseSchema);
  if (!value || typeof value !== 'object') return value;

  if (Array.isArray(value.allOf)) {
    const branches = value.allOf.map(strictResponseSchema);
    if (
      branches.every(
        (branch) =>
          branch &&
          typeof branch === 'object' &&
          (branch.type === 'object' || branch.properties),
      )
    ) {
      const { allOf: _allOf, ...outer } = value;
      value = {
        ...branches.reduce(
          (combined, branch) => ({
            ...combined,
            ...branch,
            properties: {
              ...(combined.properties ?? {}),
              ...(branch.properties ?? {}),
            },
            required: [
              ...new Set([
                ...(combined.required ?? []),
                ...(branch.required ?? []),
              ]),
            ],
          }),
          {},
        ),
        ...outer,
      };
    } else {
      value = { ...value, allOf: branches };
    }
  }

  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === 'allOf' ? item : strictResponseSchema(item),
    ]),
  );
  if (
    (normalized.type === 'object' || normalized.properties) &&
    normalized.additionalProperties === undefined
  ) {
    normalized.additionalProperties = false;
  }
  return normalized;
}

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (api) {
  const document = parse(
    readFileSync(
      process.env.ACCEPTANCE_OPENAPI_PATH ??
        resolve(process.cwd(), '../api/openapi.yaml'),
      'utf8',
    ),
  );
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    multipleOfPrecision: 2,
  });
  addFormats(ajv);
  const originalFetch = globalThis.fetch;
  const validators = new Map();
  const base = new URL(api);

  function pointer(ref) {
    return ref
      .slice(2)
      .split('/')
      .reduce(
        (value, part) =>
          value[part.replaceAll('~1', '/').replaceAll('~0', '~')],
        document,
      );
  }

  function dereference(value, seen = new Set()) {
    if (Array.isArray(value))
      return value.map((item) => dereference(item, seen));
    if (!value || typeof value !== 'object') return value;
    if (typeof value.$ref === 'string' && value.$ref.startsWith('#/')) {
      if (seen.has(value.$ref)) return {};
      const nextSeen = new Set(seen).add(value.$ref);
      return dereference(pointer(value.$ref), nextSeen);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        dereference(item, seen),
      ]),
    );
  }

  function operationFor(url, method) {
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      return undefined;
    }
    const path = url.pathname.slice(base.pathname.length) || '/';
    for (const [template, pathItem] of Object.entries(document.paths)) {
      const pattern = new RegExp(
        `^${template
          .split('/')
          .map((part) =>
            part.startsWith('{')
              ? '[^/]+'
              : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          )
          .join('/')}$`,
      );
      if (pattern.test(path) && pathItem[method.toLowerCase()]) {
        return { operation: pathItem[method.toLowerCase()], template };
      }
    }
    throw new Error(`OpenAPI has no operation for ${method} ${path}`);
  }

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? input);
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const match = operationFor(url, method);
    const response = await originalFetch(input, init);
    if (!match) return response;

    const declared =
      match.operation.responses[String(response.status)] ??
      match.operation.responses.default;
    assert.ok(
      declared,
      `OpenAPI response status mismatch: ${method} ${match.template} returned undocumented ${response.status}`,
    );
    const resolvedResponse = dereference(declared);
    const mediaType = response.headers.get('content-type')?.split(';')[0];
    const schema = mediaType
      ? resolvedResponse.content?.[mediaType]?.schema
      : undefined;
    if (schema) {
      const key = `${method} ${match.template} ${response.status} ${mediaType}`;
      // An SSE response has no finite body to clone and validate. Reaching this
      // branch proves both its status and declared media type; individual event
      // payloads are asserted by the notification acceptance test itself.
      if (mediaType === 'text/event-stream') return response;
      if (schema.type === 'string' && schema.format === 'binary') {
        const bytes = await response.clone().arrayBuffer();
        assert.ok(
          bytes.byteLength > 0,
          `OpenAPI binary response is empty: ${key}`,
        );
        return response;
      }
      let validate = validators.get(key);
      if (!validate) {
        validate = ajv.compile(strictResponseSchema(dereference(schema)));
        validators.set(key, validate);
      }
      const payload =
        mediaType === 'application/json'
          ? await response.clone().json()
          : await response.clone().text();
      assert.ok(
        validate(payload),
        `OpenAPI response schema mismatch: ${key}: ${(validate.errors ?? [])
          .map(
            (error) =>
              `${error.instancePath || '/'} ${error.message ?? 'is invalid'}${
                error.keyword === 'additionalProperties'
                  ? ` (${error.params.additionalProperty})`
                  : ''
              }`,
          )
          .join('; ')}`,
      );
    } else if (response.status !== 204 && mediaType === 'application/json') {
      const text = await response.clone().text();
      assert.equal(
        text,
        '',
        `OpenAPI declares no JSON body for ${method} ${match.template} ${response.status}`,
      );
    }
    return response;
  };
}

import {z} from 'zod';

/** Values accepted by JSON-backed configuration, including optional in-memory fields. */
export type JsonValue = string | number | boolean | null | undefined | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.undefined(),
    z.array(jsonValueSchema),
    jsonObjectSchema,
  ]),
);

export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), jsonValueSchema);

const stringSchema = z.string();
const numberSchema = z.number();
const booleanSchema = z.boolean();
const functionSchema = z.function();
const systemErrorSchema = z.object({code: z.string().optional()});

export const isString = (value: unknown): value is string => stringSchema.safeParse(value).success;
export const isNumber = (value: unknown): value is number => numberSchema.safeParse(value).success;

export const isBoolean = (value: unknown): value is boolean =>
  booleanSchema.safeParse(value).success;

export const isRecord = (value: unknown): value is JsonObject =>
  jsonObjectSchema.safeParse(value).success;

export const isFunction = (value: unknown): value is Function =>
  functionSchema.safeParse(value).success;

/** Error objects are not JSON documents; decode only the optional system error code. */
export function errorCode(cause: unknown): string | undefined {
  const parsed = systemErrorSchema.safeParse(cause);

  return parsed.success ? parsed.data.code : undefined;
}

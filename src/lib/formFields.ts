/**
 * Normalized fields of a pending session form.
 *
 * The raw wire shape is the `FormField` union verified in
 * `node_modules/@opencode/client/dist/promise/generated/types.d.ts`:
 *   - `FormStringField`      (line 2169) — text, plus `options` for a closed choice
 *   - `FormNumberField`      (line 2135) — number
 *   - `FormIntegerField`     (line 2147) — integer
 *   - `FormBooleanField`     (line 2159) — yes/no
 *   - `FormMultiselectField` (line 2186) — closed multi choice (`options` required)
 *   - `FormExternalField`    — link out (`external`)
 * Every member carries `key`, optional `title`/`description`/`required`/`hidden`
 * and optional `when` (visibility conditions).
 *
 * The question dock renders these as native controls instead of a JSON paste,
 * so one closed union is derived here — pure, so it is unit-testable.
 */

/** One choice of a select/multiselect field (`FormOption`). */
export interface FormOption {
  value: string;
  label: string;
  description: string | null;
}

/** One answer value (`FormAnswerValue`: string | number | boolean | string[]). */
export type FormFieldValue = string | number | boolean | string[];

interface FormFieldBase {
  key: string;
  /** Visible label: the field's `title`, else its `key`. */
  label: string;
  description: string | null;
  required: boolean;
}

/** Text field; a closed choice when `options` is set. */
export interface FormTextField extends FormFieldBase {
  kind: "text";
  options: FormOption[] | null;
  default: string;
}

/** Numeric field (`number` or `integer`). */
export interface FormNumberField extends FormFieldBase {
  kind: "number";
  default: number | null;
}

/** Yes/No field. */
export interface FormBooleanField extends FormFieldBase {
  kind: "boolean";
  default: boolean;
}

/** Multi-choice field with at least one option. */
export interface FormMultiselectField extends FormFieldBase {
  kind: "multiselect";
  options: FormOption[];
}

/** Field that can only be answered on an external page. */
export interface FormExternalField extends FormFieldBase {
  kind: "external";
  url: string;
}

export type SessionFormField =
  | FormTextField
  | FormNumberField
  | FormBooleanField
  | FormMultiselectField
  | FormExternalField;

/** A `when` condition (`FormWhen`): evaluated against the current answers. */
interface FormWhen {
  key: string;
  op: "eq" | "neq";
  value: string | number | boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value: unknown = source[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}

function readOptions(value: unknown): FormOption[] {
  if (!Array.isArray(value)) return [];
  const options: FormOption[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const optionValue = readString(entry, ["value", "label", "id"]);
    if (optionValue === null) continue;
    options.push({
      value: optionValue,
      label: readString(entry, ["label", "title", "value"]) ?? optionValue,
      description: readString(entry, ["description"]),
    });
  }
  return options;
}

function readWhen(value: unknown): FormWhen[] {
  if (!Array.isArray(value)) return [];
  const conditions: FormWhen[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const key = readString(entry, ["key"]);
    const op = entry["op"];
    if (key === null || (op !== "eq" && op !== "neq")) continue;
    const raw: unknown = entry["value"];
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      conditions.push({ key, op, value: raw });
    }
  }
  return conditions;
}

function parseField(entry: unknown): SessionFormField | null {
  if (!isRecord(entry)) return null;
  const key = readString(entry, ["key", "id"]);
  if (key === null) return null;
  const label = readString(entry, ["title", "label", "key"]) ?? key;
  const base = {
    key,
    label,
    description: readString(entry, ["description"]),
    required: entry["required"] === true,
  };
  const type = readString(entry, ["type"]) ?? "string";
  switch (type) {
    case "string": {
      const options = readOptions(entry["options"]);
      return {
        ...base,
        kind: "text",
        options: options.length > 0 ? options : null,
        default: readString(entry, ["default"]) ?? "",
      };
    }
    case "number":
    case "integer": {
      const raw: unknown = entry["default"];
      const numeric = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      return { ...base, kind: "number", default: numeric };
    }
    case "boolean":
      return { ...base, kind: "boolean", default: entry["default"] === true };
    case "multiselect":
      return { ...base, kind: "multiselect", options: readOptions(entry["options"]) };
    case "external":
      return { ...base, kind: "external", url: readString(entry, ["url"]) ?? "" };
    default:
      // Unknown future type: rendered as plain text so the answer still works.
      return { ...base, kind: "text", options: null, default: "" };
  }
}

/** Parse a raw `FormInfo.fields` payload into renderable fields. */
export function extractFormFields(value: unknown): SessionFormField[] {
  if (!Array.isArray(value)) return [];
  const fields: SessionFormField[] = [];
  for (const entry of value) {
    const field = parseField(entry);
    if (field !== null) fields.push(field);
  }
  return fields;
}

/** Initial answer values for a parsed field list (defaults, never blanks). */
export function formFieldDefaults(fields: readonly SessionFormField[]): Record<string, FormFieldValue> {
  const values: Record<string, FormFieldValue> = {};
  for (const field of fields) {
    if (field.kind === "text" && field.default !== "") values[field.key] = field.default;
    if (field.kind === "number" && field.default !== null) values[field.key] = field.default;
    if (field.kind === "boolean" && field.default) values[field.key] = true;
    if (field.kind === "multiselect") values[field.key] = [];
  }
  return values;
}

/**
 * True when every `when` condition matches the current answers. A condition
 * list without entries is always visible.
 */
export function formFieldVisible(
  values: Readonly<Record<string, FormFieldValue>>,
  when: readonly FormWhen[],
): boolean {
  for (const condition of when) {
    const actual: FormFieldValue | undefined = values[condition.key];
    const matches =
      Array.isArray(actual) ? actual.includes(String(condition.value)) : actual === condition.value;
    if (condition.op === "eq" && !matches) return false;
    if (condition.op === "neq" && matches) return false;
  }
  return true;
}

/** Read the `when` conditions of a raw field (used with `formFieldVisible`). */
export function fieldWhen(entry: unknown): FormWhen[] {
  return isRecord(entry) ? readWhen(entry["when"]) : [];
}

/** True when a text entry counts as filled (blank text never answers a field). */
function textFilled(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Build the `FormAnswer` payload: one entry per *answered* field. Blank text of
 * optional fields is dropped (the server would only reject or ignore it), while
 * required fields keep their value even when empty so the server can answer
 * with its own validation message.
 */
export function formAnswerFromValues(
  fields: readonly SessionFormField[],
  values: Readonly<Record<string, FormFieldValue>>,
): Record<string, FormFieldValue> {
  const answer: Record<string, FormFieldValue> = {};
  for (const field of fields) {
    if (field.kind === "external") continue;
    const value: FormFieldValue | undefined = values[field.key];
    switch (field.kind) {
      case "text":
        if (textFilled(typeof value === "string" ? value : undefined) || (field.required && typeof value === "string")) {
          answer[field.key] = typeof value === "string" ? value : "";
        }
        break;
      case "number":
        if (typeof value === "number" && Number.isFinite(value)) answer[field.key] = value;
        else if (field.required) answer[field.key] = 0;
        break;
      case "boolean":
        if (value === true || (field.required && typeof value === "boolean")) {
          answer[field.key] = value === true;
        }
        break;
      case "multiselect":
        if (Array.isArray(value) && (value.length > 0 || field.required)) {
          answer[field.key] = value;
        }
        break;
    }
  }
  return answer;
}

/** True when a selected multiselect value is part of the current answer. */
export function multiselectHas(value: FormFieldValue | undefined, option: string): boolean {
  return Array.isArray(value) && value.includes(option);
}

/** Toggle one option of a multiselect answer (pure). */
export function toggleMultiselect(
  value: FormFieldValue | undefined,
  option: string,
): string[] {
  const current = Array.isArray(value) ? value : [];
  return current.includes(option)
    ? current.filter((entry) => entry !== option)
    : [...current, option];
}

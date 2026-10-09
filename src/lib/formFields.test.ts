import { describe, expect, it } from "vitest";
import {
  extractFormFields,
  formAnswerFromValues,
  formFieldDefaults,
  formFieldVisible,
  multiselectHas,
  toggleMultiselect,
  type FormFieldValue,
} from "./formFields.ts";

/** Raw wire shapes as the server sends them (`FormField` union). */
const rawFields = [
  {
    key: "freigabe",
    title: "Freigabe?",
    description: "Der Agent möchte eine Datei schreiben.",
    required: true,
    type: "string",
    options: [
      { value: "ja", label: "Ja, erlauben" },
      { value: "nein", label: "Nein, ablehnen", description: "Nur dieses Mal" },
    ],
  },
  { key: "betrag", title: "Betrag", type: "integer", default: 3 },
  { key: "vertraulich", title: "Vertraulich", type: "boolean", default: true },
  {
    key: "bereiche",
    title: "Bereiche",
    type: "multiselect",
    options: [
      { value: "web", label: "Web" },
      { value: "fs", label: "Dateisystem" },
    ],
  },
  { key: "notiz", title: "Notiz", type: "string", placeholder: "Freitext" },
  { key: "portal", title: "Portal", type: "external", url: "https://portal.example" },
  { key: "spacer", type: "text" },
];

describe("extractFormFields", () => {
  const fields = extractFormFields(rawFields);

  it("parses every known field type into one closed union", () => {
    expect(fields.map((field) => field.kind)).toEqual([
      "text",
      "number",
      "boolean",
      "multiselect",
      "text",
      "external",
      "text",
    ]);
    const choice = fields[0];
    expect(choice?.kind === "text" && choice.options).toEqual([
      { value: "ja", label: "Ja, erlauben", description: null },
      { value: "nein", label: "Nein, ablehnen", description: "Nur dieses Mal" },
    ]);
    expect(fields[0]?.label).toBe("Freigabe?");
    expect(fields[0]?.description).toBe("Der Agent möchte eine Datei schreiben.");
    expect(fields[0]?.required).toBe(true);
    // A missing `title` falls back to the key, an unknown type stays renderable.
    expect(fields[6]?.label).toBe("spacer");
    expect(fields[5]?.kind === "external" && fields[5].url).toBe("https://portal.example");
  });

  it("returns an empty list for non-arrays and skips malformed entries", () => {
    expect(extractFormFields(null)).toEqual([]);
    expect(extractFormFields({})).toEqual([]);
    expect(extractFormFields([null, 42, { type: "string" }])).toEqual([]);
  });

  it("keeps defaults of number and boolean fields", () => {
    const fields2 = extractFormFields(rawFields);
    expect(fields2[1]?.kind === "number" && fields2[1].default).toBe(3);
    expect(fields2[2]?.kind === "boolean" && fields2[2].default).toBe(true);
    expect(formFieldDefaults(fields2)).toEqual({ betrag: 3, vertraulich: true, bereiche: [] });
  });
});

describe("formAnswerFromValues", () => {
  const fields = extractFormFields(rawFields);

  it("answers one entry per filled field and drops blank optional text", () => {
    const answer = formAnswerFromValues(fields, {
      freigabe: "ja",
      betrag: 3,
      vertraulich: true,
      bereiche: ["web"],
      notiz: "   ",
    });
    expect(answer).toEqual({ freigabe: "ja", betrag: 3, vertraulich: true, bereiche: ["web"] });
  });

  it("keeps required-but-empty text so the server can validate it", () => {
    const answer = formAnswerFromValues(fields, { freigabe: "", vertraulich: false });
    expect(answer).toEqual({ freigabe: "" });
  });

  it("keeps an empty required multiselect and drops an optional empty one", () => {
    const requiredMulti = extractFormFields([
      { key: "bereiche", title: "Bereiche", type: "multiselect", required: true, options: [{ value: "web" }] },
    ]);
    expect(formAnswerFromValues(fields, { bereiche: [] })).toEqual({});
    expect(formAnswerFromValues(requiredMulti, { bereiche: [] })).toEqual({ bereiche: [] });
  });

  it("never answers an external field (it is a link, not a value)", () => {
    const answer = formAnswerFromValues(fields, { portal: "egal" });
    expect(answer).toEqual({});
  });

  it("survives foreign values of the wrong type", () => {
    const answer = formAnswerFromValues(fields, {
      freigabe: 12,
      betrag: "sieben",
      vertraulich: "ja",
      bereiche: "web",
    });
    expect(answer).toEqual({});
  });
});

describe("formFieldVisible", () => {
  it("hides a field whose eq condition does not match", () => {
    expect(formFieldVisible({ modus: "einfach" }, [{ key: "modus", op: "eq", value: "experte" }])).toBe(
      false,
    );
    expect(formFieldVisible({ modus: "experte" }, [{ key: "modus", op: "eq", value: "experte" }])).toBe(
      true,
    );
  });

  it("treats a neq condition as the inverse", () => {
    expect(formFieldVisible({ modus: "experte" }, [{ key: "modus", op: "neq", value: "experte" }])).toBe(
      false,
    );
    expect(formFieldVisible({ modus: "einfach" }, [{ key: "modus", op: "neq", value: "experte" }])).toBe(
      true,
    );
  });

  it("matches a multiselect answer against one of its values", () => {
    expect(formFieldVisible({ bereiche: ["web", "fs"] }, [{ key: "bereiche", op: "eq", value: "fs" }])).toBe(
      true,
    );
    expect(formFieldVisible({ bereiche: ["web"] }, [{ key: "bereiche", op: "eq", value: "fs" }])).toBe(
      false,
    );
  });

  it("shows a field without conditions", () => {
    expect(formFieldVisible({}, [])).toBe(true);
  });
});

describe("multiselect helpers", () => {
  it("detects a picked option", () => {
    expect(multiselectHas(["web"], "web")).toBe(true);
    expect(multiselectHas(["fs"], "web")).toBe(false);
    expect(multiselectHas(undefined, "web")).toBe(false);
  });

  it("toggles an option on and off", () => {
    const on: FormFieldValue = toggleMultiselect(undefined, "web");
    expect(on).toEqual(["web"]);
    const both = toggleMultiselect(on, "fs");
    expect(both).toEqual(["web", "fs"]);
    expect(multiselectHas(both, "fs")).toBe(true);
    expect(toggleMultiselect(both, "web")).toEqual(["fs"]);
  });

  it("treats a non-array value as an empty selection", () => {
    expect(toggleMultiselect("web", "fs")).toEqual(["fs"]);
  });
});

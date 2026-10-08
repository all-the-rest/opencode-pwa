import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Markdown from "./Markdown.tsx";

describe("Markdown", () => {
  it("renders bold, italic, inline code and links", () => {
    render(
      <Markdown text={"Hallo **fett** und *kursiv* mit `code` und [Link](https://a.example/x)."} />,
    );
    expect(screen.getByText("fett").tagName).toBe("STRONG");
    expect(screen.getByText("kursiv").tagName).toBe("EM");
    expect(screen.getByText("code").tagName).toBe("CODE");
    const link = screen.getByRole("link", { name: "Link" });
    expect(link).toHaveAttribute("href", "https://a.example/x");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders fenced code blocks, lists, headings and quotes", () => {
    render(
      <Markdown
        text={"# Titel\n\n- eins\n- zwei\n\n> Zitat\n\n```ts\nconst a = 1;\n```"}
      />,
    );
    expect(screen.getByText("Titel")).toBeVisible();
    expect(screen.getByText("eins")).toBeVisible();
    expect(screen.getByText("Zitat")).toBeVisible();
    expect(screen.getByText("const a = 1;")).toBeVisible();
  });

  it("renders GFM tables with alignment", () => {
    render(
      <Markdown
        text={"| Datei | + | - |\n| :--- | ---: | :---: |\n| a.ts | 12 | 3 |\n| b.ts | 30 | 5 |"}
      />,
    );
    const table = screen.getByRole("table");
    expect(table).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Datei" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "12" })).toBeVisible();
    const right = screen.getByRole("columnheader", { name: "+" });
    expect(right.getAttribute("style")).toContain("text-align: right");
    const center = screen.getByRole("columnheader", { name: "-" });
    expect(center.getAttribute("style")).toContain("text-align: center");
  });

  it("degrades a ragged table to text instead of crashing", () => {
    const { container } = render(<Markdown text={"| nur ein Kopf\n| noch eine Zeile ohne Separator"} />);
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("| nur ein Kopf");
  });

  it("renders ordered, nested and task lists plus strikethrough", () => {
    const { container } = render(
      <Markdown
        text={"1. erster\n2. zweiter\n   - verschachtelt\n3. dritter\n- [ ] offen\n- [x] erledigt\n~~alt~~"}
      />,
    );
    const lists = Array.from(container.querySelectorAll("ol, ul"));
    expect(lists[0]?.tagName).toBe("OL");
    expect(screen.getByText("verschachtelt")).toBeVisible();
    expect(screen.getByText("offen")).toBeVisible();
    expect(screen.getByText("erledigt")).toBeVisible();
    expect(screen.getByText("alt").tagName).toBe("DEL");
  });

  it("never injects HTML from the source", () => {
    const { container } = render(
      <Markdown text={'<img src="x" onerror="alert(1)"> und [böse](javascript:alert(1))'} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<img src="x"');
    expect(screen.queryByRole("link", { name: "böse" })).toBeNull();
  });
});

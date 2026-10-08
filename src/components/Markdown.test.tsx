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

  it("never injects HTML from the source", () => {
    const { container } = render(
      <Markdown text={'<img src="x" onerror="alert(1)"> und [böse](javascript:alert(1))'} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<img src="x"');
    expect(screen.queryByRole("link", { name: "böse" })).toBeNull();
  });
});

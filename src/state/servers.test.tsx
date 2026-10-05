import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServerProvider, useServers } from "./servers.tsx";

function Probe() {
  const { servers } = useServers();
  return <div data-testid="count">{servers.length}</div>;
}

describe("ServerProvider", () => {
  it("renders with empty server list by default", () => {
    localStorage.clear();
    render(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });
});

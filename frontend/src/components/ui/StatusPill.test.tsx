import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
  it("shows a text label so state is not conveyed by colour alone", () => {
    render(<StatusPill state="CRITICAL" />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("renders healthy", () => {
    render(<StatusPill state="HEALTHY" />);
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("renders offline", () => {
    render(<StatusPill state="OFFLINE" />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });
});

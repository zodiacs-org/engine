// App (e): the root loaded with a dynamic import on a button click, the
// recipe that keeps the pack out of the first script. In Node (no document)
// it imports at once.
import { report } from "./report.js";

async function draw() {
  const { natalChart } = await import("@zodiacs/engine");
  const chart = natalChart({ utc: "2000-01-01T12:00:00Z", latitude: 51.5, longitude: -0.1 });
  report("e", { bodies: chart.bodies.length, moon: chart.bodies.find((body) => body.body === "moon")?.lon, ephemeris: chart.ephemeris?.name ?? null, flags: chart.flags });
}

if (typeof document === "undefined") {
  await draw();
} else {
  const button = document.createElement("button");
  button.id = "draw";
  button.textContent = "Draw chart";
  button.addEventListener("click", () => {
    performance.mark("click");
    void draw();
  });
  document.body.append(button);
}

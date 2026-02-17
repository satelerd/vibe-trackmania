import "./style.css";
import { VibeTrackGame } from "./core/VibeTrackGame";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("No se encontró #app para montar VibeTrack");
}
const appRoot: HTMLDivElement = root;

async function startGame(): Promise<void> {
  const game = await VibeTrackGame.bootstrap(appRoot);
  game.start();

  window.addEventListener("beforeunload", () => {
    game.stop();
  });
}

void startGame();

import "./style.css";
import { VibeTrackGame } from "./core/VibeTrackGame";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("No se encontró #app para montar VibeTrack");
}

const game = await VibeTrackGame.bootstrap(root);
game.start();

window.addEventListener("beforeunload", () => {
  game.stop();
});
